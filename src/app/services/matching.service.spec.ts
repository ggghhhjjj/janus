import { describe, it, expect } from 'vitest';
import { FifoService } from './fifo.service';
import { MatchingService } from './matching.service';
import { Transaction } from '../models/transaction.model';

const fifoSvc = new FifoService();
const matchSvc = new MatchingService();

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

describe('MatchingService.computeMatching', () => {
  it('returns empty result for null/empty state', () => {
    const r = matchSvc.computeMatching(null);
    expect(r.rows).toHaveLength(0);
    expect(r.totals.matchedUnits).toBe(0);
    expect(r.totals.totalGain).toBe(0);
    expect(r.isTotalVerified).toBe(true);

    const emptyState = fifoSvc.calculate([]);
    const r2 = matchSvc.computeMatching(emptyState);
    expect(r2.rows).toHaveLength(0);
    expect(r2.totals.totalGain).toBe(0);
    expect(r2.isTotalVerified).toBe(true);
  });

  it('single buy -> sell produces expected row and totals', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = fifoSvc.calculate(txs);
    const r = matchSvc.computeMatching(state);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].matchedUnits).toBe(100);
    expect(r.rows[0].effectiveBuyPrice).toBe(10);
    expect(r.rows[0].effectiveSellPrice).toBe(15);
    expect(r.totals.totalGain).toBe(500);
    expect(r.isTotalVerified).toBe(true);
  });

  it('handles buy fee increasing cost basis', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10, fee: 5 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15 }),
    ];
    const state = fifoSvc.calculate(txs);
    const r = matchSvc.computeMatching(state);
    expect(r.totals.totalGain).toBe(495);
    expect(r.isTotalVerified).toBe(true);
  });

  it('handles sell fee reducing proceeds', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'sell', quantity: 100, price: 15, fee: 2 }),
    ];
    const state = fifoSvc.calculate(txs);
    const r = matchSvc.computeMatching(state);
    expect(r.totals.totalGain).toBe(498);
    expect(r.isTotalVerified).toBe(true);
  });

  it('handles sell spanning multiple buy lots', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, date: '2024-01-01', type: 'buy', quantity: 100, price: 10, fee: 10 }),
      makeTx({ id: 2, date: '2024-02-01', type: 'buy', quantity: 50, price: 12, fee: 5 }),
      makeTx({ id: 3, date: '2024-03-01', type: 'sell', quantity: 130, price: 20 }),
    ];
    const state = fifoSvc.calculate(txs);
    const r = matchSvc.computeMatching(state);
    expect(r.rows.length).toBe(2);
    expect(r.totals.totalGain).toBe(1227);
    expect(r.isTotalVerified).toBe(true);
  });

  it('detects rounding discrepancy (verification false)', () => {
    const txs: Transaction[] = [
      makeTx({ id: 1, type: 'buy', quantity: 1, price: 10 }),
      makeTx({ id: 2, type: 'buy', quantity: 1, price: 10 }),
      makeTx({ id: 3, type: 'buy', quantity: 1, price: 10 }),
      makeTx({ id: 4, type: 'sell', quantity: 3, price: 10.33, fee: 1 }),
    ];
    const state = fifoSvc.calculate(txs);
    // canonical total should be -0.01 while per-row rounding yields 0.00
    const r = matchSvc.computeMatching(state);
    expect(r.totals.totalGain).toBe(0);
    expect(state.totalRealizedGainLoss).toBe(-0.01);
    expect(r.isTotalVerified).toBe(false);
    expect(Math.abs(r.discrepancy - 0.01)).toBeLessThan(0.0001);
  });

  it('handles a matched lot with zero qty defensively', () => {
    const fakeState = {
      results: {
        TEST: {
          ticker: 'TEST',
          openLots: [],
          sellResults: [
            {
              sellTransactionId: 10,
              sellDate: '2024-01-01',
              sellPrice: 10,
              matchedLots: [
                {
                  lotId: 1,
                  buyDate: '2024-01-01',
                  originalQty: 100,
                  availableUnits: 100,
                  qtyMatched: 0,
                  buyPrice: 10,
                  sellPrice: 10,
                  costBasis: 0,
                  proceeds: 0,
                  gainLoss: 0,
                  proportionalBuyFee: 0,
                },
              ],
              totalCostBasis: 0,
              totalProceeds: 0,
              totalSellFee: undefined,
              totalGainLoss: 0,
            },
          ],
        },
      },
      totalRealizedGainLoss: 0,
      yearlyGainLoss: {},
    } as any;

    const r = matchSvc.computeMatching(fakeState);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].matchedUnits).toBe(0);
    expect(r.rows[0].effectiveBuyPrice).toBe(0);
    expect(r.rows[0].effectiveSellPrice).toBe(0);
    expect(r.totals.totalGain).toBe(0);
    expect(r.isTotalVerified).toBe(true);
  });
});
