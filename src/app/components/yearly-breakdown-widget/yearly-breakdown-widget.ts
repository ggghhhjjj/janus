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
  selector: 'app-yearly-breakdown-widget',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './yearly-breakdown-widget.html',
  styleUrl: './yearly-breakdown-widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearlyBreakdownWidgetComponent {
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);

  readonly yearlyBreakdown = computed<YearlyRow[]>(() => {
    const yearly = this.fifoState()?.yearlyGainLoss ?? {};
    return Object.entries(yearly)
      .map(([year, gainLoss]) => ({ year: Number(year), gainLoss }))
      .sort((a, b) => b.year - a.year);
  });
}
