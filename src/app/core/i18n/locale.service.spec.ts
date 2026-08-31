import { TestBed } from '@angular/core/testing';

import { LocaleService, LOCALE_STORAGE_KEY } from './locale.service';

describe('LocaleService', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    TestBed.resetTestingModule();
  });

  it('returns Bulgarian labels by default', () => {
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.locale()).toBe('bg');
    expect(i18n.text('header.tab.dashboard')).toBe('Табло');
    expect(i18n.text('header.menu.refresh')).toBe('Опресни');
  });

  it('ignores unused interpolation params', () => {
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.text('header.tab.dashboard', { unused: 'x' })).toBe('Табло');
  });

  it('setLocale persists locale, updates html lang, and switches labels', () => {
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.locale()).toBe('bg');

    i18n.setLocale('en');

    expect(i18n.locale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.text('header.tab.dashboard')).toBe('Dashboard');
    expect(i18n.text('header.menu.refresh')).toBe('Refresh');
  });

  it('reads stored locale on construct', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.locale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.text('header.tab.dashboard')).toBe('Dashboard');
  });

  it('setLocale is a no-op when the locale is unchanged', () => {
    const i18n = TestBed.inject(LocaleService);
    i18n.setLocale('bg');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(i18n.locale()).toBe('bg');
  });
});
