# DEVLOG — Vault23

Хронологический журнал разработки. Каждая запись — один завершённый шаг.
Формат: дата · шаг · что сделано · важные решения.

---

## 2026-05-26 (сессия 2)

### Этап 8 — Календарь и сложные фичи

**8.5 · Подзадачи**
- `tasks/queries.ts`: `createTask` принимает опциональный `parentTaskId`.
- `tasks/handlers.ts`: `handleSubtaskInit` (callback `task_subtask:<id>`); `handleTitleInput` и `handleTopicSelection` читают `parentTaskId` из `session.data`.
- В списке задач кнопка ➕ Подзадача под каждой задачей.

**8.3 · Голосовое управление задачами**
- `notes/handlers.ts`: после транскрипции Whisper вызывается `detectTaskIntent(text)` через GPT-4o-mini (JSON output: `{is_task, title?}`).
- Если намерение обнаружено — показываются кнопки «✅ Создать задачу» / «📝 Сохранить как заметку».
- Задача создаётся ТОЛЬКО после явного подтверждения. Реализует требование 8.3 (mandatory confirmation).
- `encodeTitle(title)`: `encodeURIComponent(title).slice(0, 40)` — влезает в 64-char Telegram лимит.

**8.1 · Google OAuth**
- Edge Function `google-auth` принимает callback с кодом и state=userId.
- Обменивает код на токены, сохраняет в `user_integrations` (upsert by user_id+provider).
- После OAuth уведомляет пользователя в Telegram.
- Миграция `20260526000002_user_integrations.sql`: таблица user_integrations с RLS.
- Требует: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET в Supabase Secrets.

**8.2 · Односторонний синк задач → Google Calendar**
- Модуль `google` (команды `/connect`, `/sync`).
- `/connect`: проверяет наличие интеграции; если нет — показывает кнопку-ссылку на OAuth URL (InlineButton.url).
- `/sync`: находит задачи с `due_at` без `google_calendar_event_id`, создаёт события в primary calendar через API, сохраняет event ID.
- Автообновление токена за 5 минут до истечения через refresh_token.
- `InlineButton` тип расширен опциональным `url` (для URL-кнопок наряду с callback-кнопками).
- Миграция `20260526000003_tasks_calendar_event.sql`: колонка `google_calendar_event_id` в tasks.

**8.4 · Двусторонний календарь**
- Edge Function `calendar-webhook` обрабатывает Google push notifications.
  - `X-Goog-Resource-State: sync` → 200 OK (handshake).
  - `X-Goog-Resource-State: exists` → инкрементальная выборка через syncToken → обновление задач.
  - Конфликт: изменение в Google Calendar обновляет задачу (title/due_at); отмена события — логируется, задача не удаляется (только открытые задачи обновляются).
- `/sync` после синка регистрирует push-канал (fire-and-forget); сохраняет `google_channel_id`, `google_channel_expiry`, `google_sync_token`.
- Миграция `20260526000004_user_integrations_channel.sql`.
- `handleStatusChange` в tasks: при завершении задачи удаляет событие из Google Calendar (fire-and-forget).

**8.6 · Отправка email из бота**
- Модуль `email` (команда `/email`).
- Flow: /email → email получателя → тема → тело → отправка через Resend API.
- Валидация email regex перед сохранением в session.
- Требует: RESEND_API_KEY + EMAIL_FROM_ADDRESS в Supabase Secrets.
- Деплой: включён в bot function.

**Технические решения:**
- Миграция 000001 (remind_cron) обёрнута в `DO $$ IF pg_cron EXISTS` — graceful fallback без расширения.
- `getInitialSyncToken` при первом `/sync` получает baseline sync token для последующих инкрементальных выборок.
- Все Google API-вызовы из bot-модуля — inline (нет межфункционального HTTP); calendar-webhook — отдельный функц.

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

## 2026-05-26 (продолжение 5)

### Этапы 7.1, 7.3–7.7, 7.9 — Contractors + KB + Ask + Stats

**Модуль `contractors/` (7.1):**
- `/contractor` → имя → createContractor → подтверждение.
- `/contractors` → список до 20 (ilike для FTS через `/find <query>`).
- `/find` → ilike поиск по полю `name` с `%query%`.

**Модуль `kb/` (7.3–7.7):**
- `/addkb` → заголовок → контент → createKbEntry (status='pending') → показывает превью с кнопками [✅ Одобрить] [❌ Отклонить].
- **Review gate (7.6):** `kb_approve:<id>` → getKbEntryById → generateEmbedding → approveKbEntry (status='approved', embedding=vector). `kb_reject:<id>` → DELETE.
- Embedding при одобрении (не при создании) — `text-embedding-3-small`, 1536 dim.
- `/ask` → вопрос → FTS (ilike) + vector similarity в TypeScript (cosine, порог 0.7) → GPT-4o-mini с контекстом → ответ. Если нет контекста → 'ask_no_context'.
- Все AI-вызовы трекаются в `token_usage` (fire-and-forget).

**`kb/ai.ts` — вспомогательные функции:**
- `generateEmbedding(text)` → OpenAI embeddings API.
- `chatCompletion(system, user)` → GPT-4o-mini, max_tokens=800, temp=0.3.
- `cosineSimilarity(a, b)` → dot product / (|a| * |b|).

**`/stats` (7.9, в index.ts):**
- Три параллельных COUNT запроса (tasks/notes/reminders) → форматированный ответ.

**Отложено:** 7.2 (services — web UI приоритет), 7.8 (PDF — требует внешней библиотеки).

---

## 2026-05-26 (продолжение 4)

### Этапы 6.1–6.4 — Reminders, scheduler, token tracking, retry

**6.1 — Модуль `reminders/` (/remind):**
- Поток: `/remind` → текст → кнопки времени (1ч / 3ч / 24ч / 3д) → создаёт запись в `reminders`.
- Callback: `remind_time:1h|3h|24h|3d` → вычисляет `remind_at = now() + duration`.
- Время в подтверждении форматируется через `toLocaleString` с `timeZone: 'UTC'`.

**6.2 — Edge Function `remind` (планировщик):**
- Запрашивает `reminders WHERE status='pending' AND remind_at <= now()`, до 50 строк.
- JOIN с `auth_methods` (provider='telegram') → получает `provider_id` = Telegram chat_id.
- Отправляет сообщение, обновляет status='sent'. Ошибки по каждой записи не ломают цикл.
- Расписание: нужно настроить в **Supabase Dashboard > Edge Functions > remind > Schedule** (cron: `* * * * *`). Миграция `20260526000001_remind_cron.sql` — справочная, требует pg_cron + pg_net + настройки `app.service_role_key`.

**6.3 — Token tracking (`core/usage.ts`):**
- `trackUsage(db, workspaceId, operationType, model, totalTokens)` → INSERT в `token_usage`.
- Вызывается после каждого Whisper-запроса (total_tokens=1 = 1 запрос).
- Fire-and-forget (`.catch(() => {})`) — не блокирует ответ пользователю.

**6.4 — Retry для Telegram (`telegram.ts`):**
- `postWithRetry(attempts=3, backoff=600ms×attempt)` оборачивает POST.
- Только `sendMessage` использует retry; `answerCallbackQuery` — без retry (некритично).
- 4xx-ошибки (баги в запросе) не повторяются — сразу throws.

---

## 2026-05-26 (продолжение 3)

### Этапы 5.3–5.6 — Attachments + Voice

**Расширения ядра:**
- `core/types.ts`: добавлены `photo[]` в TelegramUpdate, `fileName/fileSize` в BotEvent, `mime_type/file_size` в voice.
- `core/router.ts`: обработка `message.photo` → берёт последний (наибольший) элемент → `type: 'file'`.
- `telegram.ts`: добавлены `getFilePath(token, fileId)` и `downloadTelegramFile(token, filePath)`.

**Модуль `attachments/` (5.3–5.4):**
- Срабатывает на `event.type === 'file'` через `canHandle` (без команды).
- Проверяет `fileSize > 20 МБ` до загрузки.
- Сохраняет `fileId/fileName/mimeType` в сессию `attach_awaiting_task`, скачивает файл ТОЛЬКО после выбора задачи (не хранит временные файлы).
- `uploadAndRecord`: создаёт bucket "attachments" (идемпотентно), загружает по пути `workspaceId/tasks/taskId/uuid-fileName`, записывает в таблицу `attachments` (entity_type='task').
- Полиморфность через `entity_type + entity_id` (схема Data Model).

**Voice → Whisper → note (5.5–5.6, в модуле notes):**
- `handleVoiceNote`: скачивает аудио → OpenAI Whisper API (whisper-1) → текст → createNote (source='voice') → показывает транскрипцию → предлагает прикрепить к задаче.
- Пустая транскрипция → `voice_empty` + clear session.
- Используется тот же `note_awaiting_task` поток что и для текстовых заметок.

---

## 2026-05-26 (продолжение 2)

### Этап 5.2 — Meeting mode

**Новые команды:**
- `/meet` → генерирует `session_id = crypto.randomUUID()`, сессия `meet_active { sessionId, noteCount: 0 }`.
- Каждое текстовое сообщение в `meet_active` → `createNoteInMeeting(content, sessionId)` → ответ `✅ {N}`.
- `/endmeet` → если нет задач — "Встреча завершена. Заметок: N." + clear. Если задачи есть → кнопки выбора + `meet_task:<task_id>` / `meet_skip`.
- `handleMeetTaskAttach` → bulk UPDATE notes SET task_id WHERE session_id = ? (одна операция на все заметки).

**Защиты:**
- `/endmeet` без активной встречи → «Сейчас нет активной встречи.»
- `meet_skip` возвращает счётчик заметок из session.data.noteCount.

---

## 2026-05-26 (продолжение)

### Этап 5.1 — Модуль Notes

**Структура:**
```
supabase/functions/bot/modules/notes/
  index.ts    — NotesModule
  handlers.ts — handleNoteCommand, handleNoteContentInput, handleTaskAttach,
                handleNoteSkip, handleNotesListCommand
  queries.ts  — createNote, attachNoteToTask, getRecentNotes, getOpenTasksForPicker
  locales/ru.ts, en.ts
```

**UX-поток `/note`:**
1. `/note` → «Введи текст заметки:» → сессия `note_awaiting_content`
2. Пользователь вводит текст → createNote → если есть открытые задачи → предлагает прикрепить (кнопки задач + «Без задачи»)
3. `note_task:<task_id>` → attachNoteToTask → «Прикреплено ✅»; `note_skip` → «Заметка сохранена ✅»

**Ограничение Telegram:** callback_data ≤ 64 байт. `note_task:<uuid>` = 46 chars ✓. noteId хранится в сессии, не в callback.

**`/notes`** — последние 10 заметок, превью 200 символов, дата в формате «DD Mon».

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
