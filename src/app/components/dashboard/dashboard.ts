import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { MatchingDetailsRow } from '../../models/fifo.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrokerAccountComponent } from '../broker-account/broker-account';

interface OpenLotSummary {
  ticker: string;
  totalQty: number;
  avgCostBasis: number;
}

interface YearlyRow {
  year: number;
  gainLoss: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, BrokerAccountComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly state = inject(StateService);
  private readonly router = inject(Router);
  private readonly fifoState = toSignal(this.state.fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);

  readonly totalGainLoss = computed(() => this.fifoState()?.totalRealizedGainLoss ?? 0);

  readonly hasFundingTransactions = computed(() => {
    return (
      this.state.transactions.some((t) => t.type === 'funding' || t.type === 'withdrawal')
    );
  });

  readonly yearlyBreakdown = computed<YearlyRow[]>(() => {
    const yearly = this.fifoState()?.yearlyGainLoss ?? {};
    return Object.entries(yearly)
      .map(([year, gainLoss]) => ({ year: Number(year), gainLoss }))
      .sort((a, b) => b.year - a.year);
  });

  readonly openLotsByTicker = computed<OpenLotSummary[]>(() => {
    const results = this.fifoState()?.results ?? {};
    return Object.values(results)
      .filter((r) => r.openLots.length > 0)
      .map((r) => {
        const totalQty = r.openLots.reduce((s, l) => s + l.remaining, 0);
        const totalCost = r.openLots.reduce((s, l) => s + l.remaining * l.price, 0);
        const avgCostBasis = totalQty > 0 ? totalCost / totalQty : 0;
        return { ticker: r.ticker, totalQty, avgCostBasis };
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  });

  // --- Matching Details ---

  readonly isMatchingExpanded = signal(true);

  readonly matchingDetails = computed<MatchingDetailsRow[]>(() => {
    const results = this.fifoState()?.results ?? {};
    const rows: MatchingDetailsRow[] = [];

    for (const result of Object.values(results)) {
      for (const sell of result.sellResults) {
        const totalSellQty = sell.matchedLots.reduce((s, m) => s + m.qtyMatched, 0);
        for (const lot of sell.matchedLots) {
          const propSellFee = sell.totalSellFee
            ? r2((lot.qtyMatched / totalSellQty) * sell.totalSellFee)
            : 0;
          const adjCostBasis = r2(lot.costBasis + lot.proportionalBuyFee);
          const adjProceeds = r2(lot.proceeds - propSellFee);
          const effectiveBuyPrice = lot.qtyMatched > 0 ? adjCostBasis / lot.qtyMatched : 0;
          const effectiveSellPrice = lot.qtyMatched > 0 ? adjProceeds / lot.qtyMatched : 0;
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
            totalGain: r2(adjProceeds - adjCostBasis),
          });
        }
      }
    }

    return rows.sort((a, b) => b.sellDate.localeCompare(a.sellDate));
  });

  readonly matchingTotals = computed(() => {
    const rows = this.matchingDetails();
    return {
      matchedUnits: rows.reduce((s, r) => s + r.matchedUnits, 0),
      totalGain: r2(rows.reduce((s, r) => s + r.totalGain, 0)),
    };
  });

  readonly isTotalVerified = computed(
    () => Math.abs(this.matchingTotals().totalGain - this.totalGainLoss()) < 0.01
  );

  // Expose for template
  readonly transactionNumbers = this.state.transactionNumbers;
  readonly highlightedMatchingTransactionId = this.state.highlightedMatchingTransactionId;

  readonly highlightedMatchingSet = computed(() => {
    const id = this.highlightedMatchingTransactionId();
    return id != null ? new Set([id]) : new Set<number>();
  });

  constructor() {
    effect(() => {
      const id = this.highlightedMatchingTransactionId();
      if (id == null) return;
      this.isMatchingExpanded.set(true);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.matching-row--highlighted')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setTimeout(() => {
        this.state.highlightedMatchingTransactionId.set(null);
      }, 3000);
    });
  }

  navigateToTransaction(id: number): void {
    this.state.highlightedTransactionId.set(id);
    this.router.navigate(['/transactions']);
  }
}
