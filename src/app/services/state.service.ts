import { Injectable, computed, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Transaction, NewTransaction } from '../models/transaction.model';
import { FifoState } from '../models/fifo.model';
import { DatabaseService } from './database.service';
import { FifoService } from './fifo.service';

@Injectable({ providedIn: 'root' })
export class StateService {
  private readonly _transactions$ = new BehaviorSubject<Transaction[]>([]);
  private readonly _fifoState$ = new BehaviorSubject<FifoState | null>(null);

  readonly transactions$ = this._transactions$.asObservable();
  readonly fifoState$ = this._fifoState$.asObservable();

  // Stable sequential number for each transaction (1-based, sorted by date asc)
  private readonly _txSignal = toSignal(this._transactions$, { initialValue: [] as Transaction[] });
  readonly transactionNumbers = computed<Map<number, number>>(() => {
    const sorted = [...this._txSignal()].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id
    );
    const map = new Map<number, number>();
    sorted.forEach((tx, i) => map.set(tx.id, i + 1));
    return map;
  });

  // Cross-view navigation highlight state
  readonly highlightedTransactionId = signal<number | null>(null);
  readonly highlightedMatchingTransactionId = signal<number | null>(null);

  constructor(
    private readonly db: DatabaseService,
    private readonly fifo: FifoService
  ) {}

  async init(): Promise<void> {
    await this.db.init();
    const transactions = await this.db.getAll();
    this._transactions$.next(transactions);
    this._recalculate(transactions);
  }

  async addTransaction(newTx: NewTransaction): Promise<void> {
    const saved = await this.db.add(newTx);
    const updated = [...this._transactions$.value, saved];
    this._transactions$.next(updated);
    this._recalculate(updated);
  }

  async editTransaction(id: number, updates: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    const current = this._transactions$.value.find((t) => t.id === id);
    if (!current) throw new Error(`Transaction ${id} not found`);
    const updated = { ...current, ...updates };
    await this.db.update(updated);
    const list = this._transactions$.value.map((t) => (t.id === id ? updated : t));
    this._transactions$.next(list);
    this._recalculate(list);
  }

  async deleteTransaction(id: number): Promise<void> {
    await this.db.delete(id);
    const list = this._transactions$.value.filter((t) => t.id !== id);
    this._transactions$.next(list);
    this._recalculate(list);
  }

  async addTransactions(newTxs: NewTransaction[]): Promise<void> {
    const saved: Transaction[] = [];
    for (const tx of newTxs) {
      saved.push(await this.db.add(tx));
    }
    const updated = [...this._transactions$.value, ...saved];
    this._transactions$.next(updated);
    this._recalculate(updated);
  }

  get transactions(): Transaction[] {
    return this._transactions$.value;
  }

  private _recalculate(transactions: Transaction[]): void {
    const state = this.fifo.calculate(transactions);
    this._fifoState$.next(state);
  }
}
