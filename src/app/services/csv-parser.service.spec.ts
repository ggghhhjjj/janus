import { describe, it, expect } from 'vitest';
import { CsvParserService, ExportLabels } from './csv-parser.service';
import { Transaction } from '../models/transaction.model';

const svc = new CsvParserService();

const enLabels: ExportLabels = {
  headers: {
    date: 'Date', time: 'Time', ticker: 'Ticker', type: 'Type',
    quantity: 'Quantity', price: 'Price', fee: 'Fee', notes: 'Notes', currency: 'Currency',
  },
  typeLabels: {
    buy: 'Buy', sell: 'Sell', dividend: 'Dividend', split: 'Split',
    funding: 'Funding', withdrawal: 'Withdrawal',
  },
};

const bgLabels: ExportLabels = {
  headers: {
    date: 'Дата', time: 'Час', ticker: 'Тикер', type: 'Вид',
    quantity: 'Количество', price: 'Цена', fee: 'Комисион', notes: 'Бележки', currency: 'Валута',
  },
  typeLabels: {
    buy: 'Покупка', sell: 'Продажба', dividend: 'Дивидент', split: 'Сплит',
    funding: 'Депозит', withdrawal: 'Теглене',
  },
};

function makeTx(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    date: '2024-01-15',
    time: '09:30:00.000',
    ticker: 'AAPL',
    type: 'buy',
    quantity: 10,
    price: 150.5,
    currency: 'USD',
    notes: '',
    ...overrides,
  };
}

describe('CsvParserService', () => {
  // ---------------------------------------------------------------------------
  // parseRaw
  // ---------------------------------------------------------------------------
  describe('parseRaw', () => {
    it('parses simple comma-separated rows', () => {
      expect(svc.parseRaw('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    });

    it('handles quoted fields containing commas', () => {
      expect(svc.parseRaw('"hello, world",b,c')).toEqual([['hello, world', 'b', 'c']]);
    });

    it('handles embedded double-quotes inside quoted fields', () => {
      expect(svc.parseRaw('"say ""hi""",b')).toEqual([['say "hi"', 'b']]);
    });

    it('handles CRLF line endings', () => {
      expect(svc.parseRaw('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('handles LF line endings', () => {
      expect(svc.parseRaw('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('returns empty array for empty input', () => {
      expect(svc.parseRaw('')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // detectFormat
  // ---------------------------------------------------------------------------
  describe('detectFormat', () => {
    it('returns ibkr for IBKR headers', () => {
      expect(svc.detectFormat(['Symbol', 'TradeDate', 'TradePrice', 'Quantity'])).toBe('ibkr');
    });

    it('returns degiro for DEGIRO headers', () => {
      expect(svc.detectFormat(['Product', 'ISIN', 'Quantity', 'Price'])).toBe('degiro');
    });

    it('returns generic for English headers', () => {
      expect(svc.detectFormat(['Date', 'Ticker', 'Type', 'Quantity', 'Price'])).toBe('generic');
    });

    it('returns generic for Bulgarian headers', () => {
      expect(svc.detectFormat(['Дата', 'Тикер', 'Вид', 'Количество', 'Цена'])).toBe('generic');
    });

    it('returns generic for Bulgarian headers with optional columns', () => {
      expect(svc.detectFormat(['Дата', 'Час', 'Тикер', 'Вид', 'Количество', 'Цена', 'Комисион', 'Бележки', 'Валута'])).toBe('generic');
    });

    it('returns unknown for unrecognized headers', () => {
      expect(svc.detectFormat(['Foo', 'Bar', 'Baz'])).toBe('unknown');
    });
  });

  // ---------------------------------------------------------------------------
  // normalize — generic format
  // ---------------------------------------------------------------------------
  describe('normalize — generic format', () => {
    it('parses a buy row with English headers', () => {
      const rows = [
        ['Date', 'Time', 'Ticker', 'Type', 'Quantity', 'Price', 'Fee', 'Notes', 'Currency'],
        ['2024-01-15', '09:30:00.000', 'AAPL', 'buy', '10', '150.5', '1', 'Test note', 'USD'],
      ];
      const result = svc.normalize(rows, 'generic');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        date: '2024-01-15', ticker: 'AAPL', type: 'buy',
        quantity: 10, price: 150.5, fee: 1, notes: 'Test note', currency: 'USD',
      });
    });

    it('parses a buy row with Bulgarian headers and type value', () => {
      const rows = [
        ['Дата', 'Час', 'Тикер', 'Вид', 'Количество', 'Цена', 'Комисион', 'Бележки', 'Валута'],
        ['2024-01-15', '09:30:00.000', 'AAPL', 'Покупка', '10', '150.5', '1', 'Бележка', 'EUR'],
      ];
      const result = svc.normalize(rows, 'generic');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        date: '2024-01-15', ticker: 'AAPL', type: 'buy',
        quantity: 10, price: 150.5, fee: 1, notes: 'Бележка', currency: 'EUR',
      });
    });

    it.each([
      ['Покупка', 'buy'],
      ['Продажба', 'sell'],
      ['Дивидент', 'dividend'],
      ['Сплит', 'split'],
      ['Депозит', 'funding'],
      ['Теглене', 'withdrawal'],
    ])('maps Bulgarian type "%s" to internal type "%s"', (bgType, expected) => {
      const isCash = expected === 'funding' || expected === 'withdrawal';
      const rows = [
        ['Дата', 'Тикер', 'Вид', 'Количество', 'Цена'],
        ['2024-01-15', isCash ? 'CASH' : 'AAPL', bgType, isCash ? '500' : '10', '150'],
      ];
      const result = svc.normalize(rows, 'generic');
      expect(result[0]?.type).toBe(expected);
    });

    it('reads currency column and preserves it', () => {
      const rows = [
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price', 'Currency'],
        ['2024-01-15', 'AAPL', 'buy', '10', '150', 'EUR'],
      ];
      expect(svc.normalize(rows, 'generic')[0]?.currency).toBe('EUR');
    });

    it('reads Bulgarian Валута column header', () => {
      const rows = [
        ['Дата', 'Тикер', 'Вид', 'Количество', 'Цена', 'Валута'],
        ['2024-01-15', 'AAPL', 'Покупка', '10', '150', 'GBP'],
      ];
      expect(svc.normalize(rows, 'generic')[0]?.currency).toBe('GBP');
    });

    it('falls back to USD when no currency column is present', () => {
      const rows = [
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price'],
        ['2024-01-15', 'AAPL', 'buy', '10', '150'],
      ];
      expect(svc.normalize(rows, 'generic')[0]?.currency).toBe('USD');
    });

    it('sets time to 00:00:00.000 when omitted', () => {
      const rows = [
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price'],
        ['2024-01-15', 'AAPL', 'buy', '10', '150'],
      ];
      expect(svc.normalize(rows, 'generic')[0]?.time).toBe('00:00:00.000');
    });

    it('skips rows with missing required fields', () => {
      const rows = [
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price'],
        ['', 'AAPL', 'buy', '10', '150'],       // missing date
        ['2024-01-15', '', 'buy', '10', '150'],  // missing ticker
        ['2024-01-15', 'AAPL', '', '10', '150'], // missing type
      ];
      expect(svc.normalize(rows, 'generic')).toHaveLength(0);
    });

    it('handles funding/withdrawal: quantity becomes 1 and price becomes the cash amount', () => {
      const rows = [
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price'],
        ['2024-01-15', 'CASH', 'funding', '500', '0'],
      ];
      expect(svc.normalize(rows, 'generic')[0]).toMatchObject({ type: 'funding', quantity: 1, price: 500 });
    });
  });

  // ---------------------------------------------------------------------------
  // exportGenericCsv
  // ---------------------------------------------------------------------------
  describe('exportGenericCsv', () => {
    it('produces the correct English header row', () => {
      const csv = svc.exportGenericCsv([makeTx({ id: 1 })], enLabels);
      expect(csv.split('\n')[0]).toBe('Date,Time,Ticker,Type,Quantity,Price,Fee,Notes,Currency');
    });

    it('produces the correct Bulgarian header row', () => {
      const csv = svc.exportGenericCsv([makeTx({ id: 1 })], bgLabels);
      expect(csv.split('\n')[0]).toBe('Дата,Час,Тикер,Вид,Количество,Цена,Комисион,Бележки,Валута');
    });

    it('produces correct data row for a buy transaction', () => {
      const tx = makeTx({ id: 1, type: 'buy', quantity: 10, price: 150.5, fee: 1, notes: '', currency: 'USD' });
      const dataLine = svc.exportGenericCsv([tx], enLabels).split('\n')[1];
      expect(dataLine).toBe('2024-01-15,09:30:00.000,AAPL,Buy,10,150.5,1,,USD');
    });

    it('uses typeLabels to translate type values', () => {
      const tx = makeTx({ id: 1, type: 'sell' });
      expect(svc.exportGenericCsv([tx], bgLabels)).toContain('Продажба');
    });

    it('for funding/withdrawal: quantity column holds tx.price (cash amount)', () => {
      const tx = makeTx({ id: 1, type: 'funding', ticker: 'CASH', quantity: 1, price: 1000 });
      const parts = svc.exportGenericCsv([tx], enLabels).split('\n')[1].split(',');
      // quantity is column index 4
      expect(parts[4]).toBe('1000');
    });

    it('wraps notes containing commas in double-quotes', () => {
      const tx = makeTx({ id: 1, notes: 'buy, hold' });
      expect(svc.exportGenericCsv([tx], enLabels)).toContain('"buy, hold"');
    });

    it('escapes double-quotes within notes', () => {
      const tx = makeTx({ id: 1, notes: 'say "hi"' });
      expect(svc.exportGenericCsv([tx], enLabels)).toContain('"say ""hi"""');
    });

    it('handles empty fee and notes without crashing', () => {
      const tx = makeTx({ id: 1, notes: '' }); // fee is undefined (not in defaults)
      expect(() => svc.exportGenericCsv([tx], enLabels)).not.toThrow();
    });

    it('exports empty string for fee when undefined', () => {
      const tx = makeTx({ id: 1 });
      const parts = svc.exportGenericCsv([tx], enLabels).split('\n')[1].split(',');
      // fee is column index 6
      expect(parts[6]).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip: exportGenericCsv → parseRaw → normalize
  // ---------------------------------------------------------------------------
  describe('round-trip: exportGenericCsv → parseRaw → normalize', () => {
    it('round-trips buy/sell transactions with English labels, preserving all fields', () => {
      const txs: Transaction[] = [
        makeTx({ id: 1, ticker: 'AAPL', type: 'buy', quantity: 10, price: 150.5, fee: 1.5, notes: 'test', currency: 'USD' }),
        makeTx({ id: 2, date: '2024-03-01', time: '14:00:00.000', ticker: 'TSLA', type: 'sell', quantity: 5, price: 200, notes: '', currency: 'EUR' }),
      ];
      const reimported = svc.normalize(svc.parseRaw(svc.exportGenericCsv(txs, enLabels)), 'generic');

      expect(reimported).toHaveLength(2);
      expect(reimported[0]).toMatchObject({ date: '2024-01-15', ticker: 'AAPL', type: 'buy', quantity: 10, price: 150.5, fee: 1.5, notes: 'test', currency: 'USD' });
      expect(reimported[1]).toMatchObject({ date: '2024-03-01', ticker: 'TSLA', type: 'sell', quantity: 5, price: 200, notes: '', currency: 'EUR' });
    });

    it('round-trips all 6 transaction types with Bulgarian labels', () => {
      const txs: Transaction[] = [
        makeTx({ id: 1, type: 'buy', quantity: 10, price: 150.5, currency: 'USD' }),
        makeTx({ id: 2, type: 'sell', quantity: 5, price: 180, currency: 'USD' }),
        makeTx({ id: 3, type: 'dividend', quantity: 1, price: 2.5, currency: 'USD' }),
        makeTx({ id: 4, type: 'split', quantity: 3, price: 1, currency: 'USD' }),
        makeTx({ id: 5, ticker: 'CASH', type: 'funding', quantity: 1, price: 1000, currency: 'BGN' }),
        makeTx({ id: 6, ticker: 'CASH', type: 'withdrawal', quantity: 1, price: 500, currency: 'BGN' }),
      ];
      const reimported = svc.normalize(svc.parseRaw(svc.exportGenericCsv(txs, bgLabels)), 'generic');

      expect(reimported).toHaveLength(6);
      expect(reimported[0]).toMatchObject({ type: 'buy', currency: 'USD' });
      expect(reimported[1]).toMatchObject({ type: 'sell', currency: 'USD' });
      expect(reimported[2]).toMatchObject({ type: 'dividend', currency: 'USD' });
      expect(reimported[3]).toMatchObject({ type: 'split', currency: 'USD' });
      expect(reimported[4]).toMatchObject({ type: 'funding', quantity: 1, price: 1000, currency: 'BGN' });
      expect(reimported[5]).toMatchObject({ type: 'withdrawal', quantity: 1, price: 500, currency: 'BGN' });
    });

    it('round-trips notes containing commas and double-quotes', () => {
      const txs: Transaction[] = [
        makeTx({ id: 1, notes: 'buy, hold' }),
        makeTx({ id: 2, notes: 'say "hi"' }),
      ];
      const reimported = svc.normalize(svc.parseRaw(svc.exportGenericCsv(txs, enLabels)), 'generic');

      expect(reimported[0].notes).toBe('buy, hold');
      expect(reimported[1].notes).toBe('say "hi"');
    });
  });
});
