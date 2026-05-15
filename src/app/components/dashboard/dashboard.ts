import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrokerAccountComponent } from '../broker-account/broker-account';
import { TotalGainLossWidgetComponent } from '../total-gain-loss-widget/total-gain-loss-widget';
import { FifoMatchingWidgetComponent } from '../fifo-matching-widget/fifo-matching-widget';

interface OpenLotSummary {
  ticker: string;
  totalQty: number;
  avgCostBasis: number;
}

interface YearlyRow {
  year: number;
  gainLoss: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, BrokerAccountComponent, TotalGainLossWidgetComponent, FifoMatchingWidgetComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly state = inject(StateService);
  private readonly fifoState = toSignal(this.state.fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);

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
}
