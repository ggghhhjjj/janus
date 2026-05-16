import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { Signal } from '@angular/core';
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
      // Reset target, keep modal open for more swaps
      this.swapTargetId.set(null);
    } catch (err) {
      alert('Failed to swap transactions. Please try again.');
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

