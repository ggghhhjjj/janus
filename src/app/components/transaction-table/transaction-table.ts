import {
  ChangeDetectionStrategy,
  Component,
  computed,  inject,  signal,
} from '@angular/core';
import { TitleCasePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import { StateService } from '../../services/state.service';
import { Transaction } from '../../models/transaction.model';
import { TransactionFormComponent } from '../transaction-form/transaction-form';
import { toSignal } from '@angular/core/rxjs-interop';

const PAGE_SIZE = 50;

type SortColumn = 'date' | 'ticker' | 'type' | 'quantity' | 'price';
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
  private readonly allTransactions = toSignal(this.state.transactions$, { initialValue: [] });

  readonly transactionCount = computed(() => this.allTransactions().length);

  readonly sortColumn = signal<SortColumn>('date');
  readonly sortDir = signal<SortDir>('asc');
  readonly currentPage = signal(1);

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
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));

  readonly pageItems = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  // Modal state
  readonly formOpen = signal(false);
  readonly editingTransaction = signal<Transaction | null>(null);



  sort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(col);
      this.sortDir.set('asc');
    }
    this.currentPage.set(1);
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

  prevPage(): void {
    this.currentPage.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.currentPage.update((p) => Math.min(this.totalPages(), p + 1));
  }
}
