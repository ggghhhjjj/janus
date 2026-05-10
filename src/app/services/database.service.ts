import { Injectable } from '@angular/core';
import { Transaction, NewTransaction } from '../models/transaction.model';

const DB_NAME = 'fifo-accounter';
const DB_VERSION = 1;
const STORE_TRANSACTIONS = 'transactions';
const STORE_SETTINGS = 'settings';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private db: IDBDatabase | null = null;

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORE_TRANSACTIONS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          txStore.createIndex('ticker', 'ticker', { unique: false });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('type', 'type', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private getDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  getAll(): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
      const tx = this.getDb().transaction(STORE_TRANSACTIONS, 'readonly');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as Transaction[]);
      request.onerror = () => reject(request.error);
    });
  }

  add(newTx: NewTransaction): Promise<Transaction> {
    return new Promise((resolve, reject) => {
      const tx = this.getDb().transaction(STORE_TRANSACTIONS, 'readwrite');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.add(newTx);

      request.onsuccess = () => {
        resolve({ ...newTx, id: request.result as number });
      };
      request.onerror = () => reject(request.error);
    });
  }

  update(transaction: Transaction): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDb().transaction(STORE_TRANSACTIONS, 'readwrite');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.put(transaction);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  delete(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDb().transaction(STORE_TRANSACTIONS, 'readwrite');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
