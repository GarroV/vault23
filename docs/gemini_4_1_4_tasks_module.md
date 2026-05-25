# Промт для Gemini — Шаги 4.1–4.4: Модуль Tasks

> Скопируй всё содержимое этого файла и вставь в Gemini.

---

Ты пишешь TypeScript/Deno код для Supabase Edge Functions.
Это часть проекта Task Assistant Bot — мультитенантный SaaS на Telegram.

Стек: Supabase (Postgres + Edge Functions + Storage) · TypeScript/Deno · Telegram Bot API · OpenAI.

Ниже — три документа-источника правды и реальные TypeScript-интерфейсы ядра. Следуй им строго.

---
## DATA_MODEL.md (выдержка)

### `workspaces`
| id | name | status | plan | trial_ends_at | created_at | updated_at |

### `topics`
| id | workspace_id | name | is_default | visible | created_at |

Ровно одна тема на воркспейс имеет `is_default = true`. При создании воркспейса автоматически сидируется тема «Прочее»/«Other».

### `categories`
| id | workspace_id | name | visible | created_at |

### `tasks`
| id | workspace_id | title | description | status | contractor_id | topic_id | category_id | parent_task_id | due_at | deleted_at | created_at | updated_at |

- `status`: `open` / `in_progress` / `done` / `deferred`
- `topic_id` — NOT NULL, FK → topics(id)
- Остальные FK — nullable
- Soft-delete: `deleted_at timestamptz` (null = не удалена)

### `people`
| id | workspace_id | name | contractor_id | user_id | archived_at | created_at |

### `task_participants`
| id | workspace_id | task_id | person_id | role |
- `role`: `executor` / `participant` / `observer`
- UNIQUE(task_id, person_id)

---
## MODULE_CONTRACT.md

### Принцип
Ядро не знает о конкретных модулях. Каждый модуль реализует `BotModule` и регистрируется в реестре при старте. Ядро маршрутизирует событие нужному модулю.

### Реальные TypeScript-интерфейсы (из core/types.ts):

```typescript
export type Language = 'ru' | 'en';

export interface BotEvent {
  updateId: number;
  type: 'command' | 'text' | 'voice' | 'file' | 'callback_query';
  text?: string;
  source: 'keyboard' | 'voice' | 'button';
  command?: string;
  callbackData?: string;
  fileId?: string;
  mimeType?: string;
  rawUpdate: unknown;
}

export interface SessionState {
  id: string;
  state: string;
  data: Record<string, unknown>;
}

export interface InlineButton {
  text: string;
  callbackData: string; // camelCase — ядро конвертирует в callback_data для Telegram
}

export interface GateResult {
  allowed: boolean;
  reason?: 'workspace_suspended' | 'workspace_cancelled' | 'plan_limit' | 'feature_not_in_plan';
}

export interface ModuleResult {
  ok: boolean;
  session?: { state: string; data: Record<string, unknown> };
  clearSession?: boolean;
}

export interface BotContext {
  user: { id: string; workspaceId: string; language: Language; telegramId: string; };
  workspace: { id: string; status: string; plan: string; };
  session: SessionState;
  event: BotEvent;
  t: (key: string, params?: Record<string, string | number>) => string;
  reply: (text: string) => Promise<void>;
  replyWithButtons: (text: string, buttons: InlineButton[][]) => Promise<void>;
  gate: (feature: string) => GateResult;
  db: SupabaseClient; // service_role — RLS обходится, фильтровать по workspace_id вручную
}

export interface BotModule {
  name: string;
  commands: string[];
  canHandle(event: BotEvent, session: SessionState): boolean;
  handle(ctx: BotContext): Promise<ModuleResult>;
}
```

### Пути импортов из модуля:
```typescript
import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult, SupabaseClient } from '../../core/types.ts';
```

### Структура файлов модуля:
```
supabase/functions/bot/modules/tasks/
  index.ts      — реализует BotModule
  handlers.ts   — логика команд
  queries.ts    — запросы к БД
  locales/
    ru.ts
    en.ts
```

---
## CONVENTIONS.md

### Именование
- Переменные/функции — `camelCase`
- Классы/интерфейсы — `PascalCase`
- Константы — `UPPER_SNAKE_CASE`
- Файлы — `kebab-case`, исключение: `index.ts`
- i18n ключи: `<контекст>_<действие>` — `task_created`, `error_empty_title`
  - Ошибки: `error_` prefix
  - Вопросы/запросы ввода: `ask_` prefix
  - Подтверждения: `confirm_` prefix

### i18n
- Все тексты через `ctx.t('ключ')` — никогда строкой напрямую
- Оба файла `ru.ts` и `en.ts` заполняются одновременно
- Параметры через `{ключ}`: `ctx.t('task_created', { title: task.title })`

### Стратегия ошибок
```typescript
// Класс 1 — ошибка пользователя
await ctx.reply(ctx.t('error_empty_title'));
return { ok: false }; // не сбрасываем сессию — ждём повтора

// Класс 3 — баг
console.error('[tasks] unexpected error', { error: err.message, userId: ctx.user.id });
await ctx.reply(ctx.t('error_unexpected'));
return { ok: false, clearSession: true };
```

### Стиль кода
- Нет `any` — использовать `unknown` и сужать тип явно
- Async/await везде, не `.then()`
- Ранний возврат вместо глубокой вложенности
- Точки с запятой — ставить. Кавычки — одинарные.

### Правила для генерации
1. Все поля БД — строго по DATA_MODEL выше
2. Каждый запрос к БД — ТОЛЬКО в `queries.ts`
3. `workspace_id` — ВСЕГДА из `ctx.user.workspaceId`, явный фильтр в каждом запросе
4. Нет RLS-кода в TS — доверять явным фильтрам + политикам БД
5. `SupabaseClient` — импортировать из `'../../core/types.ts'`
6. `answerCallbackQuery` — НЕ нужен в модуле, ядро вызывает его автоматически

---

## Задача

Реализовать модуль `tasks` — основной модуль бота. Покрывает шаги 4.1–4.4.

### Команда `/task` — создать задачу (многошаговый диалог)

**Шаг 1** — пользователь вводит `/task`:
- Бот отвечает: `ask_task_title` («Введи название задачи:»)
- Сессия переходит в `task_awaiting_title`

**Шаг 2** — пользователь вводит название:
- Если пустое/только пробелы → `error_empty_title`, остаёмся в `task_awaiting_title`
- Сохранить `{ title }` в `session.data`
- Запросить список тем воркспейса (`visible = true`)
- Если тема одна (дефолтная) → сразу создать задачу с ней (пропустить шаг 3)
- Если тем несколько → показать кнопки тем, сессия `task_awaiting_topic`

**Шаг 3** — пользователь нажимает кнопку темы (`callbackData = 'task_topic:<topic_id>'`):
- Создать задачу с выбранной темой
- Сессия очищается (`clearSession: true`)
- Подтверждение: `task_created` с названием

**Параметры создаваемой задачи:**
```
workspace_id = ctx.user.workspaceId
title        = из session.data.title
topic_id     = выбранная тема
status       = 'open'
```
Всё остальное — NULL.

---

### Команда `/tasks` — список открытых задач

- Выборка: `status IN ('open', 'in_progress')` AND `deleted_at IS NULL` AND `workspace_id = ctx.user.workspaceId`
- Сортировка: `created_at DESC`
- Лимит: 10 задач
- Если задач 0 → `tasks_empty`
- Каждая задача — отдельное сообщение с кнопками:
  - `✅ Готово` → `callbackData: 'task_done:<id>'`
  - `⏸ Отложить` → `callbackData: 'task_defer:<id>'`
- Формат текста: `{title}` (просто название; тему не показываем пока)

---

### Callback: смена статуса задачи

**`task_done:<task_id>`** → статус `done`
**`task_defer:<task_id>`** → статус `deferred`

Для обоих:
1. Найти задачу по `id` WHERE `workspace_id = ctx.user.workspaceId` (защита от чужих задач)
2. Если не найдена → `error_task_not_found`
3. Обновить `status`
4. Ответить: `task_done_confirm` или `task_deferred_confirm`

`answerCallbackQuery` вызывать НЕ нужно — ядро делает это автоматически.

---

### canHandle

```typescript
canHandle(event: BotEvent, session: SessionState): boolean {
  if (session.state.startsWith('task_')) return true;
  if (event.type === 'callback_query') {
    return (event.callbackData?.startsWith('task_done:') ||
            event.callbackData?.startsWith('task_defer:') ||
            event.callbackData?.startsWith('task_topic:')) ?? false;
  }
  return false;
}
```

---

## Что сгенерировать

```
// supabase/functions/bot/modules/tasks/index.ts
// суть: BotModule, команды ['/task', '/tasks'], canHandle, handle с роутингом по event и session.state

// supabase/functions/bot/modules/tasks/handlers.ts
// функции: handleTaskCreate, handleTaskList, handleTaskStatusChange, handleTopicSelected

// supabase/functions/bot/modules/tasks/queries.ts
// функции: createTask, getOpenTasks, getTopics, updateTaskStatus, getTaskById

// supabase/functions/bot/modules/tasks/locales/ru.ts
// supabase/functions/bot/modules/tasks/locales/en.ts
```

## Ключи локализации (минимум)

```typescript
// ru.ts и en.ts должны содержать как минимум:
ask_task_title        // «Введи название задачи:»
task_created          // «Задача создана: {title}»
tasks_empty           // «Открытых задач нет.»
task_choose_topic     // «Выбери тему:»
task_done_confirm     // «Задача закрыта ✅»
task_deferred_confirm // «Задача отложена ⏸»
task_not_found        // «Задача не найдена.»
error_empty_title     // «Название не может быть пустым.»
error_unexpected      // «Что-то пошло не так. Попробуй ещё раз.»
```

## Ограничения

- НЕ реализовывать: people lookup, contractor assignment, category selection, due_at, reminders — это следующие шаги
- НЕ импортировать из других файлов кроме `../../core/types.ts`
- workspace_id — ВСЕГДА из ctx.user.workspaceId, явно в каждом запросе к БД
- Нет `any` типов
- Queries — только в queries.ts

## Формат ответа

Пять файлов, каждый с путём в комментарии:

```
// supabase/functions/bot/modules/tasks/index.ts
<код>

// supabase/functions/bot/modules/tasks/handlers.ts
<код>

// supabase/functions/bot/modules/tasks/queries.ts
<код>

// supabase/functions/bot/modules/tasks/locales/ru.ts
<код>

// supabase/functions/bot/modules/tasks/locales/en.ts
<код>
```
