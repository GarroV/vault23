# MODULE_CONTRACT.md — контракт модуля

> Как модуль регистрируется в ядре и общается с ним. Шаг 1.2 (🔴 Claude).
> Статус: **ГОТОВО** — интерфейсы определены, готово к реализации ядра и генерации модулей.

---

## Принцип

Ядро не знает о конкретных модулях. Каждый модуль реализует интерфейс `BotModule` и регистрируется в реестре при старте функции. Ядро маршрутизирует входящее событие нужному модулю и передаёт ему контекст `BotContext`.

Бот принимает ввод → ядро разбирает → передаёт модулю → модуль вызывает логику → возвращает результат.
Бизнес-логика живёт в модуле и слое данных, **не** в маршрутизаторе.

---

## Интерфейс модуля

```typescript
interface BotModule {
  // Уникальное имя модуля (для логов и реестра)
  name: string;

  // Команды, которые обслуживает модуль ('/task', '/note', '/kb'...)
  commands: string[];

  // Может ли модуль обработать событие в текущем состоянии сессии.
  // Вызывается ядром, если команда не совпала (контекстные переходы).
  canHandle(event: BotEvent, session: SessionState): boolean;

  // Обработать событие. Получает полный контекст.
  handle(ctx: BotContext): Promise<ModuleResult>;
}
```

---

## Контекст (BotContext)

Передаётся в `handle`. Содержит всё необходимое для обработки события.

```typescript
interface BotContext {
  // --- Кто пишет ---
  user: {
    id: string;           // Внутренний UUID (users.id)
    workspaceId: string;  // UUID воркспейса
    language: 'ru' | 'en';
    telegramId: string;
  };

  // --- Воркспейс ---
  workspace: {
    id: string;
    status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
    plan: string;
  };

  // --- Состояние диалога ---
  session: SessionState;

  // --- Входящее событие ---
  event: BotEvent;

  // --- i18n: перевод по ключу ---
  // Язык берётся из user.language автоматически.
  t: (key: string, params?: Record<string, string | number>) => string;

  // --- Ответ пользователю ---
  reply: (text: string, options?: ReplyOptions) => Promise<void>;
  replyWithButtons: (text: string, buttons: InlineButton[][]) => Promise<void>;

  // --- Проверка доступа ---
  // На пилоте всегда возвращает { allowed: true }.
  // Этап 9: будет проверять тариф, статус воркспейса, роль.
  gate: (feature: string) => GateResult;

  // --- Клиент БД (привязан к workspace_id через RLS) ---
  db: SupabaseClient;
}
```

---

## Входящее событие (BotEvent)

```typescript
interface BotEvent {
  updateId: number;       // Telegram update_id (для идемпотентности)

  type: 'command' | 'text' | 'voice' | 'file' | 'callback_query';

  // Текст: введён с клавиатуры ИЛИ расшифрован из голоса.
  // Модуль не должен знать источник — ядро нормализует заранее.
  text?: string;

  source: 'keyboard' | 'voice' | 'button';

  command?: string;        // '/task', '/note' — если type = 'command'
  callbackData?: string;   // Payload кнопки — если type = 'callback_query'
  fileId?: string;         // Telegram file_id — если type = 'file'
  mimeType?: string;

  rawUpdate: unknown;      // Оригинальный Telegram Update (для edge cases)
}
```

---

## Состояние сессии (SessionState)

```typescript
interface SessionState {
  id: string;
  state: string;                    // Текущий шаг ('idle', 'creating_task', ...)
  data: Record<string, unknown>;    // Данные, накопленные по шагам диалога
}
```

---

## Результат обработки (ModuleResult)

```typescript
interface ModuleResult {
  ok: boolean;

  // Обновить сессию (опционально)
  session?: {
    state: string;
    data: Record<string, unknown>;
  };

  // Сбросить сессию в 'idle' после обработки
  clearSession?: boolean;
}
```

---

## Точка проверки доступа (gate)

```typescript
interface GateResult {
  allowed: boolean;
  reason?: 'workspace_suspended' | 'workspace_cancelled' | 'plan_limit' | 'feature_not_in_plan';
}
```

**На пилоте:** `gate` всегда возвращает `{ allowed: true }`. Место в контракте зарезервировано — Этап 9 добавит логику без переписывания модулей.

```typescript
// Использование в модуле:
const access = ctx.gate('kb_search');
if (!access.allowed) {
  await ctx.reply(ctx.t('error_feature_unavailable'));
  return { ok: false, clearSession: true };
}
```

---

## Ответные опции

```typescript
interface ReplyOptions {
  parseMode?: 'Markdown' | 'HTML';
  disablePreview?: boolean;
}

interface InlineButton {
  text: string;
  callbackData: string;
}
```

---

## Реестр модулей

Модули регистрируются при старте Edge Function.

```typescript
// functions/core/index.ts
import { TasksModule } from '../modules/tasks/index.ts';
import { NotesModule } from '../modules/notes/index.ts';

const registry = new ModuleRegistry();
registry.register(new TasksModule());
registry.register(new NotesModule());
```

**Алгоритм маршрутизации (в ядре):**
1. Нормализовать Telegram Update → `BotEvent`.
2. Если `event.type === 'command'` → найти модуль по `module.commands.includes(event.command)`.
3. Иначе → перебрать модули, вызвать первый у которого `canHandle(event, session) === true`.
4. Если модуль не найден и `session.state !== 'idle'` → передать в модуль последнего активного состояния.
5. Ничего не нашли → стандартный ответ «не понял».

---

## Структура файлов

```
/functions
  /core
    index.ts        — точка входа, вебхук, сборка ctx
    registry.ts     — реестр и маршрутизация
    router.ts       — алгоритм выбора модуля
    i18n.ts         — загрузчик переводов, функция t()
    gate.ts         — заглушка gate (Этап 9 заменит реализацию)
    session.ts      — чтение/запись bot_sessions
    /locales
      ru.ts
      en.ts
  /modules
    /tasks
      index.ts      — реализует BotModule
      handlers.ts   — логика команд
      queries.ts    — запросы к БД
      /locales
        ru.ts
        en.ts
    /notes
      ...
    /kb
      ...
```

---

## Сквозные требования к каждому модулю

1. **Логика не в боте.** Запросы к БД — в `queries.ts`. Обработчик только оркестрирует.
2. **workspace_id из контекста.** Данные — только через `ctx.db` (RLS) или `ctx.user.workspaceId`. Никогда не хардкодить.
3. **i18n обязательно.** Все тексты через `ctx.t('ключ')`. Оба файла (`ru.ts`, `en.ts`) заполняются сразу при разработке блока.
4. **gate перед платными фичами.** Проверить `ctx.gate('feature')` до выполнения действия.
5. **Ошибки по стратегии.** Три класса — см. `CONVENTIONS.md`. Модуль не кидает необработанные исключения.
6. **Источник ввода прозрачен.** Работаем с `ctx.event.text` — не важно, клавиатура или голос.
7. **Возвращать ModuleResult всегда.** Даже при ошибке — `{ ok: false, clearSession: true }`.
