import type { Language } from './types.ts';

const RU: Record<string, string> = {
  tasks:       '📋 Задачи',
  notes:       '📝 Заметки',
  reminders:   '⏰ Напоминания',
  search:      '🔍 Поиск',
  contractors: '👥 Подрядчики',
  services:    '💼 Прайс',
  stats:       '📊 Статистика',
  settings:    '⚙️ Настройки',
  admin:       '🔧 Администрирование',
};

const EN: Record<string, string> = {
  tasks:       '📋 Tasks',
  notes:       '📝 Notes',
  reminders:   '⏰ Reminders',
  search:      '🔍 Search',
  contractors: '👥 Contractors',
  services:    '💼 Pricelist',
  stats:       '📊 Stats',
  settings:    '⚙️ Settings',
  admin:       '🔧 Admin',
};

// Button label (any lang) → internal key, e.g. "📋 Задачи" → "tasks"
const LABEL_TO_KEY: Record<string, string> = {};
for (const [key, label] of [...Object.entries(RU), ...Object.entries(EN)]) {
  LABEL_TO_KEY[label] = key;
}

/** Returns internal key if text is a known menu button label, null otherwise. */
export function resolveMenuButton(text: string): string | null {
  return LABEL_TO_KEY[text] ?? null;
}

/** Builds the persistent reply keyboard rows for the main menu. */
export function buildMainKeyboard(lang: Language, isAdmin: boolean): string[][] {
  const m = lang === 'ru' ? RU : EN;
  const rows: string[][] = [
    [m.tasks,       m.notes      ],
    [m.reminders,   m.search     ],
    [m.contractors, m.services   ],
    [m.stats,       m.settings   ],
  ];
  if (isAdmin) rows.push([m.admin]);
  return rows;
}
