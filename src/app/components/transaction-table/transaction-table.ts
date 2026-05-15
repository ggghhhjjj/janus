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
import { toSignal } from '@angular/core/rxjs-interop';

type SortColumn = 'date' | 'ticker' | 'type' | 'quantity' | 'price' | 'fee';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-transaction-table',
  standalone: true,
  imports: [TitleCasePipe, DecimalPipe, CurrencyPipe, TransactionFormComponent],
  templateUrl: './transaction-table.html',
  styleUrl: './transaction-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionTableComponent {
  private readonly state = inject(StateService);
  private readonly router = inject(Router);
  private readonly allTransactions = toSignal(this.state.transactions$, { initialValue: [] });
  readonly i18n = inject(I18nService);

  readonly transactionCount = computed(() => this.allTransactions().length);

  readonly sortColumn = signal<SortColumn>('date');
  readonly sortDir = signal<SortDir>('desc');

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

  // Modal state
  readonly formOpen = signal(false);
  readonly editingTransaction = signal<Transaction | null>(null);

  // Swap modal state
  readonly swapModalOpen = signal(false);
  readonly swapGroupTransactions = signal<Transaction[]>([]);
  readonly swapSourceId = signal<number | null>(null);
  readonly swapTargetId = signal<number | null>(null);

  // Navigation / highlight (exposed from StateService for template)
  readonly highlightedTransactionId = this.state.highlightedTransactionId;
  readonly transactionNumbers = this.state.transactionNumbers;
  readonly conflictTransactionIds = this.state.conflictTransactionIds;
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

  sort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(col);
      this.sortDir.set('asc');
    }
  }

  sortIcon(col: SortColumn): string {
    if (this.sortColumn() !== col) return '↕';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  isCashTransaction(type: string): boolean {
    return type === 'funding' || type === 'withdrawal';
  }

  openAdd(): void {
    this.editingTransaction.set(null);
    this.formOpen.set(true);
  }

  openEdit(tx: Transaction): void {
    this.editingTransaction.set(tx);
    this.formOpen.set(true);
  }

  async onDelete(tx: Transaction): Promise<void> {
    const confirmed = window.confirm(
      `Delete transaction: ${tx.type.toUpperCase()} ${tx.quantity} ${tx.ticker} on ${tx.date}?`
    );
    if (!confirmed) return;
    await this.state.deleteTransaction(tx.id);
  }

  onFormSaved(): void {
    this.formOpen.set(false);
    this.editingTransaction.set(null);
  }

  onFormCancelled(): void {
    this.formOpen.set(false);
    this.editingTransaction.set(null);
  }

  navigateBackToDashboard(): void {
    const id = this.state.highlightedTransactionId();
    this.state.highlightedMatchingTransactionId.set(id);
    this.state.highlightedTransactionId.set(null);
    this.router.navigate(['/']);
  }

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
    this.swapTargetId.set(null);
    this.swapModalOpen.set(true);
  }

  selectSwapTarget(id: number): void {
    this.swapTargetId.set(id);
  }

  async confirmSwap(): Promise<void> {
    const sourceId = this.swapSourceId();
    const targetId = this.swapTargetId();
    if (!sourceId || !targetId) return;
    try {
      await this.state.swapSeqNos(sourceId, targetId);
      // Refresh the conflict group display
      const source = this.allTransactions().find((t) => t.id === sourceId);
      if (source) {
        const groupKey = `${source.date}|${source.time}|${source.ticker}`;
        const group = this.allTransactions().filter(
          (t) => `${t.date}|${t.time}|${t.ticker}` === groupKey
        );
        const sorted = [...group].sort((a, b) => {
          const aSeqNo = a.seqNo ?? 0;
          const bSeqNo = b.seqNo ?? 0;
          if (aSeqNo !== bSeqNo) return aSeqNo - bSeqNo;
          return a.id - b.id;
        });
        this.swapGroupTransactions.set(sorted);
      }
      // Reset target, keep modal open for more swaps
      this.swapTargetId.set(null);
    } catch (err) {
      alert('Failed to swap transactions. Please try again.');
    }
  }

  closeSwapModal(): void {
    this.swapModalOpen.set(false);
    this.swapGroupTransactions.set([]);
    this.swapSourceId.set(null);
    this.swapTargetId.set(null);
  }
}
