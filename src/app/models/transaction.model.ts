export type TransactionType = 'buy' | 'sell' | 'dividend' | 'split' | 'funding' | 'withdrawal';

export interface Transaction {
  id: number;
  date: string; // ISO 8601 YYYY-MM-DD
  time: string; // HH:MM:SS.mmm (always present; defaults to 00:00:00.000 if not specified)
  ticker: string;
  type: TransactionType;
  quantity: number;
  price: number;
  currency: string; // ISO 4217 code (e.g., 'USD', 'EUR', 'GBP')
  fee?: number; // Optional fee (applicable for all transaction types)
  notes: string;
  seqNo?: number; // Tie-breaker for reordering within a same date+time+ticker conflict group
}

export type NewTransaction = Omit<Transaction, 'id'>;
