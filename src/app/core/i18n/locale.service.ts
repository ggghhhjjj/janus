import { Injectable, signal } from '@angular/core';

import { detectLocale, type AppLocale } from './locale-url';
import { TRANSLATIONS, type TranslationKey } from './translations';

export const LOCALE_STORAGE_KEY = 'janus-locale';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locale = signal<AppLocale>(this.readInitial());

  constructor() {
    this.apply(this.locale());
  }

  text(key: TranslationKey, params?: Record<string, string>): string {
    let value = TRANSLATIONS[this.locale()][key];
    if (params) {
      for (const [name, replacement] of Object.entries(params)) {
        value = value.replaceAll(`{${name}}`, replacement);
      }
    }
    return value;
  }

  setLocale(next: AppLocale): void {
    if (next === this.locale()) {
      return;
    }
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
    this.apply(next);
    this.locale.set(next);
  }

  private readInitial(): AppLocale {
    return detectLocale(document.documentElement.lang, localStorage.getItem(LOCALE_STORAGE_KEY));
  }

  private apply(locale: AppLocale): void {
    document.documentElement.lang = locale;
  }
}
