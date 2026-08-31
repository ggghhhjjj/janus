export type AppLocale = 'bg' | 'en';

export function detectLocale(htmlLang: string, stored: string | null): AppLocale {
  if (stored === 'en' || stored === 'bg') {
    return stored;
  }
  return htmlLang === 'en' ? 'en' : 'bg';
}
