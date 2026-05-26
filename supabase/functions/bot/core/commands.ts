import type { BotCommand } from '../telegram.ts';

/** Commands visible to all users in the "/" dropdown. */
export const DEFAULT_COMMANDS: BotCommand[] = [
  { command: 'add',          description: 'Добавить задачу / заметку / напоминание' },
  { command: 'list',         description: 'Все дела' },
  { command: 'today',        description: 'На сегодня' },
  { command: 'project',      description: 'Добавить проект' },
  { command: 'projects',     description: 'Мои проекты' },
  { command: 'find',         description: 'Найти проект' },
  { command: 'ask',          description: 'Спросить базу знаний' },
  { command: 'stats',        description: 'Моя статистика' },
  { command: 'settings',     description: 'Настройки' },
  { command: 'subscription', description: 'Подписка и тарифы' },
  { command: 'language',     description: 'Сменить язык' },
  { command: 'help',         description: 'Справка' },
];

/** Extra commands shown only in the admin user's "/" dropdown. */
export const ADMIN_COMMANDS: BotCommand[] = [
  ...DEFAULT_COMMANDS,
  { command: 'adminmenu',  description: '🔧 Меню администратора' },
  { command: 'adminstats', description: 'Статистика платформы'  },
  { command: 'configs',    description: 'Конфигурация'           },
];
