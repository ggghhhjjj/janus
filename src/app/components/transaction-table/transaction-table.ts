import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { DecimalPipe, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { Transaction } from '../../models/transaction.model';
import { TransactionFormComponent } from '../transaction-form/transaction-form';
import { SwapModalComponent } from '../swap-modal/swap-modal';
import { ActionMenuComponent, ActionMenuItem } from '../action-menu/action-menu';
import { TxTableComponent } from '../shared/tx-table/tx-table';
import { toSignal } from '@angular/core/rxjs-interop';
import { CordovaService } from '../../cordova.service';
import { CsvParserService, ExportLabels } from '../../services/csv-parser.service';

type SortColumn = 'date' | 'ticker' | 'quantity' | 'price' | 'fee';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-transaction-table',
  standalone: true,
  imports: [DecimalPipe, CurrencyPipe, TransactionFormComponent, SwapModalComponent, ActionMenuComponent, TxTableComponent],
  templateUrl: './transaction-table.html',
  styleUrl: './transaction-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
  /**
   * TransactionTableComponent
   *
   * Business purpose:
   * - Display and manage the application's transaction list with sorting,
   *   editing, deletion, and conflict-resolution (swap sequence numbers).
   * - Provide the primary CRUD surface for transactions and navigation back to
   *   the dashboard while coordinating transient UI state (modals, highlights).
   *
   * Responsibilities:
   * - Expose a sorted view of transactions (`sorted`) and lightweight UI state
   *   signals used by templates (modal visibility, editing state, swap UI).
   * - Delegate persistence and sequence-swapping operations to `StateService`.
   */
  export class TransactionTableComponent implements OnDestroy {
    /** Global application state for reading and mutating transactions. */
    private readonly state = inject(StateService);

    /** Router used for navigation (dashboard, transaction screens). */
    private readonly router = inject(Router);

    /** Signal-wrapped observable of all transactions for reactive templates. */
    private readonly allTransactions = toSignal(this.state.transactions$, { initialValue: [] });

    /** Runtime i18n helper for templates. */
    readonly i18n = inject(I18nService);

    /** Number of transactions currently in the list. */
    readonly transactionCount = computed(() => this.allTransactions().length);

    /** Current active sort column and direction for the table. */
    readonly sortColumn = signal<SortColumn>('date');
    readonly sortDir = signal<SortDir>('desc');

    /**
     * Computed sorted transactions array. Applies specialized date tie-breakers
     * and supports other column sorts while preserving the user-requested
     * directionality.
     */
    readonly sorted = computed(() => {
      const col = this.sortColumn();
      const dir = this.sortDir();
      return [...this.allTransactions()].sort((a, b) => {
        let cmp = 0;
        if (col === 'date') {
          // Primary sort by date DESC (applied regardless of dir to match default user expectation)
          cmp = a.date.localeCompare(b.date);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
          // Tie-break: time ASC, seqNo ASC, id ASC
          if (a.time !== b.time) return a.time.localeCompare(b.time);
          const aSeqNo = a.seqNo ?? 0;
          const bSeqNo = b.seqNo ?? 0;
          if (aSeqNo !== bSeqNo) return aSeqNo - bSeqNo;
          return a.id - b.id;
        } else {
          // Other columns: apply normal sort direction
          if (col === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
          else if (col === 'quantity') cmp = a.quantity - b.quantity;
          else if (col === 'price') cmp = a.price - b.price;
          else if (col === 'fee') cmp = (a.fee ?? 0) - (b.fee ?? 0);
          return dir === 'asc' ? cmp : -cmp;
        }
      });
    });

    // Modal state
    /** Whether the add/edit transaction form modal is open. */
    readonly formOpen = signal(false);
    /** Transaction currently being edited, or `null` when adding. */
    readonly editingTransaction = signal<Transaction | null>(null);

    // Swap modal state
    /** Whether the swap (conflict-resolution) modal is visible. */
    readonly swapModalOpen = signal(false);
    /** Transactions belonging to the currently selected conflict group. */
    readonly swapGroupTransactions = signal<Transaction[]>([]);
    /** Source transaction id for swapping sequence numbers. */
    readonly swapSourceId = signal<number | null>(null);

    // Drag-and-drop state for conflict row reordering
    /** ID of the currently dragged transaction (if any). */
    readonly draggedTransactionId = signal<number | null>(null);
    /** ID of the current drop target transaction (if any). */
    readonly dropTargetTransactionId = signal<number | null>(null);
    /** Timestamp of touchstart; used to detect tap-and-hold gesture (500ms threshold). */
    private touchStartTime: number | null = null;
    /** Touch position at start; used to detect if user moved during tap-and-hold. */
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    /** Whether a touch drag is currently active. */
    private isTouchDragging: boolean = false;
    
    /** Cordova service for device event access (deviceready/backbutton). */
    private readonly cordova = inject(CordovaService);
  private readonly csvParser = inject(CsvParserService);

    /** Handler for Cordova 'backbutton' events. */
    private readonly backButtonHandler = (ev: Event) => {
      if (!this.showBackButton()) return;
      ev.preventDefault();
      this.navigateBackToDashboard();
    };

    /** Handler for keyboard events (Escape / Backspace) to trigger back. */
    private readonly keydownHandler = (ev: KeyboardEvent) => {
      if (!this.showBackButton()) return;
      // Don't steal Escape from open modals — let them close first.
      if (this.formOpen() || this.swapModalOpen()) return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return; // don't hijack typing
      }
      if (ev.key === 'Escape' || ev.key === 'Backspace') {
        ev.preventDefault();
        this.navigateBackToDashboard();
      }
    };

    // Double-tap state for mobile edit
    /** Timestamp of the last tap; used to detect double-tap within 300ms. */
    private lastTapTime: number | null = null;
    /** Transaction ID of the last tap; used to verify double-tap is on the same row. */
    private lastTapTxId: number | null = null;

    // Navigation / highlight (exposed from StateService for template)
    /** ID of the highlighted transaction (used by templates to focus a row). */
    readonly highlightedTransactionId = this.state.highlightedTransactionId;
    /** Map of human-friendly transaction numbers used by templates. */
    readonly transactionNumbers = this.state.transactionNumbers;
    /** Set of transaction IDs that are flagged as conflicts. */
    readonly conflictTransactionIds = this.state.conflictTransactionIds;
    /** Whether to show a back button when a transaction is highlighted. */
    readonly showBackButton = computed(() => this.highlightedTransactionId() != null);

    /**
     * Helper to get all transaction IDs in the same conflict group as the given transaction.
     * A conflict group is defined by matching date + time + ticker.
     */
    getConflictGroupForTransaction(tx: Transaction): Set<number> {
      const groupKey = `${tx.date}|${tx.time}|${tx.ticker}`;
      return new Set(
        this.allTransactions()
          .filter((t) => `${t.date}|${t.time}|${t.ticker}` === groupKey)
          .map((t) => t.id)
      );
    }

    /**
     * Check if a transaction is a valid drop target for the currently dragged transaction.
     * Valid means: target is in the same conflict group and is not the dragged row itself.
     */
    isValidDropTarget(tx: Transaction): boolean {
      const draggedId = this.draggedTransactionId();
      if (draggedId == null) return false;
      if (tx.id === draggedId) return false;
      // Find the dragged transaction to get its conflict group
      const draggedTx = this.allTransactions().find((t) => t.id === draggedId);
      if (!draggedTx) return false;
      const groupKey = `${draggedTx.date}|${draggedTx.time}|${draggedTx.ticker}`;
      return `${tx.date}|${tx.time}|${tx.ticker}` === groupKey;
    }

    constructor() {
      // Scroll to the highlighted row after Angular renders
      effect(() => {
        const id = this.highlightedTransactionId();
        if (id == null) return;
        setTimeout(() => {
          document.querySelector<HTMLElement>(`[data-tx-id="${id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
      // Global keyboard listener: support Escape / Backspace to trigger back
      window.addEventListener('keydown', this.keydownHandler);

      // Cordova hardware back button: attach after deviceready
      this.cordova.deviceReady$.subscribe(() => {
        document.addEventListener('backbutton', this.backButtonHandler);
      });
    }

    ngOnDestroy(): void {
      window.removeEventListener('keydown', this.keydownHandler as EventListener);
      document.removeEventListener('backbutton', this.backButtonHandler);
    }

    /** Toggle sorting for a column; reverses direction when selecting same column. */
    sort(col: SortColumn): void {
      if (this.sortColumn() === col) {
        this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        this.sortColumn.set(col);
        this.sortDir.set('asc');
      }
    }

    /** Return a simple glyph representing sort state for column headers. */
    sortIcon(col: SortColumn): string {
      if (this.sortColumn() !== col) return '↕';
      return this.sortDir() === 'asc' ? '↑' : '↓';
    }

    /** True when a transaction type is a cash movement (funding/withdrawal). */
    isCashTransaction(type: string): boolean {
      return type === 'funding' || type === 'withdrawal';
    }

    /** Open the add-transaction modal. */
    openAdd(): void {
      this.editingTransaction.set(null);
      this.formOpen.set(true);
    }

    /** Open the edit modal for the provided transaction. */
    openEdit(tx: Transaction): void {
      this.editingTransaction.set(tx);
      this.formOpen.set(true);
    }

    /** Delete a transaction after user confirmation. */
    async onDelete(tx: Transaction): Promise<void> {
      const confirmed = window.confirm(
        `Delete transaction: ${this.i18n.translate(tx.type)} ${tx.quantity} ${tx.ticker} on ${tx.date}?`
      );
      if (!confirmed) return;
      await this.state.deleteTransaction(tx.id);
    }

    /** Close form modal after save and clear editing state. */
    onFormSaved(): void {
      this.formOpen.set(false);
      this.editingTransaction.set(null);
    }

    /** Close form modal without saving and clear editing state. */
    onFormCancelled(): void {
      this.formOpen.set(false);
      this.editingTransaction.set(null);
    }

    /**
     * Navigate back to the dashboard from a focused transaction view, carrying
     * a transient highlight into the FIFO matching view for cross-reference.
     */
    navigateBackToDashboard(): void {
      const id = this.state.highlightedTransactionId();
      this.state.highlightedMatchingTransactionId.set(id);
      this.state.highlightedTransactionId.set(null);
      this.router.navigate(['/']);
    }

    /** Build the action menu items for the given transaction row. */
    getMenuItems(tx: Transaction, isConflict: boolean): ActionMenuItem[] {
      const items: ActionMenuItem[] = [];
      if (isConflict) {
        items.push({
          label: this.i18n.translate('reorderButton'),
          ariaLabel: `${this.i18n.translate('reorderButton')} ${this.i18n.translate('transactions')} ${tx.id}`,
          action: () => this.openSwapModal(tx),
        });
      }
      items.push({
        label: this.i18n.translate('editButton'),
        ariaLabel: `${this.i18n.translate('editButton')} ${this.i18n.translate('transactions')} ${tx.id}`,
        action: () => this.openEdit(tx),
      });
      items.push({
        label: this.i18n.translate('deleteButton'),
        ariaLabel: `${this.i18n.translate('deleteButton')} ${this.i18n.translate('transactions')} ${tx.id}`,
        danger: true,
        action: () => this.onDelete(tx),
      });
      return items;
    }

    /**
     * Open the swap modal for conflict resolution by collecting the group of
     * transactions that share date/time/ticker and preparing the swap UI.
     */
    openSwapModal(tx: Transaction): void {
      // Collect all transactions in the same conflict group (date + time + ticker)
      const groupKey = `${tx.date}|${tx.time}|${tx.ticker}`;
      const group = this.allTransactions().filter(
        (t) => `${t.date}|${t.time}|${t.ticker}` === groupKey
      );
      // Sort by seqNo/id for display
      const sorted = [...group].sort((a, b) => {
        const aSeqNo = a.seqNo ?? 0;
        const bSeqNo = b.seqNo ?? 0;
        if (aSeqNo !== bSeqNo) return aSeqNo - bSeqNo;
        return a.id - b.id;
      });
      this.swapGroupTransactions.set(sorted);
      this.swapSourceId.set(tx.id);
      this.swapModalOpen.set(true);
    }

    /** Close the swap modal and clear all transient swap state. */
    closeSwapModal(): void {
      this.swapModalOpen.set(false);
      this.swapGroupTransactions.set([]);
      this.swapSourceId.set(null);
    }

    /**
     * Handle dragstart event for conflict rows.
     * Marks the row as being dragged and stores its ID in the DataTransfer for drop validation.
     */
    onDragStart(tx: Transaction, event: DragEvent): void {
      if (!this.conflictTransactionIds().has(tx.id)) return;
      this.draggedTransactionId.set(tx.id);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tx.id.toString());
      }
    }

    /**
     * Handle dragover event on potential drop targets.
     * Validates if the target is in the same conflict group and updates visual feedback.
     */
    onDragOver(tx: Transaction, event: DragEvent): void {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = this.isValidDropTarget(tx) ? 'move' : 'none';
      }
      // Update drop target feedback
      if (this.isValidDropTarget(tx)) {
        this.dropTargetTransactionId.set(tx.id);
      }
    }

    /**
     * Handle dragleave event to clear drop target feedback.
     */
    onDragLeave(event: DragEvent): void {
      event.preventDefault();
      event.stopPropagation();
      // Only clear if leaving the entire table; check if relatedTarget is outside
      const target = event.relatedTarget as HTMLElement | null;
      if (target && !target.closest('[data-tx-id]')) {
        this.dropTargetTransactionId.set(null);
      }
    }

    /**
     * Handle drop event to execute the swap.
     * Extracts the dragged transaction ID from DataTransfer and calls StateService.swapSeqNos().
     */
    async onDrop(tx: Transaction, event: DragEvent): Promise<void> {
      event.preventDefault();
      event.stopPropagation();
      const draggedIdStr = event.dataTransfer?.getData('text/plain');
      const draggedId = draggedIdStr ? parseInt(draggedIdStr, 10) : null;
      if (draggedId == null || !this.isValidDropTarget(tx)) {
        this.clearDragState();
        return;
      }
      try {
        await this.state.swapSeqNos(draggedId, tx.id);
      } catch (error) {
        console.error('Failed to swap sequence numbers:', error);
      } finally {
        this.clearDragState();
      }
    }

    /**
     * Handle dragend event to clear all drag state.
     */
    onDragEnd(event: DragEvent): void {
      event.preventDefault();
      event.stopPropagation();
      this.clearDragState();
    }

    /**
     * Helper to clear all drag-and-drop state signals.
     */
    private clearDragState(): void {
      this.draggedTransactionId.set(null);
      this.dropTargetTransactionId.set(null);
      this.isTouchDragging = false;
      this.touchStartTime = null;
      this.touchStartX = 0;
      this.touchStartY = 0;
    }

    /**
     * Handle touchstart event on conflict rows for mobile drag-and-drop.
     * Initiates a 500ms tap-and-hold timer; if user holds without moving, drag begins.
     */
    onTouchStart(tx: Transaction, event: TouchEvent): void {
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      // DnD hold timer only applies to conflict rows.
      if (!this.conflictTransactionIds().has(tx.id)) return;
      this.touchStartTime = Date.now();
    }

    /**
     * Handle touchmove event during a potential tap-and-hold drag.
     * Detects movement during the 500ms hold window; if moved, cancel drag.
     * Once hold window expires, finds element under touch point and updates drop target.
     */
    onTouchMove(event: TouchEvent): void {
      if (this.touchStartTime == null) return;
      const touch = event.touches[0];
      const moveDistance = Math.sqrt(
        Math.pow(touch.clientX - this.touchStartX, 2) +
          Math.pow(touch.clientY - this.touchStartY, 2)
      );
      const elapsedMs = Date.now() - this.touchStartTime;
      // If moved too far before 500ms, cancel drag
      if (elapsedMs < 500 && moveDistance > 10) {
        this.clearDragState();
        return;
      }
      // After 500ms, mark as dragging and find drop target under finger
      if (elapsedMs >= 500 && !this.isTouchDragging) {
        this.draggedTransactionId.set(this.getDraggedIdFromTouchStart());
        this.isTouchDragging = true;
      }
      if (this.isTouchDragging) {
        const elementAtTouch = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
        const rowElement = elementAtTouch?.closest('[data-tx-id]') as HTMLElement | null;
        if (rowElement) {
          const targetId = rowElement.getAttribute('data-tx-id');
          if (targetId) {
            const targetTx = this.allTransactions().find((t) => t.id === parseInt(targetId, 10));
            if (targetTx && this.isValidDropTarget(targetTx)) {
              this.dropTargetTransactionId.set(targetTx.id);
            } else {
              this.dropTargetTransactionId.set(null);
            }
          }
        } else {
          this.dropTargetTransactionId.set(null);
        }
      }
    }

    /**
     * Handle touchend event to execute the swap, detect double-tap for edit, or cancel if no valid target.
     */
    async onTouchEnd(tx: Transaction, event: TouchEvent): Promise<void> {
      // If a drag is in progress, execute the swap.
      if (this.isTouchDragging) {
        const draggedId = this.draggedTransactionId();
        const targetId = this.dropTargetTransactionId();
        if (draggedId != null && targetId != null) {
          try {
            await this.state.swapSeqNos(draggedId, targetId);
          } catch (error) {
            console.error('Failed to swap sequence numbers:', error);
          }
        }
        this.clearDragState();
        return;
      }
      // No drag in progress; check for double-tap to open edit modal.
      // Double-tap is detected if: (1) previous tap was on the same row, (2) within 300ms, and (3) no significant movement.
      const now = Date.now();
      const moveDistance = Math.sqrt(
        Math.pow(event.changedTouches[0].clientX - this.touchStartX, 2) +
          Math.pow(event.changedTouches[0].clientY - this.touchStartY, 2)
      );
      const isDoubleTap =
        this.lastTapTxId === tx.id &&
        this.lastTapTime != null &&
        now - this.lastTapTime < 300 &&
        moveDistance < 10;

      if (isDoubleTap) {
        this.lastTapTime = null;
        this.lastTapTxId = null;
        this.openEdit(tx);
      } else {
        this.lastTapTime = now;
        this.lastTapTxId = tx.id;
        // Clear the tap after 300ms if no second tap occurs.
        setTimeout(() => {
          if (this.lastTapTime === now) {
            this.lastTapTime = null;
            this.lastTapTxId = null;
          }
        }, 300);
      }
      this.clearDragState();
    }

    /**
     * Helper to retrieve the dragged transaction ID from the initial touchstart.
     * Scans all transactions for one matching the touchStartX, touchStartY coordinates.
     */
    private getDraggedIdFromTouchStart(): number | null {
      const elementAtStart = document.elementFromPoint(this.touchStartX, this.touchStartY) as HTMLElement | null;
      const rowElement = elementAtStart?.closest('[data-tx-id]') as HTMLElement | null;
      if (rowElement) {
        const id = rowElement.getAttribute('data-tx-id');
        return id ? parseInt(id, 10) : null;
      }
      return null;
    }

  exportCsv(): void {
    const labels: ExportLabels = {
      headers: {
        date: this.i18n.translate('tableHeaderDate'),
        time: this.i18n.translate('tableHeaderTime'),
        ticker: this.i18n.translate('tableHeaderTicker'),
        type: this.i18n.translate('tableHeaderType'),
        quantity: this.i18n.translate('tableHeaderQuantity'),
        price: this.i18n.translate('tableHeaderPrice'),
        fee: this.i18n.translate('feeLabel'),
        notes: this.i18n.translate('tableHeaderNotes'),
        currency: this.i18n.translate('tableHeaderCurrency'),
      },
      typeLabels: {
        buy: this.i18n.translate('buy'),
        sell: this.i18n.translate('sell'),
        dividend: this.i18n.translate('dividend'),
        split: this.i18n.translate('split'),
        funding: this.i18n.translate('funding'),
        withdrawal: this.i18n.translate('withdrawal'),
      },
    };
    const csvContent = this.csvParser.exportGenericCsv(this.sorted(), labels);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
