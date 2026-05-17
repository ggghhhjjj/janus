import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService } from '../../services/i18n.service';
import { ActionMenuComponent, ActionMenuItem } from '../action-menu/action-menu';
import { LanguageSelectorComponent } from '../language-selector/language-selector';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ActionMenuComponent, LanguageSelectorComponent],
  templateUrl: './header.html',
  styleUrl: './header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * HeaderComponent
 *
 * Business purpose:
 * - Render the application header and primary navigation, including a
 *   language selection menu for runtime locale switching.
 * - Provide a refresh action for macOS/iOS standalone app users.
 * - Expose `I18nService` to templates for translating UI strings at runtime.
 *
 * Responsibilities:
 * - Manage minimal UI state (language menu visibility, loading state) and provide methods
 *   to toggle/close the menu, refresh the app, and change the selected locale.
 *   Actual locale persistence and translation behavior are delegated to `I18nService`.
 */
export class HeaderComponent {
  /** Whether the app is currently refreshing. */
  readonly isRefreshing = signal(false);

  /**
   * Runtime i18n service used by templates and for changing locale.
   * Public so templates can call `i18n.translate(...)` directly.
   */
  constructor(public readonly i18n: I18nService) {}

  /** Action menu items for the 3-dot menu. */
  readonly actionMenuItems = (): ActionMenuItem[] => [
    {
      label: this.i18n.translate('refresh'),
      ariaLabel: this.i18n.translate('refreshTooltip'),
      action: () => this.refresh(),
    },
  ];

  /**
   * Refresh the entire application by reloading all resources.
   * Shows a loading animation while reloading. Used for macOS/iOS standalone app users.
   */
  refresh(): void {
    this.isRefreshing.set(true);
    // Reload the entire page to fetch fresh resources
    window.location.reload();
  }
}

