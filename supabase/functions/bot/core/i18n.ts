import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import type { Language } from './types.ts';

type Translations = typeof en;

const locales: Record<Language, Translations> = { ru, en };

export function createTranslator(language: Language) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const primary = locales[language] as Record<string, string>;
    const fallback = locales['en'] as Record<string, string>;
    let text = primary[key] ?? fallback[key] ?? key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }

    return text;
  };
}
