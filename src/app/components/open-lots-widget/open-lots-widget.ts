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
  selector: 'app-open-lots-widget',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './open-lots-widget.html',
  styleUrl: './open-lots-widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenLotsWidgetComponent {
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);

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
