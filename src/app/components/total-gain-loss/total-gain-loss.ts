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
export class TotalGainLossComponent {
  private readonly fifoState = toSignal(inject(StateService).fifoState$, { initialValue: null });
  readonly i18n = inject(I18nService);
  readonly totalGainLoss = computed(() => this.fifoState()?.totalRealizedGainLoss ?? 0);
}
