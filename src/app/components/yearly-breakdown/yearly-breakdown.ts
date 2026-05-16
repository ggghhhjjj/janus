import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';

interface YearlyRow {
  year: number;
  gainLoss: number;
}

@Component({
  selector: 'app-yearly-breakdown',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './yearly-breakdown.html',
  styleUrl: './yearly-breakdown.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * YearlyBreakdownComponent
 *
 * Business purpose:
 * - Present a year-by-year summary of realized gain/loss produced by the
 *   FIFO calculation.
 * - Provide a simple, sorted list of `{ year, gainLoss }` rows for dashboard
 *   widgets and reports so users can review annual results at-a-glance.
 *
 * Responsibilities:
 * - Read the FIFO calculation state from `StateService` and expose a
 *   template-friendly computed signal `yearlyBreakdown`.
 * - Keep presentation logic local; the component does not perform heavy
 *   financial calculations itself.
 */
export class YearlyBreakdownComponent {
  /** Signal-backed FIFO calculation state from `StateService`. @private */
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });

  /** Runtime i18n helper for template translations. */
  readonly i18n = inject(I18nService);

  /**
   * Computed array of `{ year, gainLoss }` sorted descending by year.
   * Intended for direct iteration in templates to render the yearly table.
   */
  readonly yearlyBreakdown = computed<YearlyRow[]>(() => {
    const yearly = this.fifoState()?.yearlyGainLoss ?? {};
    return Object.entries(yearly)
      .map(([year, gainLoss]) => ({ year: Number(year), gainLoss }))
      .sort((a, b) => b.year - a.year);
  });
}
