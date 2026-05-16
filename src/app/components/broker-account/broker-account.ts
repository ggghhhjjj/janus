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
  /**
   * BrokerAccountComponent
   *
   * Business purpose:
   * - Display broker account balances by currency and provide a compact primary
   *   balance view for the dashboard.
   * - Offer a small interactive card: expand/collapse details and provide
   *   convenience utilities for rendering currency symbols and sign checks.
   *
   * Responsibilities:
   * - Read broker balances from `StateService` and expose template-friendly
   *   signals (`balances`, `balanceArray`, `primaryBalance`, `primaryCurrency`).
   * - Keep UI logic local (expansion state and simple helpers); heavy data
   *   retrieval remains in `StateService`.
   */
  export class BrokerAccountComponent {
    /** Global application state service providing balances and writable signals. */
    private readonly state = inject(StateService);

    /** i18n runtime service exposed for template translations. */
    readonly i18n = inject(I18nService);

    /** Whether the broker account detail card is expanded in the UI. */
    readonly isExpanded = signal(false);

    /** Map of currency code → balance, sourced from `StateService`. */
    readonly balances = computed(() => this.state.brokerAccountBalances());

    /** True when there is at least one non-zero balance. Useful for conditional rendering. */
    readonly hasAnyBalance = computed(() => this.balances().size > 0);

    /**
     * Sorted array of `[currency, balance]` entries derived from `balances`.
     * Purpose: make template iteration deterministic (alphabetical order).
     */
    readonly balanceArray = computed(() => {
      const map = this.balances();
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    });

    /**
     * Primary balance to show prominently on the dashboard.
     * Preference: return USD if present, otherwise the first sorted currency.
     */
    readonly primaryBalance = computed(() => {
      const arr = this.balanceArray();
      if (arr.length === 0) return 0;
      const usdBalance = arr.find(([cur]) => cur === 'USD');
      return usdBalance ? usdBalance[1] : arr[0][1];
    });

    /**
     * Primary currency code corresponding to `primaryBalance` (prefers USD).
     */
    readonly primaryCurrency = computed(() => {
      const arr = this.balanceArray();
      if (arr.length === 0) return 'USD';
      const usdEntry = arr.find(([cur]) => cur === 'USD');
      return usdEntry ? usdEntry[0] : arr[0][0];
    });

    /** Toggle the expanded/collapsed state of the account card. */
    toggleExpanded(): void {
      this.isExpanded.set(!this.isExpanded());
    }

    /** Utility: true when the balance is positive. */
    isPositive(balance: number): boolean {
      return balance > 0;
    }

    /** Utility: true when the balance is negative. */
    isNegative(balance: number): boolean {
      return balance < 0;
    }
  }
