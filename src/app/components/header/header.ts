import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
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
 * - Expose `I18nService` to templates for translating UI strings at runtime.
 *
 * Responsibilities:
 * - Manage minimal UI state (language menu visibility) and provide methods
 *   to toggle/close the menu and change the selected locale. Actual locale
 *   persistence and translation behavior are delegated to `I18nService`.
 */
export class HeaderComponent {
  /** Whether the language menu dropdown is currently visible. */
  showLanguageMenu = false;

  /**
   * Runtime i18n service used by templates and for changing locale.
   * Public so templates can call `i18n.translate(...)` directly.
   */
  constructor(public readonly i18n: I18nService) {}

  /** Toggle the visibility of the language menu. */
  toggleLanguageMenu(): void {
    this.showLanguageMenu = !this.showLanguageMenu;
  }

  /** Close the language menu. */
  closeLanguageMenu(): void {
    this.showLanguageMenu = false;
  }

  /**
   * Select a language and apply it via `I18nService`, then close the menu.
   * @param locale Locale code to select (e.g. 'en', 'bg')
   */
  selectLanguage(locale: string): void {
    this.i18n.setLocale(locale);
    this.closeLanguageMenu();
  }
}

