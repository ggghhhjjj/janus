import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { Transaction } from '../../models/transaction.model';

@Component({
  selector: 'app-swap-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe, CurrencyPipe],
  templateUrl: './swap-modal.html',
  styleUrl: './swap-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwapModalComponent {
  /** Global application state for executing swaps. */
  private readonly state = inject(StateService);

  /** Runtime i18n helper for templates. */
  readonly i18n = inject(I18nService);

  /** Input: all transactions in the current conflict group. */
  @Input() swapGroupTransactions!: Signal<Transaction[]>;

  /** Input: map of transaction IDs to human-friendly display numbers. */
  @Input() transactionNumbers!: Signal<Map<number, number>>;

  /** Input: source transaction ID for the swap (set by parent). */
  @Input() swapSourceId!: Signal<number | null>;

  /** Output: emitted when modal closes. */
  @Output() closed = new EventEmitter<void>();

  /** Target transaction ID selected as swap destination. */
  readonly swapTargetId = signal<number | null>(null);

  /** Focusable row elements inside the modal (source + candidates). */
  @ViewChildren('row', { read: ElementRef }) private rowElements!: QueryList<ElementRef<HTMLElement>>;

  /** Index of the currently focused row. */
  private focusedIndex = 0;

  /** Select a transaction ID as the swap target in the modal. */
  selectSwapTarget(id: number): void {
    this.swapTargetId.set(id);
  }

  /**
   * Confirm and execute a swap of sequence numbers between two transactions.
   * On success, refresh the swap group display; on failure, alert the user.
   */
  async confirmSwap(): Promise<void> {
    const sourceId = this.swapSourceId();
    const targetId = this.swapTargetId();
    if (!sourceId || !targetId) return;
    try {
      await this.state.swapSeqNos(sourceId, targetId);
      // On success, close the modal (clears transient state inside closeSwapModal)
      this.closeSwapModal();
    } catch (err) {
      alert('Failed to swap transactions. Please try again.');
    }
  }

  ngAfterViewInit(): void {
    // Focus the first row when the modal view is ready
    setTimeout(() => this.focusRow(0), 0);
    // If the list of rows changes (re-render), ensure first row is focused
    this.rowElements.changes.subscribe(() => setTimeout(() => this.focusRow(0), 0));
  }

  /** Focus the row at `index` if available. */
  private focusRow(index: number): void {
    const arr = this.rowElements?.toArray() ?? [];
    if (!arr.length) return;
    const idx = Math.max(0, Math.min(index, arr.length - 1));
    const el = arr[idx]?.nativeElement as HTMLElement | undefined;
    if (el) {
      el.focus();
      this.focusedIndex = idx;
    }
  }

  /** Keyboard handler attached to the modal backdrop. */
  handleKeydown(event: KeyboardEvent): void {
    const key = event.key;
    const arr = this.rowElements?.toArray() ?? [];
    if (key === 'Escape') {
      event.preventDefault();
      this.closeSwapModal();
      return;
    }

    if (!arr.length) return;

    let idx = arr.findIndex((item) => item.nativeElement === document.activeElement);
    if (idx === -1) idx = this.focusedIndex;

    if (key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(idx + 1, arr.length - 1);
      this.focusRow(next);
      return;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(idx - 1, 0);
      this.focusRow(prev);
      return;
    }

    if (key === ' ' || key === 'Spacebar') {
      event.preventDefault();
      const el = arr[idx]?.nativeElement as HTMLElement | undefined;
      if (!el) return;
      const txIdAttr = el.getAttribute('data-tx-id');
      if (!txIdAttr) return;
      const id = +txIdAttr;
      if (id !== this.swapSourceId()) this.selectSwapTarget(id);
      return;
    }

    if (key === 'Enter') {
      // If a target is already selected, treat Enter as confirm.
      if (this.swapTargetId()) {
        event.preventDefault();
        void this.confirmSwap();
        return;
      }

      // Otherwise, if focused row is a candidate, select it then confirm.
      const el = arr[idx]?.nativeElement as HTMLElement | undefined;
      if (!el) return;
      const txIdAttr = el.getAttribute('data-tx-id');
      if (!txIdAttr) return;
      const id = +txIdAttr;
      if (id !== this.swapSourceId()) {
        this.selectSwapTarget(id);
        event.preventDefault();
        void this.confirmSwap();
      }
    }
  }

  /** Close the swap modal and clear all transient swap state. */
  closeSwapModal(): void {
    this.swapTargetId.set(null);
    this.closed.emit();
  }

  /** True when a transaction type is a cash movement (funding/withdrawal). */
  isCashTransaction(type: string): boolean {
    return type === 'funding' || type === 'withdrawal';
  }
}

