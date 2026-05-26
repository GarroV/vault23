# Vault23 — Мастер-документ проекта

> **Назначение:** единый источник правды. Читать в начале каждой новой сессии Claude.
> **Статус:** продукт в продакшне, активная разработка.
> **Последнее обновление:** 2026-05-26

---

## Что это

Мультитенантный SaaS-бот в Telegram для ведения задач, заметок и напоминаний.  
Разрабатывается Василием Гарро (`@FeelFire`, Telegram ID: 744230399) — он же платформ-администратор.

**Бот:** `@vault23_assist_bot`  
**Supabase проект:** `orrlwzsvrliipcigmzfi`  
**Репо:** `/Users/garva/Ai_Assistant_Vault23`

---

## Стек

- **Backend:** Supabase (Postgres 15 + pgvector + Edge Functions + Storage)
- **Runtime:** TypeScript / Deno
- **Bot API:** Telegram Bot API (webhook)
- **AI:** OpenAI — Whisper (STT), `text-embedding-3-small` (KB embeddings), `gpt-4o-mini` (NLP, KB-ответы)
- **Billing:** Stripe
- **Integrations:** Google Calendar (OAuth2)
- **Frontend:** статичный HTML в `landing/`

---

## Текущий статус (что сделано)

### Ядро бота ✅
- Webhook → normalizeEvent → identify → session → buildContext → modules
- Мультитенантность: workspace per user, RLS на всех таблицах
- i18n: ru/en, locale overrides из БД без деплоя
- Идемпотентность по `update_id`
- Gate-система (план + статус)

### NLP (разговорный режим) ✅
- Любой текст без команды → GPT парсит интент
- Интенты: create_task, create_note, set_reminder, list_tasks, list_notes, search, kb_ask
- Парсинг дат в свободной форме («пятница», «через 2 часа»)
- Регулярные задачи из текста: «оплатить интернет каждый месяц 5го»

### Модули ✅
- **Tasks:** /task, /tasks, /filter, /today, подзадачи, soft-delete
- **Notes:** /note, /notes, /meet (режим встречи), голосовые → Whisper
- **Reminders:** /remind, /reminders, крон каждую минуту
- **Contractors:** /contractor, /contractors, /find, /addservice, /services
- **KB:** /addkb (с review-gate), /ask (FTS + vector + GPT-ответ)
- **Email:** /email
- **Google Calendar:** /connect, /sync
- **Billing:** /subscription, Stripe checkout + webhook

### Задачи с дедлайном → автонапоминание ✅
При создании задачи с дедлайном автоматически создаётся связанное напоминание (`reminders.task_id`).

### Регулярные задачи ✅
Поле `recurrence` (jsonb) на задаче. При закрытии — reschedule вместо завершения.  
Форматы: `{type: monthly, day: 5}`, `{type: weekly, weekday: 5}`, `{type: daily}`, `{type: interval, days: N}`.

### /help — интерактивная справка ✅
Inline-кнопки по разделам: Задачи, Заметки, Голосовые, Напоминания, Подрядчики, KB, Интеграции, Аккаунт.

### Admin ✅
`/adminmenu` (только для ADMIN_TELEGRAM_ID): статистика платформы, конфиг, тексты.

### Cron ✅
- `remind-every-minute` — напоминания
- `billing-housekeeping-daily` — housekeeping триала

### Личный кабинет ✅
`landing/cabinet/index.html` — вкладки: задачи, заметки, подрядчики, KB, подписка, Locales (редактирование текстов).

### Другие страницы ✅
- `landing/help/index.html` — справка
- `landing/pricelist/index.html` — прайс-лист в PDF

---

## Что НЕ сделано / TODO

| Приоритет | Задача |
|---|---|
| 🔴 Критично | Задать `STRIPE_WEBHOOK_SECRET` в продакшне |
| 🔴 Критично | Включить `CONSENT_GATE_ENABLED=true` когда появятся ToS |
| 🟡 Важно | Supabase Pro план (для pg_cron в продакшне) |
| 🟡 Важно | Поддержка часовых поясов пользователей |
| 🟡 Важно | Rate limiting для NLP-вызовов при высокой нагрузке |
| 🟢 Улучшение | Добавить FTS конфигурацию `english` параллельно `russian` |
| 🟢 Улучшение | История выполнения регулярных задач |
| 🟢 Улучшение | Переключить KB-ответы с gpt-4o-mini на Claude Sonnet (ключ есть) |

---

## Ключевые файлы для погружения

| Файл | Содержание |
|---|---|
| `docs/BOT_REFERENCE.md` | **Полная операционная документация** — читать целиком |
| `supabase/functions/bot/index.ts` | Точка входа: роутинг, NLP, системные команды |
| `supabase/functions/bot/core/types.ts` | Все ключевые типы: BotContext, BotEvent, BotModule |
| `supabase/functions/bot/core/nlp.ts` | NLP-парсер и парсинг дат |
| `supabase/functions/bot/core/plans.ts` | Лимиты по тарифам |
| `supabase/functions/bot/core/gate.ts` | Проверки доступа |
| `supabase/functions/bot/modules/tasks/` | Эталонный модуль для изучения паттерна |
| `supabase/migrations/` | Вся история схемы БД |
| `CLAUDE.md` | Архитектурные правила (нерушимые) |

---

## Как продолжить работу в новой сессии

1. Прочитай этот файл (`MASTER_PROJECT.md`)
2. Прочитай `docs/BOT_REFERENCE.md` — там вся техническая документация
3. Прочитай `CLAUDE.md` — архитектурные правила которые нельзя нарушать
4. Для деплоя: `supabase functions deploy bot --no-verify-jwt`
5. Для миграций: `supabase db push`
6. Для логов: `supabase functions logs bot --tail`

**Администратор платформы:**  
Василий Гарро, Telegram: `@FeelFire`, ID: `744230399`, email: `vasiliy.garro@gmail.com`

---

## Архитектурные принципы (кратко)

1. **Мультитенантность** — `workspace_id` везде + RLS. Никогда не фильтровать только в коде.
2. **Логика не в боте** — бот принимает ввод и вызывает слой логики. Не содержит бизнес-правил.
3. **Модульность** — ядро не знает о модулях. Модули регистрируются через `ModuleRegistry`.
4. **Review-gate** — KB-записи не попадают в индекс без ручного одобрения.
5. **i18n с первой строки** — все тексты через ключи, никакого хардкода.
6. **UTC везде** — хранение только в UTC, отображение фиксированное.
7. **Идемпотентность** — `processed_updates` защищает от дублей.

Полные правила → `CLAUDE.md`
