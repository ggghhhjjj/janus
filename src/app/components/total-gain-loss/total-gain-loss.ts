import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-total-gain-loss',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './total-gain-loss.html',
  styleUrl: './total-gain-loss.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * TotalGainLossComponent
 *
 * Business purpose:
 * - Display the application's total realized gain/loss calculated by the FIFO
 *   engine. This value is shown prominently on the dashboard and used for
 *   quick verification against detailed matching rows.
 *
 * Responsibilities:
 * - Expose a single computed signal `totalGainLoss` derived from the FIFO
 *   calculation state for templates to render.
 * - Keep display logic minimal; the actual calculation is performed by
 *   `StateService`/FIFO calculation layer.
 */
export class TotalGainLossComponent {
  /** Private signal mapping of the FIFO calculation state. @private */
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });

  /** Runtime i18n helper for translating UI strings in the template. */
  readonly i18n = inject(I18nService);

  /** Computed total realized gain/loss (number). Intended for direct display. */
  readonly totalGainLoss = computed(() => this.fifoState()?.totalRealizedGainLoss ?? 0);
}
