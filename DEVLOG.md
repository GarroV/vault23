# DEVLOG — Vault23

Хронологический журнал разработки. Каждая запись — один завершённый шаг.
Формат: дата · шаг · что сделано · важные решения.

---

## 2026-05-25

### Этап 0 — Окружение
- Создан репозиторий `vault23` (GitHub, приватный).
- Проект Supabase создан (регион: West EU / Ireland, ref: `orrlwzsvrliipcigmzfi`).
- Supabase CLI настроен, проект слинкован.
- Бот создан в Telegram (`@VaultAssistantBot`), токен в секретах Supabase.
- Ключ OpenAI в секретах Supabase (**временный** — заменить на постоянный).

### Этап 1 — Пакет контекста
- `DATA_MODEL.md` — полная схема 17 таблиц.
- `MODULE_CONTRACT.md` — интерфейсы BotModule, BotContext, BotEvent, ModuleResult.
- `CONVENTIONS.md` — именование, i18n, стратегия ошибок, стиль кода.
- `docs/GEMINI_PROMPT_TEMPLATE.md` — переиспользуемый шаблон промта для Gemini.

### Этап 2 — Схема БД и безопасность

**2.1–2.2 · Миграции схемы**
- Gemini сгенерировал SQL, Claude проверил и исправил: триггеры `set_updated_at`, каскады `ON DELETE SET NULL`, именование `trg_` (не `tgr_`).
- Применено 4 миграции через Supabase Management API.

**2.3 · Seed данных**
- Функция `create_workspace_defaults(workspace_id, language)` — создаёт тему «Прочее»/«Other» и 6 категорий при создании воркспейса.
- Триггер `trg_workspace_seed_defaults` — срабатывает автоматически на INSERT в workspaces.

**2.4 · RLS-политики**
- RLS включён на всех 19 таблицах.
- Паттерн изоляции: `set_app_workspace(uuid)` устанавливает `app.workspace_id` в сессии, `current_workspace_id()` читает его.
- Критический фикс: `NULLIF(current_setting('app.workspace_id', true), '')::uuid` — без NULLIF пустая строка крашила cast в uuid.
- `processed_updates` — RLS включён, политик нет: доступ только через service_role.
- `auth_methods` — политика через subquery на `users.workspace_id`.

**2.5 · Тест изоляции**
- Верифицировано через Management API: `rowsecurity = true` на всех таблицах, 36 политик (2 на таблицу × 18 таблиц).
- NULLIF-фикс проверен: функция не падает при незаданном workspace.

---

## 2026-05-26

### Этап 4 — Модуль Tasks (шаги 4.1–4.4)

**Структура модуля:**
```
supabase/functions/bot/modules/tasks/
  index.ts        — TasksModule (BotModule), регистрирует переводы через registerLocale()
  handlers.ts     — handleTaskCommand, handleTitleInput, handleTopicSelection,
                    handleTaskListCommand, handleStatusChange
  queries.ts      — getVisibleTopics, createTask, getOpenTasks, getTaskById, updateTaskStatus
  locales/ru.ts
  locales/en.ts
```

**Ключевые решения:**
- `registerLocale(ru, en)` — добавлен в `core/i18n.ts`, модули расширяют глобальные переводы без правки ядра. Вызывается как сайд-эффект импорта `modules/tasks/index.ts`.
- Кнопки `/tasks` используют `ctx.t('task_btn_done')` / `ctx.t('task_btn_defer')` — не хардкод.
- `updateTaskStatus` не пишет `updated_at` вручную — полагается на триггер `set_updated_at`.
- Если у воркспейса ровно одна тема (дефолтная) — шаг выбора темы пропускается.
- `task_topic:<id>`, `task_done:<id>`, `task_defer:<id>` — callback_data для Telegram.
- `answerCallbackQuery` не вызывается в модуле — ядро делает это автоматически.

**Деплой:** `supabase functions deploy bot --project-ref orrlwzsvrliipcigmzfi --no-verify-jwt` — успешно.

### Этапы 4.5–4.6 — Фильтры и экран «сегодня»

**Новые команды:**
- `/filter` — выводит кнопки с темами воркспейса; по клику `filter_topic:<id>` показывает открытые задачи в теме (до 10).
- `/today` — выборка: `due_at <= конец_сегодня_UTC AND status IN ('open','in_progress') AND deleted_at IS NULL`, сортировка ASC. Просроченные (due < now) помечаются ⚠️, сегодняшние — 📅. Дата форматируется через `toLocaleDateString` с `timeZone: 'UTC'`.

**Решения:**
- Фильтр по теме не требует сессии — всё в callback_data (`filter_topic:<id>`).
- Даты отображаются в UTC без конвертации по часовым поясам (поддержка TZ заморожена до отдельной фичи).
- `getTasksDueOrOverdue` считает `endOfToday = setUTCHours(23,59,59,999)` внутри запроса.

---

### Этап 3 — Ядро

**3.1 · Telegram Webhook + Echo**
- Суть: приём POST от Telegram, идемпотентность через `processed_updates`, эхо-ответ.
- Файлы: `supabase/functions/bot/index.ts`, `telegram.ts`, `idempotency.ts`.
- Деплой: `supabase functions deploy bot --no-verify-jwt` (флаг обязателен — Telegram не отправляет JWT).
- Проблема при первом деплое: 401 Unauthorized без `--no-verify-jwt`.
- Вебхук зарегистрирован: `setWebhook?url=https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/bot`.
- Проверено: бот отвечает эхом на сообщения.
- Следующий шаг (3.2): добавить верификацию через secret token в URL вебхука (отложено до стабилизации ядра).

**3.3–3.5 · Модульное ядро**
- `core/types.ts` — полная система типов: BotEvent, BotContext, BotModule, SessionState, ModuleResult, GateResult, InlineButton.
- `core/router.ts` — `normalizeEvent()`: TelegramUpdate → BotEvent (command/text/voice/file/callback_query).
- `core/registry.ts` — `ModuleRegistry`: регистрация модулей, routing по команде и `canHandle`.
- `core/gate.ts` — заглушка (всегда allowed), Этап 9 заменит реализацию.
- `core/session.ts` — `loadSession`, `saveSession`, `clearSession` через bot_sessions.
- `core/context.ts` — `loadWorkspace`, `buildContext`: собирает полный BotContext из identity + DB данных.
- `index.ts` обновлён: полный pipeline — identify → normalize → system cmds → module router → fallback.
- Автоответ на callback_query (очищает спиннер Telegram) в index.ts после module.handle().
- 3.4 и 3.5 реализованы как часть 3.3.

**3.2 · Идентификация пользователя**
- `core/types.ts` — общие типы: `TelegramUpdate`, `TelegramUser`, `UserIdentity`, `Language`.
- `core/identify.ts` — `identifyUser(db, from)`: ищет пользователя по Telegram ID в `auth_methods`.
- Авторегистрация: новый пользователь → workspace → user → auth_method → people → bot_session.
- Язык: `language_code === 'ru'` → русский, иначе → английский.
- Все операции через service_role (RLS bypass для auth lookup без workspace контекста).
- `index.ts` обновлён: идентификация до передачи в обработчик, userId в логах.
