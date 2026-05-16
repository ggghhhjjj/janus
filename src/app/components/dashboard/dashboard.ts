import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrokerAccountComponent } from '../broker-account/broker-account';
import { TotalGainLossComponent } from '../total-gain-loss/total-gain-loss';
import { FifoMatchingComponent } from '../fifo-matching/fifo-matching';
import { YearlyBreakdownComponent } from '../yearly-breakdown/yearly-breakdown';
import { OpenLotsComponent } from '../open-lots/open-lots';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    BrokerAccountComponent,
    TotalGainLossComponent,
    YearlyBreakdownComponent,
    OpenLotsComponent,
    FifoMatchingComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * DashboardComponent
 *
 * Business purpose:
 * - Page-level layout container that composes the app's dashboard widgets:
 *   broker account, total gain/loss, yearly breakdown, open lots and FIFO matching.
 * - Provides minimal, view-focused derived state used by the template (for example
 *   to show/hide controls when funding/withdrawal transactions exist).
 * - Delegates all data fetching and heavy calculations to services and child widgets;
 *   this component should remain layout-only with small convenience signals.
 *
 * Responsibilities:
 * - Arrange child widgets and expose a concise surface for template bindings.
 * - Inject `StateService` and `I18nService` for widgets and template usage.
 *
 * Public surface (used in templates):
 * - `i18n`: runtime i18n helper (translate keys at render time).
 * - `hasFundingTransactions`: a computed signal returning `true` when any
 *   funding/withdrawal transactions exist.
 */
export class DashboardComponent {
  /**
   * Global application state service. Widgets and this component read state here.
   * @private
   */
  private readonly state = inject(StateService);

  /**
   * Signal representation of the FIFO calculation state observable.
   * Kept as a signal to allow template bindings or child components to react
   * without subscribing manually to the observable stream.
   * Initial value is `null` until the first emission.
   * @private
   */
  private readonly fifoState = toSignal(this.state.fifoState$, { initialValue: null });

  /**
   * i18n runtime service used by templates to translate UI strings.
   * Exposed publicly so templates can call `i18n.translate(...)`.
   */
  readonly i18n = inject(I18nService);

  /**
   * Computed boolean signal that indicates whether there are any funding or
   * withdrawal transactions in the application state.
   *
   * Purpose: used by the template to conditionally render sections or controls
   * that are relevant only when funding/withdrawal history exists.
   *
   * Example usage in template:
   * - Show a "funding history" header only when `hasFundingTransactions()` is true.
   */
  readonly hasFundingTransactions = computed(() => {
    return (
      this.state.transactions.some((t) => t.type === 'funding' || t.type === 'withdrawal')
    );
  });
}
