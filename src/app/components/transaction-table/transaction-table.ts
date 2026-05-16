import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TitleCasePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { Transaction } from '../../models/transaction.model';
import { TransactionFormComponent } from '../transaction-form/transaction-form';
import { SwapModalComponent } from '../swap-modal/swap-modal';
import { toSignal } from '@angular/core/rxjs-interop';

type SortColumn = 'date' | 'ticker' | 'type' | 'quantity' | 'price' | 'fee';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-transaction-table',
  standalone: true,
  imports: [TitleCasePipe, DecimalPipe, CurrencyPipe, TransactionFormComponent, SwapModalComponent],
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
  export class TransactionTableComponent {
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
          else if (col === 'type') cmp = a.type.localeCompare(b.type);
          else if (col === 'quantity') cmp = a.quantity - b.quantity;
          else if (col === 'price') cmp = a.price - b.price;
          else if (col === 'fee') cmp = (a.fee ?? 0) - (b.fee ?? 0);
          return dir === 'asc' ? cmp : -cmp;
        }
      });
    });

    // Action menu state
    /** Transaction ID whose action menu is currently open, or `null` if no menu is open. */
    readonly menuOpenForTxId = signal<number | null>(null);
    /** Computed: true if the action menu for a specific transaction is open. */
    readonly isActionMenuOpen = (txId: number) => computed(() => this.menuOpenForTxId() === txId);
    /** Menu position styles for dynamic positioning to keep within viewport. */
    readonly menuPosition = signal<{ top: string; left: string } | null>(null);

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

    // Navigation / highlight (exposed from StateService for template)
    /** ID of the highlighted transaction (used by templates to focus a row). */
    readonly highlightedTransactionId = this.state.highlightedTransactionId;
    /** Map of human-friendly transaction numbers used by templates. */
    readonly transactionNumbers = this.state.transactionNumbers;
    /** Set of transaction IDs that are flagged as conflicts. */
    readonly conflictTransactionIds = this.state.conflictTransactionIds;
    /** Whether to show a back button when a transaction is highlighted. */
    readonly showBackButton = computed(() => this.highlightedTransactionId() != null);

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
      this.closeActionMenu();
    }

    /** Delete a transaction after user confirmation. */
    async onDelete(tx: Transaction): Promise<void> {
      this.closeActionMenu();
      const confirmed = window.confirm(
        `Delete transaction: ${tx.type.toUpperCase()} ${tx.quantity} ${tx.ticker} on ${tx.date}?`
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

    /** Toggle the action menu for the given transaction. */
    toggleActionMenu(txId: number): void {
      const current = this.menuOpenForTxId();
      if (current === txId) {
        this.menuOpenForTxId.set(null);
        this.menuPosition.set(null);
      } else {
        this.menuOpenForTxId.set(txId);
        // Schedule positioning calculation after DOM update
        setTimeout(() => this.calculateMenuPosition(txId), 0);
      }
    }

    /** Calculate and update the menu position to keep it within viewport. */
    private calculateMenuPosition(txId: number): void {
      // Find the menu button for this transaction
      const button = document.querySelector(`[data-tx-id="${txId}"] .num-cell__menu-btn`) as HTMLElement;
      if (!button) return;

      const row = document.querySelector(`[data-tx-id="${txId}"]`) as HTMLElement;
      if (!row) return;

      const buttonRect = button.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const menuWidth = 120; // min-width of .num-cell__menu
      const menuHeight = 140; // estimated height: 2-3 items * 38px + padding
      const menuMargin = 4; // small margin from viewport edge
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Calculate vertical position: prefer below button, position at row's bottom if not enough space
      let menuTop = buttonRect.bottom + 4; // 4px below button
      if (menuTop + menuHeight + menuMargin > viewportHeight) {
        // Not enough space below, position near the row's bottom edge instead
        menuTop = rowRect.bottom - menuHeight - 4;
      }

      // Calculate horizontal position: try to position to the right, adjust if it would overflow
      let menuLeft = buttonRect.right - 10; // Start from button's right edge minus 10px
      const rightEdge = menuLeft + menuWidth + menuMargin;

      if (rightEdge > viewportWidth) {
        // Would overflow on the right, position to the left instead
        menuLeft = Math.max(menuMargin, buttonRect.left - menuWidth);
      }

      this.menuPosition.set({
        top: `${menuTop}px`,
        left: `${menuLeft}px`,
      });
    }

    /** Close the action menu. */
    closeActionMenu(): void {
      this.menuOpenForTxId.set(null);
      this.menuPosition.set(null);
    }

    /** Handle keyboard navigation for the action menu. */
    onActionMenuKeydown(event: KeyboardEvent, txId: number, tx: Transaction, isConflict: boolean, menuItems: number): void {
      const isOpen = this.menuOpenForTxId() === txId;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!isOpen) {
          this.menuOpenForTxId.set(txId);
          // Schedule positioning calculation after DOM update
          setTimeout(() => this.calculateMenuPosition(txId), 0);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeActionMenu();
      }
    }

    /**
     * Open the swap modal for conflict resolution by collecting the group of
     * transactions that share date/time/ticker and preparing the swap UI.
     */
    openSwapModal(tx: Transaction): void {
      this.closeActionMenu();
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
  }
