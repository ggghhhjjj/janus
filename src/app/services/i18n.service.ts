import { Injectable, signal } from '@angular/core';

interface TranslationMap {
  [key: string]: {
    [locale: string]: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class I18nService {
  private readonly LOCALE_STORAGE_KEY = 'app-locale';
  private readonly DEFAULT_LOCALE = 'bg'; // Bulgarian as default
  private readonly SUPPORTED_LOCALES = ['en', 'bg'];

  readonly currentLocale = signal<string>(this.getInitialLocale());

  private readonly translations: TranslationMap = {
    fifoAccounter: {
      en: 'FIFO Accounter',
      bg: 'FIFO Счетоводител',
    },
    dashboard: {
      en: 'Dashboard',
      bg: 'Таблица',
    },
    transactions: {
      en: 'Transactions',
      bg: 'Транзакции',
    },
    importCsv: {
      en: 'Import CSV',
      bg: 'Импортиране CSV',
    },
    loadingFifoAccounter: {
      en: 'Loading FIFO Accounter…',
      bg: 'Зареждане на FIFO Счетоводител…',
    },
    language: {
      en: 'Language',
      bg: 'Език',
    },
    english: {
      en: 'English',
      bg: 'Английски',
    },
    bulgarian: {
      en: 'Bulgarian',
      bg: 'Български',
    },
  };

  constructor() {}

  private getInitialLocale(): string {
    // Try to get from localStorage first
    const stored = localStorage.getItem(this.LOCALE_STORAGE_KEY);
    if (stored && this.SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }

    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    if (this.SUPPORTED_LOCALES.includes(browserLang)) {
      return browserLang;
    }

    // Default to Bulgarian
    return this.DEFAULT_LOCALE;
  }

  setLocale(locale: string): void {
    if (!this.SUPPORTED_LOCALES.includes(locale)) {
      console.warn(`Unsupported locale: ${locale}`);
      return;
    }

    if (this.currentLocale() !== locale) {
      localStorage.setItem(this.LOCALE_STORAGE_KEY, locale);
      this.currentLocale.set(locale);
    }
  }

  getCurrentLocale(): string {
    return this.currentLocale();
  }

  getSupportedLocales(): string[] {
    return this.SUPPORTED_LOCALES;
  }

  getLocaleLabel(locale: string): string {
    const labels: { [key: string]: string } = {
      en: 'English',
      bg: 'Български',
    };
    return labels[locale] || locale;
  }

  translate(key: string): string {
    const currentLocale = this.currentLocale();
    const translation = this.translations[key];
    if (!translation) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return translation[currentLocale] || translation['en'] || key;
  }
}

