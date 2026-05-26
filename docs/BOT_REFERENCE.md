# Vault23 Bot — Операционная документация

> Актуальна на: 2026-05-26  
> Бот: `@vault23_assist_bot`  
> Проект Supabase: `orrlwzsvrliipcigmzfi`
>
> **Для нового разработчика:** начни с разделов 1, 8, 15, 16 — они дают полную картину архитектуры и позволят ориентироваться в коде.

---

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Пользовательский интерфейс](#2-пользовательский-интерфейс)
3. [Модули и команды](#3-модули-и-команды)
4. [NLP — разговорный режим](#4-nlp--разговорный-режим)
5. [Тарифные планы и ограничения](#5-тарифные-планы-и-ограничения)
6. [AI-интеграции](#6-ai-интеграции)
7. [Внешние интеграции](#7-внешние-интеграции)
8. [Архитектура и Edge Functions](#8-архитектура-и-edge-functions)
9. [Фоновые задачи (Cron)](#9-фоновые-задачи-cron)
10. [Конфигурация и секреты](#10-конфигурация-и-секреты)
11. [Деплой](#11-деплой)
12. [Администрирование](#12-администрирование)
13. [Биллинг (Stripe)](#13-биллинг-stripe)
14. [Мониторинг и отладка](#14-мониторинг-и-отладка)
15. [Быстрый старт для разработчика](#15-быстрый-старт-для-разработчика)
16. [Модель данных](#16-модель-данных)
17. [Как добавить новый модуль](#17-как-добавить-новый-модуль)
18. [Ключевые паттерны и соглашения](#18-ключевые-паттерны-и-соглашения)
19. [Модель безопасности](#19-модель-безопасности)

---

## 1. Обзор системы

**Vault23** — мультитенантный SaaS-бот в Telegram для ведения задач, заметок и напоминаний.

**Стек:**
- Telegram Bot API (webhook, inline keyboards)
- Supabase: Postgres + pgvector + Edge Functions + Storage
- OpenAI: Whisper (STT), text-embedding-3-small (KB), gpt-4o-mini (NLP, KB-ответы)
- Stripe: биллинг и подписки
- Google OAuth: интеграция с Calendar

**Мультитенантность:** каждый пользователь получает изолированный `workspace`. Все таблицы несут `workspace_id` + RLS-политики. Один пользователь = один воркспейс (по умолчанию).

**Идентичность:** Telegram ID — не первичный ключ. Таблица `users` + `auth_providers` (тип: `telegram`). Позволяет в будущем добавить вход через почту/Google без переделки.

---

## 2. Пользовательский интерфейс

### Первый запуск (`/start`)
1. Создаётся воркспейс + дефолтные темы для задач
2. Бот регистрирует команды в Telegram (выпадающий список `/`)
3. Отправляется приветственное сообщение с примерами NLP-запросов
4. Снимается любая Reply Keyboard, оставшаяся от старых версий

### Навигация
- **`/` (слэш)** — выпадающий список всех команд в Telegram (нативный)
- **Inline-кнопки** — основной UX для подтверждений, выбора, списков
- **NLP** — произвольный текст обрабатывается AI без команд

### Языки
Автоопределение по `language_code` Telegram: `ru` → русский, всё остальное → английский.  
Сменить: `/language`.  
Данные пользователя (задачи, заметки) не переводятся — только интерфейс бота.

---

## 3. Модули и команды

### Задачи

| Команда | Действие |
|---|---|
| `/task` | Создать задачу (диалог: название → тема → дедлайн) |
| `/tasks` | Список открытых и активных задач с кнопками |
| `/filter` | Фильтр по теме |
| `/today` | Задачи с дедлайном сегодня и просроченные |

**Статусы задачи:** `open` → `in_progress` → `done` / `deferred`  
**Soft-delete:** завершённые хранятся 90 дней (поле `deleted_at`).  
**Подзадачи:** кнопка ➕ на карточке задачи. Доступно на Solo+.

**Дедлайн:** устанавливается при создании (текстом в свободной форме, парсится GPT). При наличии дедлайна **автоматически создаётся напоминание** на то же время и дата.

**Регулярные задачи:** поле `recurrence` (jsonb). При нажатии ✅ Готово — статус сбрасывается в `open`, `due_at` сдвигается на следующее вхождение, напоминание обновляется. Форматы:
```json
{"type": "monthly", "day": 5}
{"type": "weekly", "weekday": 5}
{"type": "daily"}
{"type": "interval", "days": 14}
```
Регулярные задачи помечены `🔄` в списке.

---

### Заметки

| Команда | Действие |
|---|---|
| `/note` | Создать заметку (или `/note текст` сразу) |
| `/notes` | Последние 10 заметок |
| `/search запрос` | Полнотекстовый поиск по заметкам |
| `/meet` | Режим встречи |
| `/meetstop` или `/done` | Завершить режим встречи |

**Режим встречи (`/meet`):** всё, что пишешь — сохраняется как отдельные заметки с общим `session_id` и счётчиком. Удобно для конспектов. По завершении предлагает привязать всё к задаче.

---

### Голосовые сообщения

Команды не нужны — просто отправь голосовое.

**Процесс:**
1. Скачивается аудио из Telegram
2. Транскрибируется через OpenAI Whisper (`whisper-1`)
3. NLU: GPT проверяет, похоже ли на создание задачи
4. Если задача — показывает кнопки **✅ Создать задачу / 📝 Сохранить как заметку**
5. Если информация — сразу сохраняется как заметка

**Приватность:** аудиофайл удаляется после транскрипции, содержимое не логируется.  
**Ограничения по плану:** Trial/Free — 3 в месяц, Solo — 50, Team — 200.

---

### Напоминания

| Команда | Действие |
|---|---|
| `/remind` | Создать напоминание (диалог: текст → время) |
| `/reminders` | Список активных напоминаний с кнопкой отмены |

**Время:** свободная форма. Примеры: «завтра в 10:00», «через 2 часа», «пятница 15:30».  
**Хранение:** UTC. Крон проверяет каждую минуту и отправляет уведомление.  
**Связь с задачами:** поле `task_id` (nullable FK) — напоминание может быть привязано к задаче. При создании задачи с дедлайном напоминание создаётся с `task_id`. При reschedule регулярной задачи — `remind_at` обновляется.

---

### Подрядчики и прайс-лист

| Команда | Действие |
|---|---|
| `/contractor` | Добавить подрядчика (компанию или ИП) |
| `/contractors` | Список всех подрядчиков |
| `/find запрос` | Поиск по имени и специализации |
| `/addservice` | Добавить позицию в прайс-лист |
| `/services` | Прайс-лист, сгруппированный по подрядчикам |

Прайс-лист в виде PDF-совместимого документа доступен в личном кабинете (`/pricelist`).

---

### База знаний (KB)

| Команда | Действие |
|---|---|
| `/addkb` | Добавить запись (диалог: заголовок → содержимое → модерация) |
| `/ask вопрос` | Задать вопрос — ответ на основе KB |

**Обязательная модерация:** каждая запись проходит review-gate. Пока не нажато ✅ Одобрить — в индекс не попадает.

**Поиск:** двухступенчатый:
1. FTS (полнотекстовый, быстро, без API)
2. Векторный поиск (`text-embedding-3-small` → pgvector cosine similarity)

Результаты объединяются, затем GPT формирует ответ.

---

### Email

| Команда | Действие |
|---|---|
| `/email` | Отправить письмо (диалог: получатель → тема → тело) |

Отправка через настроенный `EMAIL_FROM_ADDRESS`. Лимиты: Trial/Free — 0, Solo — 20/мес, Team — 100/мес.

---

### Google Calendar

| Команда | Действие |
|---|---|
| `/connect` | OAuth-авторизация через Google |
| `/sync` | Синхронизировать задачи с дедлайнами в Calendar |

Задачи с `due_at` создаются как события в основном календаре. Изменения в Google Calendar обновляют задачу. Доступно на Solo+.

---

### Настройки и аккаунт

| Команда | Действие |
|---|---|
| `/settings` | Меню настроек (inline-кнопки) |
| `/language` | Сменить язык |
| `/subscription` | Тариф, статус, лимиты, управление оплатой |
| `/stats` | Статистика: задачи, заметки, напоминания |
| `/deletedata` | Полное удаление воркспейса (требует подтверждения «УДАЛИТЬ») |
| `/help` | Интерактивная справка по разделам |

---

## 4. NLP — разговорный режим

Любой текст без команды и вне активного диалога → обрабатывается GPT (`gpt-4o-mini`).

**Поддерживаемые интенты:**

| Что написать | Интент | Результат |
|---|---|---|
| «Добавь задачу: позвонить Максу в пятницу» | `create_task` | Задача + напоминание |
| «Оплатить интернет каждый месяц 5го числа» | `create_task` + recurrence | Регулярная задача |
| «Запомни: цена кирпича 12000р за паллету» | `create_note` | Заметка |
| «Напомни через 2 часа позвонить бухгалтеру» | `set_reminder` | Напоминание |
| «Покажи мои задачи» | `list_tasks` | Список задач |
| «Покажи мои заметки» | `list_notes` | Список заметок |
| «Найди задачу про Максима» | `search` | FTS по задачам и заметкам |
| «Как правильно оформить акт?» | `kb_ask` | Ответ из базы знаний |

**Приоритет обработки:**
1. Системные команды (`/start`, `/help`, etc.) — обрабатываются до загрузки контекста
2. Активный диалог (session state) — текст идёт в текущий модуль
3. Модули (commands, callbacks)
4. NLP fallback — всё остальное

**Парсинг дат:** для дедлайнов и напоминаний GPT конвертирует относительные выражения в ISO UTC («ближайшая пятница» → конкретная дата).

---

## 5. Тарифные планы и ограничения

| Функция | Trial (14д) | Free | Solo | Team |
|---|---|---|---|---|
| Задачи | 20 | 20 | ∞ | ∞ |
| Записи KB | 5 | 5 | 100 | 500 |
| Голосовых/мес | 3 | 3 | 50 | 200 |
| Писем/мес | 0 | 0 | 20 | 100 |
| Подзадачи | ❌ | ❌ | ✅ | ✅ |
| Google Calendar | ❌ | ❌ | ✅ | ✅ |
| Участников | 1 | 1 | 1 | 5 |

**Статусы воркспейса:** `trial` → `active` / `past_due` / `suspended` / `cancelled`  
**Grace period:** при `past_due` бот работает, но показывает предупреждение при каждом запросе.  
**Блокировка:** `suspended` и `cancelled` — все функции заблокированы, кроме `/subscription`.

---

## 6. AI-интеграции

### OpenAI

| Использование | Модель | Где |
|---|---|---|
| Транскрипция голоса | `whisper-1` | `modules/notes/handlers.ts` |
| NLP-парсинг текста | `gpt-4o-mini` | `core/nlp.ts` |
| Парсинг даты/времени | `gpt-4o-mini` | `core/nlp.ts` |
| KB: векторные эмбеддинги | `text-embedding-3-small` | `modules/kb/ai.ts` |
| KB: генерация ответов | `gpt-4o-mini` | `modules/kb/ai.ts` |
| Определение интента голоса | `gpt-4o-mini` | `modules/notes/handlers.ts` |

Ключ хранится в `app_settings` (таблица БД, ключ `OPENAI_API_KEY`) и в Supabase Secrets.

### Anthropic

Ключ `ANTHROPIC_KEY` проставлен в секретах. Не используется в текущей версии. Зарезервирован для возможного переключения KB-ответов на Claude Sonnet.

---

## 7. Внешние интеграции

### Google Calendar
- OAuth 2.0, токены хранятся в `google_integrations` (workspace-level)
- Access token обновляется автоматически при истечении
- Webhook: `calendar-webhook` Edge Function принимает push-уведомления от Google

### Stripe
- Продукты/цены: настраиваются в Stripe Dashboard
- Webhook: `stripe-webhook` Edge Function обрабатывает события (`checkout.session.completed`, `invoice.payment_failed`, etc.)
- Customer Portal: ссылка генерируется через Stripe API в `/subscription`
- `STRIPE_WEBHOOK_SECRET` — **нужно проставить** (текущий статус: не задан)

### Email (SMTP)
- Настраивается через `EMAIL_SMTP_HOST`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `EMAIL_FROM_ADDRESS`
- Обёртка: `modules/email/handlers.ts`

---

## 8. Архитектура и Edge Functions

```
supabase/functions/
├── bot/                    # Основной Telegram-обработчик (--no-verify-jwt)
│   ├── index.ts            # Точка входа: роутинг, NLP, системные команды
│   ├── core/               # Ядро
│   │   ├── types.ts        # BotContext, BotEvent, SessionState и др.
│   │   ├── identify.ts     # Идентификация пользователя, создание воркспейса
│   │   ├── context.ts      # Сборка BotContext
│   │   ├── router.ts       # Нормализация Telegram update → BotEvent
│   │   ├── registry.ts     # ModuleRegistry — маршрутизация к модулям
│   │   ├── i18n.ts         # Переводы + locale overrides из БД
│   │   ├── nlp.ts          # parseNaturalLanguage, parseDateTime
│   │   ├── gate.ts         # Проверка доступа по плану/статусу
│   │   ├── plans.ts        # Лимиты по тарифам
│   │   ├── session.ts      # Загрузка/сохранение состояния диалога
│   │   ├── commands.ts     # Список команд для Telegram "/" dropdown
│   │   ├── config.ts       # Чтение app_settings из БД
│   │   └── locales/        # ru.ts, en.ts — базовые тексты бота
│   ├── modules/            # Бизнес-модули
│   │   ├── tasks/
│   │   ├── notes/          # + голосовые сообщения
│   │   ├── attachments/
│   │   ├── reminders/
│   │   ├── contractors/
│   │   ├── kb/
│   │   ├── google/
│   │   ├── email/
│   │   ├── billing/
│   │   └── admin/
│   ├── telegram.ts         # HTTP-обёртки над Telegram Bot API
│   └── idempotency.ts      # Дедупликация по update_id
├── remind/                 # Обработчик напоминаний (вызывается кроном)
├── billing-housekeeping/   # Завершение триала и housekeeping (кроном)
├── cabinet-api/            # REST API для личного кабинета (--no-verify-jwt)
├── stripe-webhook/         # Stripe события (--no-verify-jwt)
├── calendar-webhook/       # Google Calendar push (--no-verify-jwt)
├── google-auth/            # OAuth callback от Google
├── web-auth/               # Аутентификация в личном кабинете
└── admin-stats/            # Внутренняя статистика
```

**Флаг `--no-verify-jwt`** обязателен для всех функций, принимающих внешние webhook-запросы (`bot`, `cabinet-api`, `stripe-webhook`, `calendar-webhook`). Без него Supabase отклонит запросы без Supabase JWT.

**Контракт модуля** (`MODULE_CONTRACT.md`): каждый модуль реализует `BotModule` interface:
- `name: string`
- `commands: string[]`
- `canHandle(event, session): boolean`
- `handle(ctx): Promise<ModuleResult>`

---

## 9. Фоновые задачи (Cron)

Расписание задано через `pg_cron` (миграция `20260526000010_cron_schedules.sql`).

| Задача | Расписание | Функция | Назначение |
|---|---|---|---|
| `remind-every-minute` | `* * * * *` | `remind` | Проверяет `reminders` с `remind_at ≤ now()`, отправляет уведомления |
| `billing-housekeeping-daily` | `0 3 * * *` | `billing-housekeeping` | Переводит истёкшие триалы в `free`, чистит expired данные |

Вызов через `pg_net.http_post`. Service Role Key читается из `app_settings.CRON_SERVICE_KEY`.

---

## 10. Конфигурация и секреты

### Supabase Secrets (обязательные)

| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather |
| `OPENAI_API_KEY` | OpenAI API (Whisper + GPT + embeddings) |
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Сервисный ключ (полный доступ к БД) |
| `ADMIN_TELEGRAM_ID` | Telegram ID администратора (744230399) |

### Supabase Secrets (опциональные)

| Переменная | Назначение |
|---|---|
| `ANTHROPIC_KEY` | Anthropic API (зарезервирован) |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Верификация Stripe webhook (**нужно проставить**) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `EMAIL_SMTP_HOST` | SMTP-сервер |
| `EMAIL_SMTP_USER` | SMTP логин |
| `EMAIL_SMTP_PASS` | SMTP пароль |
| `EMAIL_FROM_ADDRESS` | Адрес отправителя |

### app_settings (таблица БД)

Некоторые настройки хранятся в таблице `app_settings` (key/value):

| Ключ | Назначение |
|---|---|
| `OPENAI_API_KEY` | Дублируется сюда для доступа из бот-кода без env |
| `CRON_SERVICE_KEY` | Service Role Key для вызовов из pg_cron |
| `BOT_USERNAME` | `vault23_assist_bot` |
| `CONSENT_GATE_ENABLED` | `true/false` — включить требование согласия |

### Управление секретами

```bash
# Добавить / обновить секрет
supabase secrets set KEY=value

# Посмотреть список (без значений)
supabase secrets list
```

---

## 11. Деплой

### Деплой бота

```bash
supabase functions deploy bot --no-verify-jwt
```

### Деплой всех функций

```bash
supabase functions deploy --no-verify-jwt
```

### Деплой конкретной функции

```bash
supabase functions deploy remind
supabase functions deploy billing-housekeeping
supabase functions deploy cabinet-api --no-verify-jwt
```

### Миграции БД

```bash
# Применить новые миграции к проду
supabase db push
```

**Правила:** миграции версионированы (`YYYYMMDDNNNNNN_name.sql`). Каждая идемпотентна (`IF NOT EXISTS`, `IF EXISTS`). Перед применением проверить на копии.

### Webhook Telegram

Webhook устанавливается автоматически при деплое. Если нужно переустановить вручную:
```
https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{project}.supabase.co/functions/v1/bot
```

---

## 12. Администрирование

Доступно пользователю с `ADMIN_TELEGRAM_ID`.

### В боте

**`/adminmenu`** — admin-панель с inline-кнопками:
- **📊 Статистика** — воркспейсы / пользователи / задачи / заметки по всей платформе
- **⚙️ Конфигурация** — статус всех ключей в `app_settings`
- **✏️ Тексты бота** — подсказка открыть Locales-вкладку в личном кабинете

**`/adminstats`** и **`/configs`** — дублируют кнопки выше как команды.

### Locale Overrides

Тексты бота можно переопределять без деплоя через таблицу `locale_overrides` (lang, key, value). Редактируется в личном кабинете на вкладке «Тексты бота». Применяются поверх базовых файлов `ru.ts` / `en.ts`.

### Личный кабинет

Статичный HTML, лежит в `landing/cabinet/index.html`. Использует `cabinet-api` Edge Function.  
Вкладки: задачи, заметки, подрядчики, KB, подписка, Locales.

---

## 13. Биллинг (Stripe)

### Жизненный цикл подписки

```
Регистрация → trial (14 дней)
                    ↓ истёк без оплаты
                  free (ограниченный)
                    ↓ оформил подписку
                  active (solo / team)
                    ↓ оплата не прошла
                  past_due (grace period, бот работает + предупреждение)
                    ↓ не оплатил
                  suspended (бот заблокирован)
                    ↓ отменил
                  cancelled
```

### Stripe события (обрабатываются в `stripe-webhook`)

| Событие | Действие |
|---|---|
| `checkout.session.completed` | Привязать Stripe customer к воркспейсу, установить `active` |
| `invoice.payment_succeeded` | Обновить `subscription_current_period_end` |
| `invoice.payment_failed` | Перевести в `past_due` |
| `customer.subscription.deleted` | Перевести в `cancelled` |

**⚠️ TODO:** `STRIPE_WEBHOOK_SECRET` не проставлен — подпись Stripe не верифицируется.

---

## 14. Мониторинг и отладка

### Логи Edge Functions

```bash
supabase functions logs bot --tail
supabase functions logs remind --tail
```

### Ключевые лог-события

| Событие | Уровень | Что означает |
|---|---|---|
| `[index] routing to module` | info | Нормальная маршрутизация |
| `[index] NLP fallback` | info | Текст без команды ушёл в NLP |
| `[index] no module matched` | info | Неизвестная команда/текст вне NLP |
| `[index] duplicate update, skipping` | info | Telegram прислал повтор |
| `[index] unexpected runtime error` | error | Необработанное исключение |
| `[tasks] no topics found` | error | У воркспейса нет тем — должно создаться триггером |

### Ручная проверка webhook

```bash
curl -X POST https://api.telegram.org/bot{TOKEN}/getWebhookInfo
```

Должен показать `url`, `has_custom_certificate: false`, `pending_update_count` близко к 0.

### Проверка крона

```sql
-- В SQL Editor Supabase
SELECT jobname, schedule, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

### Известные ограничения

- **Время в UTC** — напоминания создаются в UTC, пользователь должен делать поправку на часовой пояс сам (поддержка TZ заморожена)
- **FTS только русский** — конфигурация `russian` в индексах; при английских запросах поиск может работать хуже
- **NLP-лимиты** — каждое текстовое сообщение тратит ~200 токенов GPT; при высокой нагрузке стоит добавить rate limiting
- **`STRIPE_WEBHOOK_SECRET` не задан** — нужно задать для production

---

## 15. Быстрый старт для разработчика

### Необходимые инструменты

```bash
# Supabase CLI
brew install supabase/tap/supabase

# Deno (для локального запуска функций)
brew install deno
```

### Подключение к проекту

```bash
# Клонировать репо и перейти в папку
cd Ai_Assistant_Vault23

# Привязать к существующему Supabase-проекту
supabase link --project-ref orrlwzsvrliipcigmzfi

# Проверить секреты
supabase secrets list

# Проверить миграции
supabase db diff
```

### Локальный запуск бота (для разработки)

Бот работает через Telegram webhook — локальный запуск требует туннеля (ngrok/cloudflared):

```bash
# Запустить Edge Function локально
supabase functions serve bot --env-file .env.local

# В другом терминале — туннель
cloudflared tunnel --url http://localhost:54321

# Установить webhook на туннельный URL
curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://xxx.trycloudflare.com/functions/v1/bot"
```

### Структура `.env.local` (для локального запуска)

```env
TELEGRAM_BOT_TOKEN=...
OPENAI_API_KEY=...
SUPABASE_URL=https://orrlwzsvrliipcigmzfi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_TELEGRAM_ID=744230399
```

### Деплой изменений

```bash
# Только функция бота
supabase functions deploy bot --no-verify-jwt

# Новая миграция
supabase db push
```

---

## 16. Модель данных

### Ключевые таблицы

| Таблица | Назначение |
|---|---|
| `workspaces` | Тенант. Поля: `status`, `plan`, `trial_ends_at`, `stripe_customer_id` |
| `users` | Пользователь. Поля: `workspace_id`, `language`, `consent_given_at` |
| `auth_methods` | Способы входа. Тип `telegram` → `provider_id` = Telegram ID |
| `tasks` | Задачи. Поля: `title`, `status`, `due_at`, `recurrence` (jsonb), `topic_id`, `parent_task_id`, `deleted_at` |
| `notes` | Заметки. Поля: `content`, `meeting_session_id`, `deleted_at` |
| `reminders` | Напоминания. Поля: `message`, `remind_at`, `status` (`pending`/`sent`), `task_id` (FK→tasks) |
| `topics` | Темы для задач. Поле `is_default` — дефолтная тема воркспейса |
| `contractors` | Подрядчики |
| `services` | Прайс-лист. FK→contractors (nullable) |
| `kb_entries` | База знаний. Поля: `title`, `content`, `status` (`draft`/`approved`), `embedding` (vector) |
| `bot_sessions` | Состояние диалога. Поля: `user_id`, `state`, `data` (jsonb) |
| `token_usage` | Трекинг AI-использования (Whisper, embeddings, chat) |
| `locale_overrides` | Переопределения текстов бота без деплоя. Поля: `lang`, `key`, `value` |
| `app_settings` | Конфиг платформы. Key-value. |
| `processed_updates` | Идемпотентность: хранит обработанные Telegram `update_id` |

### Принципы схемы

1. **`workspace_id` везде** — каждая содержательная таблица. RLS-политика изолирует данные.
2. **Время в UTC** — только `timestamptz`. Никаких `timestamp without time zone`.
3. **Soft-delete** — задачи и заметки удаляются через `deleted_at`. Жёсткое удаление — только при удалении всего воркспейса.
4. **UUID PK** — все первичные ключи `uuid DEFAULT gen_random_uuid()`.
5. **`updated_at` триггер** — автоматически обновляется на таблицах с этим полем.

### Автоматическое создание дефолтных данных

При создании воркспейса срабатывает триггер `trg_workspace_seed_defaults`:
- Создаёт тему «Прочее» (`is_default = true`)
- Создаёт 6 категорий (Переговоры, Продажи, Производство, Логистика, Документы, Прочее)

---

## 17. Как добавить новый модуль

Пример: добавляем модуль `FooModule` с командой `/foo`.

### Шаг 1 — Создать структуру файлов

```
supabase/functions/bot/modules/foo/
├── index.ts          # BotModule implementation
├── handlers.ts       # Бизнес-логика
├── queries.ts        # Запросы к БД
└── locales/
    ├── ru.ts
    └── en.ts
```

### Шаг 2 — Локали

```typescript
// locales/ru.ts
export const ru: Record<string, string> = {
  foo_hello: 'Привет из Foo!',
};

// locales/en.ts
export const en: Record<string, string> = {
  foo_hello: 'Hello from Foo!',
};
```

### Шаг 3 — Queries

```typescript
// queries.ts
import type { SupabaseClient } from '../../core/types.ts';

export async function getFooData(db: SupabaseClient, workspaceId: string) {
  const { data, error } = await db
    .from('some_table')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`getFooData: ${error.message}`);
  return data ?? [];
}
```

### Шаг 4 — Handlers

```typescript
// handlers.ts
import type { BotContext, ModuleResult } from '../../core/types.ts';
import { getFooData } from './queries.ts';

export async function handleFooCommand(ctx: BotContext): Promise<ModuleResult> {
  const data = await getFooData(ctx.db, ctx.user.workspaceId);
  await ctx.reply(ctx.t('foo_hello'));
  return { ok: true, clearSession: true };
}
```

### Шаг 5 — Module class

```typescript
// index.ts
import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import { handleFooCommand } from './handlers.ts';

registerLocale(ru, en);

export class FooModule implements BotModule {
  readonly name = 'foo';
  readonly commands = ['/foo'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    // Возвращает true для всех event/state, которые этот модуль обрабатывает
    if (session.state.startsWith('foo_')) return true;
    if (event.type === 'callback_query') {
      return event.callbackData?.startsWith('foo_') ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    if (ctx.event.command === '/foo') return handleFooCommand(ctx);
    // ... остальные состояния
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
```

### Шаг 6 — Зарегистрировать в index.ts

```typescript
// supabase/functions/bot/index.ts
import { FooModule } from './modules/foo/index.ts';
// ...
registry.register(new FooModule());
```

### Шаг 7 — Добавить команду в commands.ts (опционально)

```typescript
// core/commands.ts — в DEFAULT_COMMANDS
{ command: 'foo', description: 'Описание команды' },
```

### Важные правила

- **Никогда не писать `workspace_id` в запросах без фильтрации** — всегда `.eq('workspace_id', ctx.user.workspaceId)`
- **Все тексты — через `ctx.t('key')`** — ни одной строки интерфейса хардкодом
- **Ошибки — в лог, пользователю — понятный текст:** `console.error('[foo] ошибка', {...})` + `await ctx.reply(ctx.t('error_unexpected'))`
- **session.clearSession** — всегда возвращать `{ clearSession: true }` в конечных состояниях
- **Gate-проверки** — если фича платная: `const g = ctx.gate('feature_name'); if (!g.allowed) { ... }`

---

## 18. Ключевые паттерны и соглашения

### Обработка события

Каждый Telegram update проходит через:
```
TelegramUpdate
  → normalizeEvent()       [router.ts]  — создаёт BotEvent
  → identifyUser()         [identify.ts] — находит/создаёт user + workspace
  → loadSession()          [session.ts]  — текущее состояние диалога
  → loadWorkspace()        [context.ts]  — статус и план воркспейса
  → buildContext()         [context.ts]  — BotContext для всех модулей
  → SystemCommands         [index.ts]    — /start, /help, /stats, etc.
  → gate('any')            [gate.ts]     — глобальная проверка доступа
  → registry.route()       [registry.ts] — первый подходящий модуль
  → NLP fallback           [index.ts]    — если модуль не нашёлся и text event
```

### Состояния диалога (Session)

Многошаговые диалоги хранят состояние в `bot_sessions.state` + `bot_sessions.data` (jsonb).

Соглашение по именованию state: `{module}_{action}`, например:
- `task_awaiting_title`
- `task_awaiting_deadline`
- `note_awaiting_content`
- `kb_awaiting_question`

`canHandle` модуля проверяет `session.state.startsWith('task_')` чтобы перехватить все состояния модуля.

### i18n

```typescript
// Получить строку
ctx.t('key')
ctx.t('key_with_params', { name: 'Максим', count: 5 })

// Шаблон в locale файле
task_created: 'Задача создана: {title}',
```

Порядок приоритета: `locale_overrides` (БД) > `locales/ru.ts` / `en.ts` > fallback на английский.

### Gate-проверки

```typescript
const gate = ctx.gate('voice');
if (!gate.allowed) {
  const key = gate.reason === 'feature_not_in_plan' ? 'gate_plan_limit' : 'gate_suspended';
  await ctx.reply(ctx.t(key));
  return { ok: false, clearSession: true };
}
```

Доступные фичи для проверки: `any`, `voice`, `email_send`, `calendar`, `subtask_create`.

### Идемпотентность

`processed_updates` хранит `update_id` всех обработанных обновлений. Telegram гарантирует доставку at-least-once — таблица защищает от дублирования.

---

## 19. Модель безопасности

### Row Level Security (RLS)

**Все содержательные таблицы** имеют RLS. Политика изоляции:
```sql
-- Типичная политика
CREATE POLICY "workspace_isolation" ON tasks
  USING (workspace_id = (
    SELECT workspace_id FROM users WHERE id = auth.uid()
  ));
```

Bot Edge Function работает с `service_role_key` — RLS обходится намеренно. Фильтрация по `workspace_id` обязательна в каждом запросе кода.

### JWT и Webhook

Telegram и Stripe отправляют запросы без Supabase JWT. Поэтому:
- `bot`, `cabinet-api`, `stripe-webhook`, `calendar-webhook` деплоятся с `--no-verify-jwt`
- `remind`, `billing-housekeeping` вызываются кроном с Service Role JWT — флаг не нужен

### Telegram ID ≠ User ID

Telegram ID хранится в `auth_methods.provider_id`, но не является первичным ключом пользователя. Все бизнес-операции используют `users.id` (UUID). Это позволяет в будущем:
- Связать один аккаунт с несколькими способами входа
- Отключить Telegram без потери данных

### Удаление данных

- **Soft-delete** (`deleted_at`): задачи, заметки — восстановимы 90 дней
- **Hard delete** (`DELETE workspaces`): при `/deletedata` — каскадно удаляет весь воркспейс и пользователя, остаётся только обезличенная аналитика
