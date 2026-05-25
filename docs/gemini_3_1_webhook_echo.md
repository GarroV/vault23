# Промт для Gemini — Шаг 3.1: Telegram Webhook + Echo

> Скопируй всё содержимое этого файла и вставь в Gemini.

---

Ты пишешь TypeScript/Deno код для Supabase Edge Functions.
Это часть проекта Task Assistant Bot — мультитенантный SaaS на Telegram.

Стек: Supabase (Postgres + Edge Functions + Storage) · TypeScript/Deno · Telegram Bot API · OpenAI.

Ниже — три документа, которые являются источниками правды. Следуй им строго.

---
## DATA_MODEL.md

> Источник правды по схеме БД.
> Правила: каждая содержательная таблица несёт `workspace_id` + RLS. Время в UTC (timestamptz). Soft-delete через `deleted_at` / `archived_at`. Telegram ID — не первичный ключ.

### Конвенции схемы

- Первичные ключи — `uuid`, `DEFAULT gen_random_uuid()`.
- Все содержательные таблицы несут `workspace_id uuid NOT NULL REFERENCES workspaces(id)`.
- Временные поля — `timestamptz` (UTC). Никакого `timestamp without time zone`.
- Soft-delete — `deleted_at timestamptz` (задачи, заметки) или `archived_at timestamptz` (справочники).
- Имена таблиц — множественное число, `snake_case`.
- Имена полей — `snake_case`.

### Таблицы

#### `workspaces`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `name` | text | NOT NULL | Название воркспейса |
| `status` | text | NOT NULL, DEFAULT 'trial' | `trial` / `active` / `past_due` / `suspended` / `cancelled` |
| `plan` | text | NOT NULL, DEFAULT 'free' | Тариф |
| `trial_ends_at` | timestamptz | | Конец пробного периода |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `users`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `display_name` | text | | Имя пользователя |
| `language` | text | NOT NULL, DEFAULT 'en' | `ru` или `en` |
| `timezone` | text | | Заморожено |
| `consent_given_at` | timestamptz | | |
| `consent_version` | text | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id)`.

#### `auth_methods`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| `type` | text | NOT NULL | `telegram` / `email` / `google` |
| `value` | text | NOT NULL | Telegram ID (строкой) / email / Google sub |
| `confirmed` | boolean | NOT NULL, DEFAULT false | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** `UNIQUE(type, value)`.
**Индексы:** `(type, value)`, `(user_id)`.

#### `contractors`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | |
| `notes` | text | | |
| `archived_at` | timestamptz | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `contractor_contacts`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | NOT NULL, FK → contractors(id) ON DELETE CASCADE | |
| `type` | text | NOT NULL | `phone` / `email` / `telegram` / `whatsapp` / `instagram` / `website` / `other` |
| `value` | text | NOT NULL | |
| `label` | text | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `topics`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | |
| `is_default` | boolean | NOT NULL, DEFAULT false | |
| `visible` | boolean | NOT NULL, DEFAULT true | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `categories`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | |
| `visible` | boolean | NOT NULL, DEFAULT true | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `tasks`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `title` | text | NOT NULL | |
| `description` | text | | |
| `status` | text | NOT NULL, DEFAULT 'open' | `open` / `in_progress` / `done` / `deferred` |
| `contractor_id` | uuid | FK → contractors(id), nullable | |
| `topic_id` | uuid | NOT NULL, FK → topics(id) | |
| `category_id` | uuid | FK → categories(id), nullable | |
| `parent_task_id` | uuid | FK → tasks(id), nullable | |
| `due_at` | timestamptz | | |
| `deleted_at` | timestamptz | | Soft-delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `people`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | |
| `contractor_id` | uuid | FK → contractors(id), nullable | |
| `user_id` | uuid | FK → users(id), nullable | |
| `archived_at` | timestamptz | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `task_participants`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `task_id` | uuid | NOT NULL, FK → tasks(id) ON DELETE CASCADE | |
| `person_id` | uuid | NOT NULL, FK → people(id) | |
| `role` | text | NOT NULL, DEFAULT 'executor' | `executor` / `participant` / `observer` |

**Ограничения:** `UNIQUE(task_id, person_id)`.

#### `notes`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `task_id` | uuid | FK → tasks(id), nullable | |
| `content` | text | NOT NULL | |
| `source` | text | NOT NULL, DEFAULT 'text' | `text` / `voice` |
| `session_id` | text | | |
| `deleted_at` | timestamptz | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `attachments`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `entity_type` | text | NOT NULL | `task` / `note` |
| `entity_id` | uuid | NOT NULL | |
| `file_name` | text | NOT NULL | |
| `mime_type` | text | | |
| `file_size` | bigint | | |
| `storage_path` | text | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `time_entries`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `task_id` | uuid | NOT NULL, FK → tasks(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | |
| `started_at` | timestamptz | NOT NULL | |
| `ended_at` | timestamptz | | NULL если ещё идёт |
| `duration_seconds` | integer | | |
| `notes` | text | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `reminders`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | |
| `entity_type` | text | | `task` / NULL |
| `entity_id` | uuid | | |
| `remind_at` | timestamptz | NOT NULL | |
| `status` | text | NOT NULL, DEFAULT 'pending' | `pending` / `sent` / `cancelled` |
| `message` | text | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `services`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | FK → contractors(id), nullable | |
| `name` | text | NOT NULL | |
| `description` | text | | |
| `price` | numeric(12,2) | | |
| `currency` | text | DEFAULT 'RUB' | |
| `unit` | text | | |
| `archived_at` | timestamptz | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `kb_entries`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | FK → contractors(id), nullable | |
| `title` | text | NOT NULL | |
| `content` | text | NOT NULL | |
| `embedding` | vector(1536) | | |
| `status` | text | NOT NULL, DEFAULT 'pending' | `pending` / `approved` |
| `source_type` | text | | `manual` / `document` / `note` |
| `source_id` | uuid | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `bot_sessions`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | |
| `state` | text | NOT NULL, DEFAULT 'idle' | |
| `data` | jsonb | DEFAULT '{}' | |
| `expires_at` | timestamptz | | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** `UNIQUE(user_id)`.

#### `token_usage`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `operation_type` | text | NOT NULL | `whisper` / `embedding` / `generation` |
| `model` | text | NOT NULL | |
| `input_tokens` | integer | | |
| `output_tokens` | integer | | |
| `total_tokens` | integer | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

#### `processed_updates`
| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `update_id` | bigint | PK | Telegram update_id |
| `processed_at` | timestamptz | NOT NULL, DEFAULT now() | |

> Глобальная таблица — `workspace_id` не нужен. RLS включён, политик нет → доступ только через service_role.

---
## MODULE_CONTRACT.md

> Как модуль регистрируется в ядре и общается с ним.

### Принцип

Ядро не знает о конкретных модулях. Каждый модуль реализует интерфейс `BotModule` и регистрируется в реестре при старте функции. Ядро маршрутизирует входящее событие нужному модулю и передаёт ему контекст `BotContext`.

Бот принимает ввод → ядро разбирает → передаёт модулю → модуль вызывает логику → возвращает результат.
Бизнес-логика живёт в модуле и слое данных, **не** в маршрутизаторе.

### Интерфейс модуля

```typescript
interface BotModule {
  name: string;
  commands: string[];
  canHandle(event: BotEvent, session: SessionState): boolean;
  handle(ctx: BotContext): Promise<ModuleResult>;
}
```

### Контекст (BotContext)

```typescript
interface BotContext {
  user: {
    id: string;
    workspaceId: string;
    language: 'ru' | 'en';
    telegramId: string;
  };
  workspace: {
    id: string;
    status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
    plan: string;
  };
  session: SessionState;
  event: BotEvent;
  t: (key: string, params?: Record<string, string | number>) => string;
  reply: (text: string, options?: ReplyOptions) => Promise<void>;
  replyWithButtons: (text: string, buttons: InlineButton[][]) => Promise<void>;
  gate: (feature: string) => GateResult;
  db: SupabaseClient;
}
```

### Входящее событие (BotEvent)

```typescript
interface BotEvent {
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
```

### Состояние сессии (SessionState)

```typescript
interface SessionState {
  id: string;
  state: string;
  data: Record<string, unknown>;
}
```

### Результат обработки (ModuleResult)

```typescript
interface ModuleResult {
  ok: boolean;
  session?: { state: string; data: Record<string, unknown>; };
  clearSession?: boolean;
}
```

### Структура файлов

```
/supabase/functions
  /bot
    index.ts        — точка входа, вебхук, сборка ctx
    telegram.ts     — клиент Telegram Bot API
    idempotency.ts  — проверка/запись processed_updates
    /core
      registry.ts   — реестр и маршрутизация
      router.ts     — алгоритм выбора модуля
      i18n.ts       — загрузчик переводов, функция t()
      gate.ts       — заглушка gate
      session.ts    — чтение/запись bot_sessions
      types.ts      — все TypeScript-интерфейсы
      /locales
        ru.ts
        en.ts
    /modules
      /tasks
        index.ts
        handlers.ts
        queries.ts
        /locales
          ru.ts
          en.ts
```

---
## CONVENTIONS.md

> Именование, стиль кода, ошибки, логирование, миграции, шаблон модуля.

### Именование

**База данных:**
- Таблицы — множественное число, `snake_case`.
- Поля — `snake_case`: `workspace_id`, `created_at`.
- Индексы — `idx_<таблица>_<поля>`.
- Миграции — `<timestamp>_<action>_<subject>.sql`.

**TypeScript / Deno:**
- Переменные и функции — `camelCase`.
- Классы и интерфейсы — `PascalCase`.
- Константы — `UPPER_SNAKE_CASE`.
- Файлы — `kebab-case`. Исключение: `index.ts`.

**i18n ключи:**
- Формат: `<контекст>_<действие>`: `task_created`, `error_file_too_large`.
- Ошибки — с префиксом `error_`. Подтверждения — `confirm_`. Вопросы — `ask_`.

### Стратегия ошибок

**Класс 1 — Ошибка пользователя:** объяснить что исправить.
```typescript
await ctx.reply(ctx.t('error_file_too_large'));
return { ok: false, clearSession: false };
```

**Класс 2 — Временная системная:** retry 2–3 раза, потом «попробуй позже».
```typescript
await ctx.reply(ctx.t('error_service_unavailable'));
return { ok: false, clearSession: false };
```

**Класс 3 — Баг:** извиниться пользователю, детали в лог.
```typescript
console.error('[tasks] unexpected error', { error: err.message, userId: ctx.user.id });
await ctx.reply(ctx.t('error_unexpected'));
return { ok: false, clearSession: true };
```

### Логирование
- `console.log` — информационные события.
- `console.error` — ошибки классов 2 и 3.
- **Никогда** не логировать: содержимое заметок, тексты задач, голосовые расшифровки.
- Всегда логировать: `userId`, `workspaceId`, тип операции, код ошибки.

### Стиль кода
- Форматтер: **deno fmt**. Линтер: **deno lint**.
- Точки с запятой — ставить. Кавычки — одинарные.
- Нет `any` — использовать `unknown` и сужать тип явно.
- Async/await везде, не `.then()`.
- Ранний возврат вместо глубокой вложенности.

### Правила для генерации
1. Использовать только типы из MODULE_CONTRACT.md — не придумывать свои.
2. Все поля БД — строго по DATA_MODEL.md.
3. Каждый запрос к БД — в `queries.ts`, не в `handlers.ts`.
4. Оба языковых файла (`ru.ts`, `en.ts`) — обязательны.
5. `workspace_id` — всегда из `ctx.user.workspaceId`.
6. RLS не дублировать в коде.

---

## Задача

Реализовать точку входа Supabase Edge Function: приём POST-запросов от Telegram, проверка идемпотентности и ответ эхом.

Это шаг 3.1 — без идентификации пользователя, без модульной системы. Только приём вебхука и эхо.

### Что делает функция:

1. **Принимает POST** от Telegram Webhook (JSON-объект Telegram Update).
2. **Идемпотентность**: проверяет `processed_updates`. Если `update.update_id` уже есть — вернуть `200 OK` сразу.
3. **Записывает update_id** в `processed_updates` перед обработкой.
4. **Эхо**: если в Update есть `message.text` — отправить его обратно пользователю.
5. **Всегда возвращает 200** (Telegram повторяет при любом другом коде).

### Детали:

**processed_updates** — RLS включён, политик нет → только `service_role` ключ.

**Telegram Bot API:** отправка через `fetch`: `POST https://api.telegram.org/bot{TOKEN}/sendMessage`, body: `{ chat_id, text }`.

**Секреты через `Deno.env.get()`:**
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Тип входящего Update (минимальный для этого шага):**
```typescript
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; language_code?: string };
    text?: string;
    voice?: { file_id: string; duration: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; language_code?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}
```

**Обработка ошибок:**
- Ошибка парсинга JSON от Telegram → `400 Bad Request`.
- Ошибка записи в `processed_updates` → логировать `update_id` и продолжить (не блокировать).
- Ошибка `sendMessage` → логировать `chat_id` и код ошибки (Класс 2).
- При любой внутренней ошибке — всё равно вернуть `200 OK`.

**Логирование:** логировать `update_id` и `chat_id`, но НЕ текст сообщений.

## Что сгенерировать

```
// supabase/functions/bot/index.ts
// Точка входа: Deno.serve(), парсинг Update, идемпотентность, вызов echo.

// supabase/functions/bot/telegram.ts
// Клиент Telegram Bot API: функция sendMessage(token, chatId, text).

// supabase/functions/bot/idempotency.ts
// Функции: isProcessed(db, updateId) → boolean, markProcessed(db, updateId).
```

## Ограничения

- НЕ реализовывать идентификацию пользователя (шаг 3.2).
- НЕ реализовывать BotContext, module registry, router (шаги 3.3–3.4).
- НЕ реализовывать i18n (шаг 3.2b). Текст эхо — хардкодом, это временно.
- `workspace_id` и user lookup — НЕ нужны в этом шаге.
- Функция должна быть standalone, готова к деплою командой `supabase functions deploy bot`.
- Нет `any` типов. Async/await везде. Ранний возврат.
- Импорт Supabase: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`.

## Формат ответа

Выдать три файла блоками кода с путём в комментарии сверху:

```
// supabase/functions/bot/index.ts
<код>

// supabase/functions/bot/telegram.ts
<код>

// supabase/functions/bot/idempotency.ts
<код>
```
