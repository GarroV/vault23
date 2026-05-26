import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import type { Language } from './types.ts';

const extra: Record<Language, Record<string, string>> = { ru: {}, en: {} };

export function registerLocale(ruKeys: Record<string, string>, enKeys: Record<string, string>): void {
  Object.assign(extra.ru, ruKeys);
  Object.assign(extra.en, enKeys);
}

/** Returns the full merged locale maps (static + registered modules). Used by cabinet-api. */
export function getAllLocales(): Record<Language, Record<string, string>> {
  return {
    ru: { ...(ru as Record<string, string>), ...extra.ru },
    en: { ...(en as Record<string, string>), ...extra.en },
  };
}

export function createTranslator(
  language: Language,
  overrides?: Record<Language, Record<string, string>>,
) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const primary  = { ...(ru as Record<string, string>), ...extra.ru,  ...(overrides?.ru  ?? {}) };
    const fallback = { ...(en as Record<string, string>), ...extra.en, ...(overrides?.en ?? {}) };
    const source = language === 'ru' ? primary : fallback;
    let text = source[key] ?? fallback[key] ?? key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }

    return text;
  };
}
