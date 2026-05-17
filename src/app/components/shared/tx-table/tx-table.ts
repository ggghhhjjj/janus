import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * TxTableComponent
 *
 * Purpose: CSS ownership boundary for the transaction-table design system.
 * Acts as a pass-through content wrapper whose sole job is to own tx-table.css
 * as the single source of truth for all transaction-table cell styles
 * (column widths, date layout, num-cell, type badges, conflict rows, etc.).
 *
 * ViewEncapsulation.None is intentional: Angular's emulated encapsulation stamps
 * each element with the originating component's _ngcontent attribute, so projected
 * content from consumers (TransactionTableComponent, SwapModalComponent) would not
 * match a scoped wrapper's CSS rules. None makes the styles global-by-convention,
 * with BEM class names as the safety boundary.
 *
 * Usage: wrap any <div class="table-wrapper"><table class="data-table"> in
 * <app-tx-table> to signal that the content uses this design system.
 */
@Component({
  selector: 'app-tx-table',
  standalone: true,
  // Pass-through: renders no DOM of its own, only projects consumer content.
  template: '<ng-content></ng-content>',
  styleUrl: './tx-table.css',
  // Intentional: styles must apply to projected content from other components.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxTableComponent {}
