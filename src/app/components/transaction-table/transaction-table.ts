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

  readonly transactionCount = computed(() => this.allTransactions().length);

  readonly sortColumn = signal<SortColumn>('date');
  readonly sortDir = signal<SortDir>('asc');

  readonly sorted = computed(() => {
    const col = this.sortColumn();
    const dir = this.sortDir();
    return [...this.allTransactions()].sort((a, b) => {
      let cmp = 0;
      if (col === 'date') cmp = a.date.localeCompare(b.date);
      else if (col === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
      else if (col === 'type') cmp = a.type.localeCompare(b.type);
      else if (col === 'quantity') cmp = a.quantity - b.quantity;
      else if (col === 'price') cmp = a.price - b.price;
      else if (col === 'fee') cmp = (a.fee ?? 0) - (b.fee ?? 0);
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  // Modal state
  readonly formOpen = signal(false);
  readonly editingTransaction = signal<Transaction | null>(null);

  // Navigation / highlight (exposed from StateService for template)
  readonly highlightedTransactionId = this.state.highlightedTransactionId;
  readonly transactionNumbers = this.state.transactionNumbers;
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
}
