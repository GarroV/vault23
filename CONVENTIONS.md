# CONVENTIONS.md — соглашения разработки

> Именование, стиль кода, ошибки, логирование, миграции, шаблон модуля. Шаг 1.3 (🔴 Claude).
> Вкладывается в каждый промт для Gemini — чтобы сгенерированный код был единообразным.
> Статус: **ГОТОВО**.

---

## Именование

### База данных
- Таблицы — множественное число, `snake_case`: `tasks`, `task_participants`, `kb_entries`.
- Поля — `snake_case`: `workspace_id`, `created_at`, `is_default`.
- Индексы — `idx_<таблица>_<поля>`: `idx_tasks_workspace_status`.
- Миграции — `<timestamp>_<action>_<subject>.sql`: `20260525120000_create_tasks.sql`.

### TypeScript / Deno
- Переменные и функции — `camelCase`: `workspaceId`, `handleTaskCreate`.
- Классы и интерфейсы — `PascalCase`: `BotContext`, `TasksModule`.
- Константы — `UPPER_SNAKE_CASE`: `MAX_FILE_SIZE_BYTES`.
- Файлы — `kebab-case`: `task-queries.ts`, `i18n-loader.ts`.
- Исключение: `index.ts` — точка входа модуля/функции.

### i18n ключи
- Формат: `<контекст>_<действие_или_состояние>`: `task_created`, `error_file_too_large`.
- Ошибки всегда с префиксом `error_`: `error_empty_input`, `error_service_unavailable`.
- Подтверждения — `confirm_`: `confirm_delete_task`.
- Вопросы/запросы ввода — `ask_`: `ask_task_title`, `ask_task_due_date`.

---

## i18n

- Все тексты бота — через `ctx.t('ключ')`, никогда строкой напрямую.
- Языковые файлы: `/functions/core/locales/ru.ts` и `en.ts` + `/functions/modules/<name>/locales/ru.ts` и `en.ts`.
- **Оба файла заполняются одновременно** при разработке блока. Не «английский потом».
- Автоопределение: `language_code === 'ru'` → русский, всё остальное → английский (дефолт).
- Ручная смена языка через команду → сохранить в `users.language`.
- Данные пользователя (заголовки задач, тексты заметок, названия тем) **не переводятся**.
- Фолбэк: если ключ не найден в языке пользователя → вернуть английский вариант.

```typescript
// Формат языкового файла
// functions/modules/tasks/locales/ru.ts
export const ru = {
  task_created: 'Задача создана ✓',
  task_not_found: 'Задача не найдена',
  ask_task_title: 'Введи название задачи:',
  confirm_delete_task: 'Удалить задачу «{title}»?',
  error_empty_title: 'Название не может быть пустым',
} as const;

// Параметры через {ключ}
// ctx.t('confirm_delete_task', { title: task.title })
```

---

## Стратегия ошибок

Три класса ошибок. Бот **никогда не молчит** и **не показывает технику** пользователю.

### Класс 1 — Ошибка пользователя
Пользователь сделал что-то неверное и может исправить сам.

```typescript
// Поведение: объяснить спокойно, что не так и что сделать
await ctx.reply(ctx.t('error_file_too_large'));
return { ok: false, clearSession: false }; // сессию не сбрасываем — ждём повтора
```

### Класс 2 — Временная системная ошибка
Внешний сервис недоступен (OpenAI, Telegram API). Retry 2–3 раза, потом сообщить.

```typescript
// Поведение: retry, потом «попробуй позже»
// Сырой ввод уже сохранён — не потеряем
await ctx.reply(ctx.t('error_service_unavailable'));
return { ok: false, clearSession: false };
```

### Класс 3 — Баг
Неожиданная ошибка в коде.

```typescript
// Поведение: извиниться пользователю, детали — в лог
console.error('[tasks] unexpected error', { 
  error: err.message, 
  userId: ctx.user.id,
  // НЕ логировать содержимое заметок/задач пользователя
});
await ctx.reply(ctx.t('error_unexpected'));
return { ok: false, clearSession: true };
```

### Не терять ввод
Сырой пользовательский ввод сохраняется **до** обработки. Если обработка упала — есть что вернуть.

```typescript
// В ядре, до передачи в модуль:
await saveRawInput(ctx.user.id, event.text);
// Потом — передать в модуль
```

### Логирование
- `console.log` — информационные события (задача создана, пользователь вошёл).
- `console.error` — ошибки классов 2 и 3.
- **Никогда** не логировать: содержимое заметок, тексты задач, голосовые расшифровки, личные данные.
- Всегда логировать: `userId`, `workspaceId`, тип операции, код ошибки.

```typescript
// Хорошо
console.error('[kb] embedding failed', { userId: ctx.user.id, entryId, error: err.message });

// Плохо — содержимое попадает в лог
console.error('[notes] save failed', { content: note.content });
```

---

## Миграции

- Изменения схемы — **только через Supabase CLI**, не руками в Supabase Dashboard.
- Команда: `supabase migration new <name>` → редактировать файл → `supabase db push`.
- Имя миграции — глагол + объект: `create_tasks`, `add_contractor_id_to_people`, `drop_old_sessions`.
- Каждая миграция содержит **откат** (комментарий `-- rollback:` с обратным SQL).
- Дефолты для существующих строк — обязательно при добавлении `NOT NULL` колонки.
- На живых данных — сначала `supabase db reset` на локальной копии, потом `db push` в прод.
- Не удалять колонки/таблицы с данными без явного бэкапа.

```sql
-- 20260525120000_add_contractor_id_to_people.sql
ALTER TABLE people ADD COLUMN contractor_id uuid REFERENCES contractors(id);

-- rollback:
-- ALTER TABLE people DROP COLUMN contractor_id;
```

---

## Структура модуля — шаблон

Каждый новый модуль создаётся по этому шаблону.

```typescript
// functions/modules/<name>/index.ts
import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { handleCreate, handleList } from './handlers.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';

export class ExampleModule implements BotModule {
  name = 'example';
  commands = ['/example'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    return session.state.startsWith('example_');
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    // Команда входа
    if (event.command === '/example') {
      return handleCreate(ctx);
    }

    // Многошаговый диалог
    if (session.state === 'example_awaiting_title') {
      return handleCreate(ctx);
    }

    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
```

```typescript
// functions/modules/<name>/handlers.ts
import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createExample } from './queries.ts';

export async function handleCreate(ctx: BotContext): Promise<ModuleResult> {
  const { event, session } = ctx;

  // Шаг 1: запросить ввод
  if (session.state === 'idle' || event.command === '/example') {
    await ctx.reply(ctx.t('ask_example_title'));
    return { ok: true, session: { state: 'example_awaiting_title', data: {} } };
  }

  // Шаг 2: получили ввод, создаём
  if (session.state === 'example_awaiting_title') {
    if (!event.text?.trim()) {
      await ctx.reply(ctx.t('error_empty_input'));
      return { ok: false }; // остаёмся в том же состоянии
    }

    const item = await createExample(ctx.db, {
      workspaceId: ctx.user.workspaceId,
      title: event.text.trim(),
    });

    await ctx.reply(ctx.t('example_created'));
    return { ok: true, clearSession: true };
  }

  return { ok: false, clearSession: true };
}
```

```typescript
// functions/modules/<name>/queries.ts
import type { SupabaseClient } from '../../core/types.ts';

export async function createExample(
  db: SupabaseClient,
  data: { workspaceId: string; title: string }
) {
  const { data: item, error } = await db
    .from('examples')
    .insert({ workspace_id: data.workspaceId, title: data.title })
    .select()
    .single();

  if (error) throw error;
  return item;
}
```

---

## Стиль кода

- Форматтер: **deno fmt** (встроенный, без конфига). Запускать перед коммитом.
- Линтер: **deno lint**. Предупреждения — фиксить, не игнорировать.
- Точки с запятой — ставить.
- Кавычки — одинарные.
- Импорты — в начале файла, сначала внешние, потом внутренние.
- Нет `any` — использовать `unknown` и сужать тип явно.
- Async/await везде, не `.then()`.
- Ранний возврат вместо глубокой вложенности.

```typescript
// Хорошо — ранний возврат
async function handle(ctx: BotContext): Promise<ModuleResult> {
  if (!ctx.event.text) {
    await ctx.reply(ctx.t('error_empty_input'));
    return { ok: false };
  }
  // основная логика
}

// Плохо — вложенность
async function handle(ctx: BotContext): Promise<ModuleResult> {
  if (ctx.event.text) {
    // основная логика
  } else {
    await ctx.reply(ctx.t('error_empty_input'));
    return { ok: false };
  }
}
```

---

## Правила для Gemini-блоков

При генерации Gemini получает этот файл целиком. Дополнительные правила для промтов:

1. Использовать только типы из `MODULE_CONTRACT.md` — не придумывать свои.
2. Все поля БД — строго по `DATA_MODEL.md`. Не добавлять поля которых нет в схеме.
3. Каждый запрос к БД — в `queries.ts`, не в `handlers.ts`.
4. Оба языковых файла (`ru.ts`, `en.ts`) — обязательно в составе блока.
5. `workspace_id` — всегда из `ctx.user.workspaceId`, не хардкодить.
6. RLS не дублировать в коде — доверять политикам БД.
