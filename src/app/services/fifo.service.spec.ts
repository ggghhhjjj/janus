import { describe, it, expect } from 'vitest';
import { FifoService } from './fifo.service';
import { Transaction } from '../models/transaction.model';

const svc = new FifoService();

function makeTx(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    date: '2024-01-01',
    ticker: 'TEST',
    type: 'buy',
    quantity: 0,
    price: 0,
    time: '00:00:00.000',
    currency: 'USD',
    notes: '',
    ...overrides,
  };
}

describe('FifoService.calculate', () => {
  it('returns empty state for no transactions', () => {
    const state = svc.calculate([]);
    expect(state.totalRealizedGainLoss).toBe(0);
    expect(state.results).toEqual({});
    expect(state.yearlyGainLoss).toEqual({});
  });

  it('tracks a single buy as an open lot', () => {
    const txs: Transaction[] = [makeTx({ id: 1, type: 'buy', quantity: 100, price: 10 })];
    const state = svc.calculate(txs);
    const result = state.results['TEST'];
    expect(result.openLots).toHaveLength(1);
    expect(result.openLots[0].remaining).toBe(100);
    expect(result.sellResults).toHaveLength(0);
    expect(state.totalRealizedGainLoss).toBe(0);
  });

  it('calculates gain on a simple buy → sell', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = svc.calculate(txs);
    expect(state.totalRealizedGainLoss).toBe(500);
    const result = state.results['TEST'];
    expect(result.openLots).toHaveLength(0);
    expect(result.sellResults[0].totalGainLoss).toBe(500);
  });

  it('calculates loss on a simple buy → sell', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 50, price: 20 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 50, price: 10 }),
    ];
    const state = svc.calculate(txs);
    expect(state.totalRealizedGainLoss).toBe(-500);
  });

  it('handles a sell spanning two buy lots (FIFO order)', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'buy', quantity: 50, price: 12 }),
      makeTx({ id: 3, date: '2024-03-01', type: 'sell', quantity: 130, price: 20 }),
    ];
    const state = svc.calculate(txs);
    const sell = state.results['TEST'].sellResults[0];
    expect(sell.matchedLots).toHaveLength(2);
    // Lot 1: 100 @ 10 → cost 1000, proceeds 2000, gain 1000
    expect(sell.matchedLots[0].qtyMatched).toBe(100);
    expect(sell.matchedLots[0].gainLoss).toBe(1000);
    // Lot 2: 30 @ 12 → cost 360, proceeds 600, gain 240
    expect(sell.matchedLots[1].qtyMatched).toBe(30);
    expect(sell.matchedLots[1].gainLoss).toBe(240);
    expect(sell.totalGainLoss).toBe(1240);
    // 20 shares remain from lot 2
    const openLots = state.results['TEST'].openLots;
    expect(openLots).toHaveLength(1);
    expect(openLots[0].remaining).toBe(20);
  });

  it('adjusts open lot quantities on a 2-for-1 stock split', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-06-01', ticker: 'TEST', type: 'split', quantity: 0, price: 2 }),
    ];
    const state = svc.calculate(txs);
    const openLots = state.results['TEST'].openLots;
    expect(openLots[0].remaining).toBe(200);
    expect(openLots[0].originalQty).toBe(200);
    // Price per lot is unchanged by the split
    expect(openLots[0].price).toBe(10);
  });

  it('does not affect FIFO calculation for dividend transactions', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-03-01', type: 'dividend', quantity: 0, price: 200 }),
      makeTx({ id: 3, date: '2024-06-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = svc.calculate(txs);
    // Dividend must NOT appear in openLots or sellResults
    expect(state.results['TEST'].openLots).toHaveLength(0);
    expect(state.results['TEST'].sellResults).toHaveLength(1);
    // Gain only from the buy/sell, not the dividend
    expect(state.totalRealizedGainLoss).toBe(500);
  });

  it('tracks yearly gain/loss by sell date', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2023-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2023-06-01', type: 'sell', quantity: 50, price: 12 }),
      makeTx({ id: 3, date: '2024-03-01', type: 'sell', quantity: 50, price: 15 }),
    ];
    const state = svc.calculate(txs);
    expect(state.yearlyGainLoss[2023]).toBe(100); // 50 * (12 - 10) = 100
    expect(state.yearlyGainLoss[2024]).toBe(250); // 50 * (15 - 10) = 250
    expect(state.totalRealizedGainLoss).toBe(350);
  });

  it('handles multiple tickers independently', () => {
    const txs: Transaction[] = [
      { id: 1, date: '2024-01-01', ticker: 'AAPL', type: 'buy', quantity: 100, price: 150, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 2, date: '2024-01-01', ticker: 'MSFT', type: 'buy', quantity: 75, price: 300, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 3, date: '2024-06-01', ticker: 'AAPL', type: 'sell', quantity: 50, price: 160, time: '00:00:00.000', currency: 'USD', notes: '' },
    ];
    const state = svc.calculate(txs);
    expect(state.results['AAPL'].sellResults[0].totalGainLoss).toBe(500);
    expect(state.results['MSFT'].sellResults).toHaveLength(0);
    expect(state.results['MSFT'].openLots[0].remaining).toBe(75);
  });

  // Full appendix example from spec (Section 12)
  it('matches spec appendix example exactly', () => {
    const txs: Transaction[] = [
      { id: 1, date: '2024-01-15', ticker: 'AAPL', type: 'buy', quantity: 100, price: 150.0, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 2, date: '2024-02-20', ticker: 'AAPL', type: 'buy', quantity: 50, price: 155.0, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 3, date: '2024-03-10', ticker: 'AAPL', type: 'sell', quantity: 120, price: 160.0, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 4, date: '2024-04-05', ticker: 'MSFT', type: 'buy', quantity: 75, price: 300.0, time: '00:00:00.000', currency: 'USD', notes: '' },
      { id: 5, date: '2024-05-15', ticker: 'AAPL', type: 'sell', quantity: 30, price: 165.0, time: '00:00:00.000', currency: 'USD', notes: '' },
    ];

    const state = svc.calculate(txs);

    // AAPL sell ID=3: 100 from lot1 + 20 from lot2
    const aaplSell1 = state.results['AAPL'].sellResults[0];
    expect(aaplSell1.matchedLots[0].qtyMatched).toBe(100);
    expect(aaplSell1.matchedLots[0].costBasis).toBe(15000);
    expect(aaplSell1.matchedLots[0].proceeds).toBe(16000);
    expect(aaplSell1.matchedLots[0].gainLoss).toBe(1000);
    expect(aaplSell1.matchedLots[1].qtyMatched).toBe(20);
    expect(aaplSell1.matchedLots[1].costBasis).toBe(3100);
    expect(aaplSell1.matchedLots[1].proceeds).toBe(3200);
    expect(aaplSell1.matchedLots[1].gainLoss).toBe(100);
    expect(aaplSell1.totalGainLoss).toBe(1100);

    // AAPL sell ID=5: 30 from remaining lot2
    const aaplSell2 = state.results['AAPL'].sellResults[1];
    expect(aaplSell2.matchedLots[0].qtyMatched).toBe(30);
    expect(aaplSell2.matchedLots[0].costBasis).toBe(4650);
    expect(aaplSell2.matchedLots[0].proceeds).toBe(4950);
    expect(aaplSell2.matchedLots[0].gainLoss).toBe(300);
    expect(aaplSell2.totalGainLoss).toBe(300);

    // AAPL total realized
    const aaplTotal = state.results['AAPL'].sellResults.reduce((s, r) => s + r.totalGainLoss, 0);
    expect(aaplTotal).toBe(1400);

    // AAPL: lot1 (100) fully sold in sale3; lot2 (50) sold 20 in sale3 + 30 in sale5 = 50 total → 0 remaining
    expect(state.results['AAPL'].openLots).toHaveLength(0);

    // MSFT: no sales
    expect(state.results['MSFT'].sellResults).toHaveLength(0);
    expect(state.results['MSFT'].openLots[0].remaining).toBe(75);

    expect(state.totalRealizedGainLoss).toBe(1400);
  });

  it('calculates gain with buy fee (increases cost basis)', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10, fee: 5 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = svc.calculate(txs);
    // Cost basis = 100 * 10 + 5 = 1005
    // Proceeds = 100 * 15 = 1500
    // Gain = 1500 - 1005 = 495
    expect(state.totalRealizedGainLoss).toBe(495);
    expect(state.results['TEST'].sellResults[0].totalGainLoss).toBe(495);
  });

  it('calculates gain with sell fee (decreases proceeds)', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15, fee: 2 }),
    ];
    const state = svc.calculate(txs);
    // Cost basis = 100 * 10 = 1000
    // Proceeds = 100 * 15 - 2 = 1498
    // Gain = 1498 - 1000 = 498
    expect(state.totalRealizedGainLoss).toBe(498);
    expect(state.results['TEST'].sellResults[0].totalGainLoss).toBe(498);
  });

  it('calculates gain with both buy and sell fees', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10, fee: 5 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15, fee: 2 }),
    ];
    const state = svc.calculate(txs);
    // Cost basis = 100 * 10 + 5 = 1005
    // Proceeds = 100 * 15 - 2 = 1498
    // Gain = 1498 - 1005 = 493
    expect(state.totalRealizedGainLoss).toBe(493);
    expect(state.results['TEST'].sellResults[0].totalGainLoss).toBe(493);
  });

  it('distributes buy fees proportionally across multiple matched lots', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10, fee: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'buy', quantity: 50, price: 12, fee: 5 }),
      makeTx({ id: 3, date: '2024-03-01', type: 'sell', quantity: 130, price: 20 }),
    ];
    const state = svc.calculate(txs);
    const sell = state.results['TEST'].sellResults[0];
    // Lot 1: 100 @ 10 + $10 fee = cost 1010, proceeds 2000, gain 990
    // Lot 2: 30 @ 12 + $3 fee (30/50 * 5) = cost 363, proceeds 600, gain 237
    // Total gain = 990 + 237 = 1227
    expect(sell.matchedLots[0].qtyMatched).toBe(100);
    expect(sell.totalGainLoss).toBe(1227);
  });

  it('ignores fees on dividend and split transactions', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-03-01', type: 'dividend', quantity: 0, price: 200, fee: 5 }),
      makeTx({ id: 3, date: '2024-06-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = svc.calculate(txs);
    // Gain = 100 * (15 - 10) = 500 (dividend fee should not affect)
    expect(state.totalRealizedGainLoss).toBe(500);
  });
});
