import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { MatchingDetailsRow } from '../../models/fifo.model';
import { toSignal } from '@angular/core/rxjs-interop';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Component({
  selector: 'app-fifo-matching',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './fifo-matching.html',
  styleUrl: './fifo-matching.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FifoMatchingComponent {
  private readonly state = inject(StateService);
  private readonly router = inject(Router);
  private readonly fifoState = toSignal(this.state.fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);

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

  readonly isTotalVerified = computed(() => {
    const totalGainLoss = this.fifoState()?.totalRealizedGainLoss ?? 0;
    return Math.abs(this.matchingTotals().totalGain - totalGainLoss) < 0.01;
  });

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
