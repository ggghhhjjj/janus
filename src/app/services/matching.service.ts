import { Injectable } from '@angular/core';
import { FifoState, MatchingDetailsRow } from '../models/fifo.model';
import { round2 } from '../utils/number-utils';

export interface MatchingTotals {
  matchedUnits: number;
  totalGain: number;
}

export interface MatchingResult {
  rows: MatchingDetailsRow[];
  totals: MatchingTotals;
  isTotalVerified: boolean;
  discrepancy: number;
}

export interface MatchingEngineOptions {
  verificationEpsilon?: number;
}

@Injectable({ providedIn: 'root' })
export class MatchingService {
  computeMatching(fifoState: FifoState | null, options?: MatchingEngineOptions): MatchingResult {
    const epsilon = options?.verificationEpsilon ?? 0.01;

    if (!fifoState) {
      return { rows: [], totals: { matchedUnits: 0, totalGain: 0 }, isTotalVerified: true, discrepancy: 0 };
    }

    const results = fifoState.results ?? {};
    const rows: MatchingDetailsRow[] = [];

    for (const result of Object.values(results)) {
      for (const sell of result.sellResults) {
        const totalSellQty = sell.matchedLots.reduce((s, m) => s + m.qtyMatched, 0);

        for (const lot of sell.matchedLots) {
          const propSellFee = sell.totalSellFee && totalSellQty > 0
            ? round2((lot.qtyMatched / totalSellQty) * sell.totalSellFee)
            : 0;

          const adjCostBasis = round2(lot.costBasis + lot.proportionalBuyFee);
          const adjProceeds = round2(lot.proceeds - propSellFee);
          const effectiveBuyPrice = lot.qtyMatched > 0 ? adjCostBasis / lot.qtyMatched : 0;
          const effectiveSellPrice = lot.qtyMatched > 0 ? adjProceeds / lot.qtyMatched : 0;
          const totalGain = round2(adjProceeds - adjCostBasis);

          rows.push({
            sellDate: sell.sellDate,
            sellTransactionId: sell.sellTransactionId,
            buyDate: lot.buyDate,
            buyTransactionId: lot.lotId,
            ticker: result.ticker,
            availableUnits: lot.availableUnits,
            matchedUnits: lot.qtyMatched,
            effectiveBuyPrice,
            effectiveSellPrice,
            totalGain,
          });
        }
      }
    }

    rows.sort((a, b) => b.sellDate.localeCompare(a.sellDate));

    const matchedUnits = rows.reduce((s, r) => s + r.matchedUnits, 0);
    const totalGain = round2(rows.reduce((s, r) => s + r.totalGain, 0));
    const totals: MatchingTotals = { matchedUnits, totalGain };

    const canonical = fifoState.totalRealizedGainLoss ?? 0;
    const discrepancy = round2(Math.abs(totalGain - canonical));
    const isTotalVerified = discrepancy < epsilon;

    return { rows, totals, isTotalVerified, discrepancy };
  }
}
