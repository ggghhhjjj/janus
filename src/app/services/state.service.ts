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

  // Stable sequential number for each transaction (1-based, sorted by date asc → time asc → seqNo asc → id asc)
  private readonly _txSignal = toSignal(this._transactions$, { initialValue: [] as Transaction[] });
  readonly transactionNumbers = computed<Map<number, number>>(() => {
    const sorted = [...this._txSignal()].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      const aSeqNo = a.seqNo ?? 0;
      const bSeqNo = b.seqNo ?? 0;
      if (aSeqNo !== bSeqNo) return aSeqNo - bSeqNo;
      return a.id - b.id;
    });
    const map = new Map<number, number>();
    sorted.forEach((tx, i) => map.set(tx.id, i + 1));
    return map;
  });

  // Identify all transaction IDs that belong to a conflict group (2+ transactions with same date+time+ticker)
  readonly conflictTransactionIds = computed<Set<number>>(() => {
    const txList = this._txSignal();
    const groupKey = (tx: Transaction) => `${tx.date}|${tx.time}|${tx.ticker}`;
    const groups = new Map<string, Transaction[]>();
    txList.forEach((tx) => {
      const key = groupKey(tx);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    });
    const conflicts = new Set<number>();
    groups.forEach((group) => {
      if (group.length >= 2) {
        group.forEach((tx) => conflicts.add(tx.id));
      }
    });
    return conflicts;
  });

  // Cross-view navigation highlight state
  readonly highlightedTransactionId = signal<number | null>(null);
  readonly highlightedMatchingTransactionId = signal<number | null>(null);

  // Broker account balance: sum of (funding - withdrawal - fees) grouped by currency
  readonly brokerAccountBalances = computed<Map<string, number>>(() => {
    const txList = this._txSignal();
    const balances = new Map<string, number>();

    for (const tx of txList) {
      if (tx.type !== 'funding' && tx.type !== 'withdrawal') continue;

      const currency = tx.currency || 'USD';
      const current = balances.get(currency) ?? 0;
      let delta = 0;

      if (tx.type === 'funding') {
        delta = tx.quantity;
      } else if (tx.type === 'withdrawal') {
        delta = -tx.quantity;
      }

      // Subtract fees from balance
      const fee = tx.fee ?? 0;
      balances.set(currency, current + delta - fee);
    }

    return balances;
  });

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

  async swapSeqNos(id1: number, id2: number): Promise<void> {
    const tx1 = this._transactions$.value.find((t) => t.id === id1);
    const tx2 = this._transactions$.value.find((t) => t.id === id2);
    if (!tx1 || !tx2) throw new Error('One or both transactions not found');
    if (tx1.date !== tx2.date || tx1.time !== tx2.time || tx1.ticker !== tx2.ticker) {
      throw new Error('Transactions must be in the same conflict group (same date+time+ticker)');
    }

    // Collect all transactions in the same group
    const groupKey = `${tx1.date}|${tx1.time}|${tx1.ticker}`;
    const group = this._transactions$.value.filter(
      (t) => `${t.date}|${t.time}|${t.ticker}` === groupKey
    );

    // Check if any need auto-assigned seqNo; if so, assign sequentially by id order
    const needsAssignment = group.some((t) => t.seqNo === undefined);
    if (needsAssignment) {
      const sorted = [...group].sort((a, b) => a.id - b.id);
      sorted.forEach((t, i) => {
        if (t.seqNo === undefined) t.seqNo = i + 1;
      });
    }

    // Swap the seqNos of id1 and id2
    const temp = tx1.seqNo;
    tx1.seqNo = tx2.seqNo;
    tx2.seqNo = temp;

    // Update both transactions in the database
    await this.db.update(tx1);
    await this.db.update(tx2);

    // Update local state
    const list = this._transactions$.value.map((t) =>
      t.id === id1 ? tx1 : t.id === id2 ? tx2 : t
    );
    this._transactions$.next(list);
    this._recalculate(list);
  }

  private _recalculate(transactions: Transaction[]): void {
    const state = this.fifo.calculate(transactions);
    this._fifoState$.next(state);
  }
}
