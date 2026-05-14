import { Injectable } from '@angular/core';
import { Transaction, TransactionType, NewTransaction } from '../models/transaction.model';

export type CsvFormat = 'ibkr' | 'degiro' | 'generic' | 'unknown';

export interface ImportResult {
  toImport: NewTransaction[];
  duplicates: NewTransaction[];
}

@Injectable({ providedIn: 'root' })
export class CsvParserService {
  /**
   * RFC 4180 compliant CSV parser.
   * Handles quoted fields, embedded commas, embedded newlines, CRLF/LF/CR.
   */
  parseRaw(csvText: string): string[][] {
    const rows: string[][] = [];
    // Normalise line endings but preserve them inside quoted fields
    let pos = 0;
    const len = csvText.length;

    const parseLine = (): string[] | null => {
      const fields: string[] = [];

      while (pos < len) {
        const ch = csvText[pos];

        if (ch === '"') {
          // Quoted field
          pos++; // skip opening quote
          let field = '';
          while (pos < len) {
            if (csvText[pos] === '"') {
              if (csvText[pos + 1] === '"') {
                // Escaped quote
                field += '"';
                pos += 2;
              } else {
                pos++; // skip closing quote
                break;
              }
            } else {
              field += csvText[pos];
              pos++;
            }
          }
          fields.push(field);
        } else {
          // Unquoted field — read until comma or line ending
          let field = '';
          while (pos < len && csvText[pos] !== ',' && csvText[pos] !== '\n' && csvText[pos] !== '\r') {
            field += csvText[pos];
            pos++;
          }
          fields.push(field.trim());
        }

        if (pos >= len) break;

        if (csvText[pos] === ',') {
          pos++; // consume comma; more fields follow
        } else if (csvText[pos] === '\r') {
          pos++; // consume \r
          if (csvText[pos] === '\n') pos++; // consume \n (CRLF)
          break;
        } else if (csvText[pos] === '\n') {
          pos++; // consume \n
          break;
        }
      }

      return fields;
    };

    while (pos < len) {
      const savedPos = pos;
      const row = parseLine();
      if (pos === savedPos) break; // safety: no progress
      if (row && !(row.length === 1 && row[0] === '')) {
        rows.push(row);
      }
    }

    return rows;
  }

  detectFormat(headers: string[]): CsvFormat {
    const h = headers.map((s) => s.trim().toLowerCase());

    // IBKR: has 'symbol', 'tradedate', 'tradeprice'
    if (h.includes('symbol') && h.includes('tradedate') && h.includes('tradeprice')) {
      return 'ibkr';
    }

    // DEGIRO: has 'isin' or 'product', and has 'aantal' or 'koers' or 'quantity' or 'price'
    if ((h.includes('isin') || h.includes('product')) && (h.includes('aantal') || h.includes('koers') || h.includes('quantity') || h.includes('price'))) {
      return 'degiro';
    }

    // Generic: must have date, (ticker or symbol), type, quantity, price
    if (
      h.includes('date') &&
      (h.includes('ticker') || h.includes('symbol')) &&
      h.includes('type') &&
      h.includes('quantity') &&
      h.includes('price')
    ) {
      return 'generic';
    }

    return 'unknown';
  }

  /**
   * Normalize time to HH:MM:SS.mmm format.
   * Accepts HH:MM:SS, HH:MM:SS.mmm, HH:MM, or empty string.
   * Returns HH:MM:SS.mmm; defaults to 00:00:00.000 if invalid or empty.
   */
  private normalizeTime(raw: string): string {
    if (!raw || !raw.trim()) return '00:00:00.000';
    const match = raw.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/);
    if (!match) return '00:00:00.000';
    const [, h, m, s = '0', ms = '0'] = match;
    const hour = String(parseInt(h)).padStart(2, '0');
    const min = String(parseInt(m)).padStart(2, '0');
    const sec = String(parseInt(s)).padStart(2, '0');
    const msec = String(parseInt(ms)).padStart(3, '0').substring(0, 3);
    return `${hour}:${min}:${sec}.${msec}`;
  }

  normalize(rows: string[][], format: CsvFormat): NewTransaction[] {
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const dataRows = rows.slice(1);
    const results: NewTransaction[] = [];

    const col = (row: string[], name: string): string => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? '').trim() : '';
    };

    const parseDate = (raw: string): string | null => {
      if (!raw) return null;
      // Try YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      // Try MM/DD/YYYY or DD/MM/YYYY → normalise
      const parts = raw.split(/[\/\-\.]/);
      if (parts.length === 3) {
        const [a, b, c] = parts.map(Number);
        // If first segment is 4 digits, it's YYYY
        if (parts[0].length === 4) return `${parts[0]}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        // Assume MM/DD/YYYY
        return `${parts[2]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
      }
      return null;
    };

    for (const row of dataRows) {
      if (row.every((cell) => !cell)) continue; // skip blank rows

      try {
        let rawDate = '';
        let rawTime = '';
        let ticker = '';
        let typeStr = '';
        let quantityStr = '';
        let priceStr = '';
        let feeStr = '';
        let notes = '';

        if (format === 'ibkr') {
          rawDate = col(row, 'tradedate');
          rawTime = col(row, 'tradetime') || col(row, 'time') || '';
          ticker = col(row, 'symbol').toUpperCase();
          const buySell = col(row, 'buysell') || col(row, 'buy/sell');
          typeStr = buySell.toLowerCase().startsWith('b') ? 'buy' : 'sell';
          quantityStr = col(row, 'quantity');
          priceStr = col(row, 'tradeprice');
          feeStr = col(row, 'fee') || col(row, 'commission') || col(row, 'commissionfee') || '';
          notes = col(row, 'description') || col(row, 'notes') || '';
        } else if (format === 'degiro') {
          rawDate = col(row, 'date');
          rawTime = col(row, 'time') || '';
          ticker = (col(row, 'product') || col(row, 'isin')).toUpperCase();
          // DEGIRO doesn't always have a type column; infer from quantity sign
          const rawQty = col(row, 'aantal') || col(row, 'quantity');
          const qtyNum = parseFloat(rawQty.replace(',', '.'));
          typeStr = qtyNum >= 0 ? 'buy' : 'sell';
          quantityStr = String(Math.abs(qtyNum));
          priceStr = col(row, 'koers') || col(row, 'price');
          feeStr = col(row, 'fee') || col(row, 'commission') || col(row, 'cost') || col(row, 'commissionfee') || '';
          notes = col(row, 'omschrijving') || col(row, 'description') || col(row, 'notes') || '';
        } else {
          // generic
          rawDate = col(row, 'date');
          rawTime = col(row, 'time') || '';
          ticker = (col(row, 'ticker') || col(row, 'symbol')).toUpperCase();
          typeStr = col(row, 'type').toLowerCase();
          quantityStr = col(row, 'quantity');
          priceStr = col(row, 'price');
          feeStr = col(row, 'fee') || col(row, 'commission') || col(row, 'cost') || col(row, 'commissionfee') || '';
          notes = col(row, 'notes') || '';
        }

        const date = parseDate(rawDate);
        const time = this.normalizeTime(rawTime);
        const quantity = parseFloat(quantityStr.replace(',', '.'));
        const price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.\-]/g, ''));
        const fee = feeStr ? parseFloat(feeStr.replace(',', '.').replace(/[^0-9.\-]/g, '')) : undefined;
        const type = typeStr as TransactionType;

        if (!date || !ticker || !['buy', 'sell', 'dividend', 'split'].includes(type) || isNaN(quantity) || isNaN(price)) {
          continue; // skip invalid rows silently
        }

        results.push({ date, time, ticker, type, quantity, price, ...(fee && !isNaN(fee) ? { fee } : {}), notes });
      } catch {
        // skip malformed rows
        continue;
      }
    }

    return results;
  }

  findDuplicates(incoming: NewTransaction[], existing: Transaction[]): ImportResult {
    const key = (t: { date: string; ticker: string; type: string; quantity: number; price: number }) =>
      `${t.date}|${t.ticker}|${t.type}|${t.quantity}|${t.price}`;

    const existingKeys = new Set(existing.map(key));

    const toImport: NewTransaction[] = [];
    const duplicates: NewTransaction[] = [];

    for (const tx of incoming) {
      if (existingKeys.has(key(tx))) {
        duplicates.push(tx);
      } else {
        toImport.push(tx);
        // Add to set so same-file duplicates are also caught
        existingKeys.add(key(tx));
      }
    }

    return { toImport, duplicates };
  }
}
