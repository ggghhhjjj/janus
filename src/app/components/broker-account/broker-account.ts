import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-broker-account',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './broker-account.html',
  styleUrl: './broker-account.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrokerAccountComponent {
  private readonly state = inject(StateService);
  readonly i18n = inject(I18nService);

  readonly isExpanded = signal(false);

  readonly balances = computed(() => this.state.brokerAccountBalances());

  readonly hasAnyBalance = computed(() => this.balances().size > 0);

  readonly balanceArray = computed(() => {
    const map = this.balances();
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  readonly primaryBalance = computed(() => {
    const arr = this.balanceArray();
    if (arr.length === 0) return 0;
    // Return the first currency balance (alphabetically sorted, USD will be first if it exists)
    const usdBalance = arr.find(([cur]) => cur === 'USD');
    return usdBalance ? usdBalance[1] : arr[0][1];
  });

  readonly primaryCurrency = computed(() => {
    const arr = this.balanceArray();
    if (arr.length === 0) return 'USD';
    const usdEntry = arr.find(([cur]) => cur === 'USD');
    return usdEntry ? usdEntry[0] : arr[0][0];
  });

  toggleExpanded(): void {
    this.isExpanded.set(!this.isExpanded());
  }

  getCurrencySymbol(currency: string): string {
    const symbols: { [key: string]: string } = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      CHF: 'Fr',
      CAD: 'C$',
      AUD: 'A$',
    };
    return symbols[currency] || currency;
  }

  isPositive(balance: number): boolean {
    return balance > 0;
  }

  isNegative(balance: number): boolean {
    return balance < 0;
  }
}
