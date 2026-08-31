import { describe, expect, it } from 'vitest';

import { detectLocale } from './locale-url';

describe('detectLocale', () => {
  it('uses stored en over lang="bg"', () => {
    expect(detectLocale('bg', 'en')).toBe('en');
  });

  it('uses stored bg over lang="en"', () => {
    expect(detectLocale('en', 'bg')).toBe('bg');
  });

  it('defaults to bg when storage is missing', () => {
    expect(detectLocale('bg', null)).toBe('bg');
  });

  it('defaults to bg when storage is invalid', () => {
    expect(detectLocale('bg', 'fr')).toBe('bg');
  });

  it('uses htmlLang en when storage is missing', () => {
    expect(detectLocale('en', null)).toBe('en');
  });
});
