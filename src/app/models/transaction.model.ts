export type TransactionType = 'buy' | 'sell' | 'dividend' | 'split';

export interface Transaction {
  id: number;
  date: string; // ISO 8601 YYYY-MM-DD
  ticker: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee?: number; // Commission fee in USD (optional, for buy/sell transactions)
  notes: string;
}

export type NewTransaction = Omit<Transaction, 'id'>;
