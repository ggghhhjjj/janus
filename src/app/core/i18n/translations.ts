import type { AppLocale } from './locale-url';

const BG = {
  'header.menu': 'Меню',
  'header.language': 'Език',
  'header.share': 'Сподели',
  'header.shareCopied': 'Копирано',
  'header.status': 'Статус',
  'header.tab.dashboard': 'Табло',
  'header.menu.refresh': 'Опресни',
  'header.shareTitle': 'Janus',
  'header.shareText': 'Janus',
} as const;

export type TranslationKey = keyof typeof BG;

export const TRANSLATIONS: Record<AppLocale, Record<TranslationKey, string>> = {
  bg: BG,
  en: {
    'header.menu': 'Menu',
    'header.language': 'Language',
    'header.share': 'Share',
    'header.shareCopied': 'Copied',
    'header.status': 'Status',
    'header.tab.dashboard': 'Dashboard',
    'header.menu.refresh': 'Refresh',
    'header.shareTitle': 'Janus',
    'header.shareText': 'Janus',
  },
};
