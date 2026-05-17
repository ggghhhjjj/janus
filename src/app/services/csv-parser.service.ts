import { Injectable } from '@angular/core';
import { Transaction, TransactionType, NewTransaction } from '../models/transaction.model';

export type CsvFormat = 'ibkr' | 'degiro' | 'generic' | 'unknown';

export interface ImportResult {
  toImport: NewTransaction[];
  duplicates: NewTransaction[];
}

export interface ExportLabels {
  headers: {
    date: string;
    time: string;
    ticker: string;
    type: string;
    quantity: string;
    price: string;
    fee: string;
    notes: string;
    currency: string;
  };
  typeLabels: Record<string, string>;
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

    // Generic: must have date, (ticker or symbol), type, quantity, price — English or Bulgarian headers
    const hasDate = h.includes('date') || h.includes('дата');
    const hasTicker = h.includes('ticker') || h.includes('тикер') || h.includes('symbol');
    const hasType = h.includes('type') || h.includes('вид');
    const hasQuantity = h.includes('quantity') || h.includes('количество');
    const hasPrice = h.includes('price') || h.includes('цена');
    if (hasDate && hasTicker && hasType && hasQuantity && hasPrice) {
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

    // For generic format: support localized (Bulgarian) column headers and type values
    let colGeneric: (row: string[], name: string) => string = col;
    const typeAliasMap: Record<string, string> = {};
    if (format === 'generic') {
      const headerAliases: Record<string, string> = {
        'дата': 'date', 'час': 'time', 'тикер': 'ticker', 'вид': 'type',
        'количество': 'quantity', 'цена': 'price', 'комисион': 'fee',
        'бележки': 'notes', 'валута': 'currency',
      };
      const normalizedHeaders = headers.map(h => headerAliases[h] ?? h);
      colGeneric = (row: string[], name: string): string => {
        const idx = normalizedHeaders.indexOf(name);
        return idx >= 0 ? (row[idx] ?? '').trim() : '';
      };
      Object.assign(typeAliasMap, {
        'покупка': 'buy', 'продажба': 'sell', 'дивидент': 'dividend',
        'сплит': 'split', 'депозит': 'funding', 'теглене': 'withdrawal',
      });
    }

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
        let currency = 'USD';

        if (format === 'ibkr') {
          rawDate = col(row, 'tradedate');
          rawTime = col(row, 'tradetime') || col(row, 'time') || '';
          const symbol = col(row, 'symbol').toUpperCase();
          const description = col(row, 'description') || col(row, 'notes') || '';
          const buySell = col(row, 'buysell') || col(row, 'buy/sell');
          
          // Check for cash operations
          const descLower = description.toLowerCase();
          if (descLower.includes('deposit') || descLower.includes('wire in')) {
            ticker = 'CASH';
            typeStr = 'funding';
          } else if (descLower.includes('withdrawal') || descLower.includes('wire out')) {
            ticker = 'CASH';
            typeStr = 'withdrawal';
          } else {
            ticker = symbol;
            typeStr = buySell.toLowerCase().startsWith('b') ? 'buy' : 'sell';
          }
          
          quantityStr = col(row, 'quantity');
          priceStr = col(row, 'tradeprice');
          feeStr = col(row, 'fee') || col(row, 'commission') || col(row, 'commissionfee') || '';
          notes = description;
        } else if (format === 'degiro') {
          rawDate = col(row, 'date');
          rawTime = col(row, 'time') || '';
          const product = col(row, 'product') || col(row, 'isin');
          const description = col(row, 'omschrijving') || col(row, 'description') || '';
          
          // Check for cash deposit/withdrawal
          const descLower = description.toLowerCase();
          if (descLower.includes('cash deposit') || descLower.includes('deposit')) {
            ticker = 'CASH';
            typeStr = 'funding';
          } else if (descLower.includes('cash withdrawal') || descLower.includes('withdrawal')) {
            ticker = 'CASH';
            typeStr = 'withdrawal';
          } else {
            ticker = product.toUpperCase();
            // DEGIRO doesn't always have a type column; infer from quantity sign
            const rawQty = col(row, 'aantal') || col(row, 'quantity');
            const qtyNum = parseFloat(rawQty.replace(',', '.'));
            typeStr = qtyNum >= 0 ? 'buy' : 'sell';
          }
          
          const rawQty = col(row, 'aantal') || col(row, 'quantity');
          const qtyNum = parseFloat(rawQty.replace(',', '.'));
          quantityStr = String(Math.abs(qtyNum));
          priceStr = col(row, 'koers') || col(row, 'price');
          feeStr = col(row, 'fee') || col(row, 'commission') || col(row, 'cost') || col(row, 'commissionfee') || '';
          notes = description || col(row, 'notes') || '';
        } else {
          // generic — supports both English and Bulgarian headers/type values
          rawDate = colGeneric(row, 'date');
          rawTime = colGeneric(row, 'time') || '';
          ticker = (colGeneric(row, 'ticker') || colGeneric(row, 'symbol')).toUpperCase();
          typeStr = colGeneric(row, 'type').toLowerCase();
          typeStr = typeAliasMap[typeStr] ?? typeStr;
          quantityStr = colGeneric(row, 'quantity');
          priceStr = colGeneric(row, 'price');
          feeStr = colGeneric(row, 'fee') || colGeneric(row, 'commission') || colGeneric(row, 'cost') || colGeneric(row, 'commissionfee') || '';
          notes = colGeneric(row, 'notes') || '';
          currency = colGeneric(row, 'currency') || 'USD';
        }

        const date = parseDate(rawDate);
        const time = this.normalizeTime(rawTime);
        let quantity = parseFloat(quantityStr.replace(',', '.'));
        let price = parseFloat(priceStr.replace(',', '.').replace(/[^0-9.\-]/g, ''));
        const fee = feeStr ? parseFloat(feeStr.replace(',', '.').replace(/[^0-9.\-]/g, '')) : undefined;
        const type = typeStr as TransactionType;

        // For funding/withdrawal, swap quantity and price: amount goes to price, quantity set to 1
        if (type === 'funding' || type === 'withdrawal') {
          const amount = quantity;
          quantity = 1;
          price = amount;
        }

        if (!date || !ticker || !['buy', 'sell', 'dividend', 'split', 'funding', 'withdrawal'].includes(type) || isNaN(quantity) || isNaN(price)) {
          continue; // skip invalid rows silently
        }

        results.push({ date, time, ticker, type, quantity, price, currency, ...(fee && !isNaN(fee) ? { fee } : {}), notes });
      } catch {
        // skip malformed rows
        continue;
      }
    }

    return results;
  }

  /**
   * Export transactions as a generic-format CSV string.
   * Column order: date, time, ticker, type, quantity, price, fee, notes, currency.
   * For funding/withdrawal rows, the quantity column holds tx.price (the cash amount)
   * so that re-importing via normalize() correctly reconstructs the transaction.
   */
  exportGenericCsv(transactions: Transaction[], labels: ExportLabels): string {
    const { headers: h, typeLabels } = labels;
    const toRow = (cells: string[]): string => cells.map(v => this.csvEscape(v)).join(',');

    const headerRow = toRow([
      h.date, h.time, h.ticker, h.type, h.quantity, h.price, h.fee, h.notes, h.currency,
    ]);

    const dataRows = transactions.map(tx => {
      const isCash = tx.type === 'funding' || tx.type === 'withdrawal';
      const quantityCol = isCash ? tx.price : tx.quantity;
      return toRow([
        tx.date,
        tx.time,
        tx.ticker,
        typeLabels[tx.type] ?? tx.type,
        String(quantityCol),
        String(tx.price),
        tx.fee != null ? String(tx.fee) : '',
        tx.notes ?? '',
        tx.currency,
      ]);
    });

    return [headerRow, ...dataRows].join('\n');
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
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
