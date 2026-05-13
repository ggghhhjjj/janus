import { Injectable } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { FifoState, FifoResult, Lot, SellResult, MatchedLot } from '../models/fifo.model';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable({ providedIn: 'root' })
export class FifoService {
  calculate(transactions: Transaction[]): FifoState {
    // Sort by date ascending; for same date, use id for deterministic order
    const sorted = [...transactions].sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.id - b.id;
    });

    // Per-ticker lot queues (mutable during calculation)
    const lotQueues = new Map<string, Lot[]>();
    const results = new Map<string, FifoResult>();

    const getTicker = (ticker: string): { lots: Lot[]; result: FifoResult } => {
      if (!lotQueues.has(ticker)) {
        lotQueues.set(ticker, []);
        results.set(ticker, { ticker, openLots: [], sellResults: [] });
      }
      return { lots: lotQueues.get(ticker)!, result: results.get(ticker)! };
    };

    for (const tx of sorted) {
      const { lots, result } = getTicker(tx.ticker);

      if (tx.type === 'buy') {
        lots.push({
          id: tx.id,
          date: tx.date,
          originalQty: tx.quantity,
          price: tx.price,
          remaining: tx.quantity,
          fee: tx.fee ?? 0,
        });
      } else if (tx.type === 'split') {
        // tx.price holds the split ratio
        const ratio = tx.price;
        for (const lot of lots) {
          lot.originalQty = round2(lot.originalQty * ratio);
          lot.remaining = round2(lot.remaining * ratio);
        }
      } else if (tx.type === 'sell') {
        let qtyToSell = tx.quantity;
        const matchedLots: MatchedLot[] = [];

        for (const lot of lots) {
          if (qtyToSell <= 0) break;
          if (lot.remaining <= 0) continue;

          const qtyMatched = Math.min(lot.remaining, qtyToSell);
          const costBasis = round2(qtyMatched * lot.price);
          const proceeds = round2(qtyMatched * tx.price);
          const gainLoss = round2(proceeds - costBasis);

          matchedLots.push({
            lotId: lot.id,
            buyDate: lot.date,
            qtyMatched,
            buyPrice: lot.price,
            sellPrice: tx.price,
            costBasis,
            proceeds,
            gainLoss,
          });

          lot.remaining = round2(lot.remaining - qtyMatched);
          qtyToSell = round2(qtyToSell - qtyMatched);
        }

        const totalCostBasis = round2(matchedLots.reduce((s, m) => s + m.costBasis, 0));
        const totalProceeds = round2(matchedLots.reduce((s, m) => s + m.proceeds, 0));
        
        // Calculate proportional buy fees and total sell fee
        let totalBuyFees = 0;
        for (let i = 0; i < matchedLots.length; i++) {
          const matchedLot = matchedLots[i];
          const lot = lots.find((l) => l.id === matchedLot.lotId);
          if (lot && lot.fee) {
            // Add proportional buy fee based on quantity matched from this lot
            const proportionalFee = round2((lot.fee / lot.originalQty) * matchedLot.qtyMatched);
            totalBuyFees += proportionalFee;
          }
        }
        totalBuyFees = round2(totalBuyFees);
        
        const totalSellFee = tx.fee ?? 0;
        const totalCostBasisWithFees = round2(totalCostBasis + totalBuyFees);
        const totalProceedsAfterFee = round2(totalProceeds - totalSellFee);
        const totalGainLoss = round2(totalProceedsAfterFee - totalCostBasisWithFees);

        const sellResult: SellResult = {
          sellTransactionId: tx.id,
          sellDate: tx.date,
          sellPrice: tx.price,
          matchedLots,
          totalCostBasis: totalCostBasisWithFees,
          totalProceeds: totalProceedsAfterFee,
          totalSellFee: totalSellFee > 0 ? totalSellFee : undefined,
          totalGainLoss,
        };
        result.sellResults.push(sellResult);
      }
      // dividend: no FIFO impact; skip
    }

    // Build final FifoResults with only non-zero open lots
    const finalResults: Record<string, FifoResult> = {};
    for (const [ticker, result] of results) {
      finalResults[ticker] = {
        ...result,
        openLots: lotQueues.get(ticker)!.filter((l) => l.remaining > 0),
      };
    }

    // Aggregate totals
    let totalRealizedGainLoss = 0;
    const yearlyGainLoss: Record<number, number> = {};

    for (const result of Object.values(finalResults)) {
      for (const sell of result.sellResults) {
        totalRealizedGainLoss += sell.totalGainLoss;
        const year = new Date(sell.sellDate + 'T00:00:00').getFullYear();
        yearlyGainLoss[year] = (yearlyGainLoss[year] ?? 0) + sell.totalGainLoss;
      }
    }

    return {
      results: finalResults,
      totalRealizedGainLoss: round2(totalRealizedGainLoss),
      yearlyGainLoss: Object.fromEntries(
        Object.entries(yearlyGainLoss).map(([y, v]) => [y, round2(v)])
      ),
    };
  }
}
