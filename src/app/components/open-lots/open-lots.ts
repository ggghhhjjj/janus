import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';

interface OpenLotSummary {
  ticker: string;
  totalQty: number;
  avgCostBasis: number;
}

@Component({
  selector: 'app-open-lots',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './open-lots.html',
  styleUrl: './open-lots.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * OpenLotsComponent
 *
 * Business purpose:
 * - Present a compact summary of currently open lots grouped by ticker.
 * - Provide a template-friendly list containing total available quantity and
 *   average cost basis per ticker so the dashboard can show holdings at-a-glance.
 *
 * Responsibilities:
 * - Derive presentation data from the `StateService` FIFO results and expose
 *   a computed signal (`openLotsByTicker`) for templates. Keep calculations
 *   simple and delegate the heavy matching logic to the FIFO calculation layer.
 */
export class OpenLotsComponent {
  /**
   * Signal-wrapped FIFO calculation state from `StateService`.
   * Used internally to derive open-lot summaries.
   * @private
   */
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });

  /** Runtime i18n helper exposed for template translations. */
  readonly i18n = inject(I18nService);

  /**
   * Computed array of `OpenLotSummary` objects grouped and sorted by ticker.
   * Each entry contains the `ticker`, `totalQty` (sum of remaining units),
   * and `avgCostBasis` (weighted average price of remaining units).
   * This signal is intended for direct iteration in templates.
   */
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
}
