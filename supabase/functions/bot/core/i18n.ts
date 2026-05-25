import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import type { Language } from './types.ts';

const extra: Record<Language, Record<string, string>> = { ru: {}, en: {} };

export function registerLocale(ruKeys: Record<string, string>, enKeys: Record<string, string>): void {
  Object.assign(extra.ru, ruKeys);
  Object.assign(extra.en, enKeys);
}

export function createTranslator(language: Language) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const primary = { ...(ru as Record<string, string>), ...extra.ru };
    const fallback = { ...(en as Record<string, string>), ...extra.en };
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
