import type { BotCommand } from '../telegram.ts';

/** Commands visible to all users in the "/" dropdown. */
export const DEFAULT_COMMANDS: BotCommand[] = [
  { command: 'task',        description: 'Создать задачу' },
  { command: 'tasks',       description: 'Мои задачи' },
  { command: 'note',        description: 'Создать заметку' },
  { command: 'notes',       description: 'Мои заметки' },
  { command: 'remind',      description: 'Поставить напоминание' },
  { command: 'reminders',   description: 'Мои напоминания' },
  { command: 'search',      description: 'Поиск по задачам и заметкам' },
  { command: 'contractors', description: 'Подрядчики' },
  { command: 'services',    description: 'Прайс-лист' },
  { command: 'ask',         description: 'Спросить базу знаний' },
  { command: 'stats',       description: 'Моя статистика' },
  { command: 'settings',    description: 'Настройки' },
  { command: 'subscription',description: 'Подписка и тарифы' },
  { command: 'language',    description: 'Сменить язык' },
  { command: 'help',        description: 'Справка' },
];

/** Extra commands shown only in the admin user's "/" dropdown. */
export const ADMIN_COMMANDS: BotCommand[] = [
  ...DEFAULT_COMMANDS,
  { command: 'adminmenu',   description: '🔧 Меню администратора' },
  { command: 'adminstats',  description: 'Статистика платформы' },
  { command: 'configs',     description: 'Конфигурация' },
];
