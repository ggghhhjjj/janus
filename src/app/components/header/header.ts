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
export class HeaderComponent {
  showLanguageMenu = false;

  constructor(public readonly i18n: I18nService) {}

  toggleLanguageMenu(): void {
    this.showLanguageMenu = !this.showLanguageMenu;
  }

  closeLanguageMenu(): void {
    this.showLanguageMenu = false;
  }

  selectLanguage(locale: string): void {
    this.i18n.setLocale(locale);
    this.closeLanguageMenu();
  }
}

