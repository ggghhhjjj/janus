import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrokerAccountComponent } from '../broker-account/broker-account';
import { TotalGainLossWidgetComponent } from '../total-gain-loss-widget/total-gain-loss-widget';
import { FifoMatchingComponent } from '../fifo-matching/fifo-matching';
import { YearlyBreakdownWidgetComponent } from '../yearly-breakdown-widget/yearly-breakdown-widget';
import { OpenLotsWidgetComponent } from '../open-lots-widget/open-lots-widget';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    BrokerAccountComponent,
    TotalGainLossWidgetComponent,
    YearlyBreakdownWidgetComponent,
    OpenLotsWidgetComponent,
    FifoMatchingComponent,
  ],
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
}
