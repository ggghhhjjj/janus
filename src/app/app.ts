import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { UiHeader, type HeaderLanguage } from 'ui-header';

import { CordovaService } from './cordova.service';
import { LocaleService } from './core/i18n/locale.service';
import { AppUpdateService } from './core/update/app-update.service';

@Component({
  selector: 'app-root',
  imports: [UiHeader],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly cordova = inject(CordovaService);
  private readonly updates = inject(AppUpdateService);
  protected readonly i18n = inject(LocaleService);

  protected readonly ready = signal(false);
  protected readonly selectedTabId = 'dashboard';
  protected readonly languages: HeaderLanguage[] = [{ code: 'BG' }, { code: 'EN' }];

  protected readonly tabs = computed(() => [
    { id: 'dashboard', label: this.i18n.text('header.tab.dashboard') },
  ]);

  protected readonly menuItems = computed(() => [
    { id: 'refresh', label: this.i18n.text('header.menu.refresh') },
  ]);

  protected readonly activeLanguage = computed(() => this.i18n.locale().toUpperCase());

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(() => {
      console.log('Running ' + this.cordova.platformInfo);
      this.ready.set(true);
    });
  }

  protected onMenuSelect(id: string): void {
    if (id === 'refresh') {
      void this.updates.reloadApp();
    }
  }

  protected onLanguageSelect(code: string): void {
    this.i18n.setLocale(code.toLowerCase() === 'en' ? 'en' : 'bg');
  }
}
