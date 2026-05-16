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
/**
 * FifoMatchingComponent
 *
 * Business purpose:
 * - Render per-lot FIFO matching details and provide aggregated totals and
 *   verification for the UI.
 * - Transform FIFO results produced by the calculation service into a
 *   template-friendly list of rows (`matchingDetails`) and summary totals.
 * - Coordinate presentation concerns: expand/collapse state, transient
 *   highlighting of rows, scrolling, and navigation to transaction details.
 *
 * Responsibilities:
 * - Expose computed signals (`matchingDetails`, `matchingTotals`, `isTotalVerified`)
 *   for templates and keep the component focused on presentation and UI
 *   interactions while delegating heavy calculations to `StateService`.
 */
export class FifoMatchingComponent {
  /**
   * Global application state service used to read transactions and writable
   * signals that coordinate highlighting and navigation.
   * @private
   */
  private readonly state = inject(StateService);

  /** Router used to navigate to the transactions page when a row is clicked. */
  private readonly router = inject(Router);

  /**
   * Signal form of the FIFO calculation observable (`StateService.fifoState$`).
   * Exposed as a private signal so computed values can synchronously derive
   * matching rows and totals for the template.
   * @private
   */
  private readonly fifoState = toSignal(this.state.fifoState$, { initialValue: null });

  /** Runtime i18n service for translating UI strings in the template. */
  readonly i18n = inject(I18nService);

  /** Controls whether the matching detail section is expanded in the UI. */
  readonly isMatchingExpanded = signal(true);

  /**
   * Derived list of per-lot matching rows used to render the matching table.
   * Business purpose: flatten internal FIFO matching results into a template-
   * friendly row structure including effective buy/sell prices and realized gain.
   */
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

  /**
   * Totals aggregated from `matchingDetails`.
   * Business purpose: provide a quick verification and summary for the UI.
   */
  readonly matchingTotals = computed(() => {
    const rows = this.matchingDetails();
    return {
      matchedUnits: rows.reduce((s, r) => s + r.matchedUnits, 0),
      totalGain: r2(rows.reduce((s, r) => s + r.totalGain, 0)),
    };
  });

  /**
   * Indicates whether the computed matching total aligns with the canonical
   * `totalRealizedGainLoss` produced by the FIFO calculation. Used to flag
   * verification warnings in the UI when numbers diverge.
   */
  readonly isTotalVerified = computed(() => {
    const totalGainLoss = this.fifoState()?.totalRealizedGainLoss ?? 0;
    return Math.abs(this.matchingTotals().totalGain - totalGainLoss) < 0.01;
  });

  /** Transaction number map used by the template for compact references. */
  readonly transactionNumbers = this.state.transactionNumbers;

  /** Writable signal from state used to mark a matching transaction as highlighted. */
  readonly highlightedMatchingTransactionId = this.state.highlightedMatchingTransactionId;

  /** Convenience computed set for fast membership checks when rendering rows. */
  readonly highlightedMatchingSet = computed(() => {
    const id = this.highlightedMatchingTransactionId();
    return id != null ? new Set([id]) : new Set<number>();
  });

  constructor() {
    /**
     * Side-effect: when a matching transaction is highlighted elsewhere in the
     * app, expand the matching view, scroll the highlighted row into view,
     * then clear the transient highlight after a short delay.
     */
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

  /**
   * Navigate to the transactions page and mark the given transaction ID as
   * highlighted so other components or lists can focus it.
   */
  navigateToTransaction(id: number): void {
    this.state.highlightedTransactionId.set(id);
    this.router.navigate(['/transactions']);
  }
}
