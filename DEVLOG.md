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

### Этап 3 — Ядро

**3.1 · Telegram Webhook + Echo**
- Суть: приём POST от Telegram, идемпотентность через `processed_updates`, эхо-ответ.
- Файлы: `supabase/functions/bot/index.ts`, `telegram.ts`, `idempotency.ts`.
- Деплой: `supabase functions deploy bot --no-verify-jwt` (флаг обязателен — Telegram не отправляет JWT).
- Проблема при первом деплое: 401 Unauthorized без `--no-verify-jwt`.
- Вебхук зарегистрирован: `setWebhook?url=https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/bot`.
- Проверено: бот отвечает эхом на сообщения.
- Следующий шаг (3.2): добавить верификацию через secret token в URL вебхука.

**3.2 · Идентификация пользователя**
- `core/types.ts` — общие типы: `TelegramUpdate`, `TelegramUser`, `UserIdentity`, `Language`.
- `core/identify.ts` — `identifyUser(db, from)`: ищет пользователя по Telegram ID в `auth_methods`.
- Авторегистрация: новый пользователь → workspace → user → auth_method → people → bot_session.
- Язык: `language_code === 'ru'` → русский, иначе → английский.
- Все операции через service_role (RLS bypass для auth lookup без workspace контекста).
- `index.ts` обновлён: идентификация до передачи в обработчик, userId в логах.
