# DATA_MODEL.md — модель данных

> Источник правды по схеме БД. Шаг 1.1 (🔴 Claude).
> Правила: каждая содержательная таблица несёт `workspace_id` + RLS. Время в UTC (timestamptz). Soft-delete через `deleted_at` / `archived_at`. Telegram ID — не первичный ключ.
> Статус: **ГОТОВО** — детализировано, готово к генерации миграций.

---

## Конвенции схемы

- Первичные ключи — `uuid`, `DEFAULT gen_random_uuid()`.
- Все содержательные таблицы несут `workspace_id uuid NOT NULL REFERENCES workspaces(id)`.
- Временные поля — `timestamptz` (UTC). Никакого `timestamp without time zone`.
- Soft-delete — `deleted_at timestamptz` (задачи, заметки) или `archived_at timestamptz` (справочники).
- Имена таблиц — множественное число, `snake_case`.
- Имена полей — `snake_case`.

---

## Таблицы

---

### `workspaces`

Тенант. Один воркспейс = один изолированный клиент.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `name` | text | NOT NULL | Название воркспейса |
| `status` | text | NOT NULL, DEFAULT 'trial' | `trial` / `active` / `past_due` / `suspended` / `cancelled` |
| `plan` | text | NOT NULL, DEFAULT 'free' | Тариф (заглушка до Этапа 9) |
| `trial_ends_at` | timestamptz | | Конец пробного периода |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

---

### `users`

Пользователь как личность. Telegram ID — не здесь, он в `auth_methods`.
Допущение: один пользователь = один воркспейс (на пилоте). При добавлении мультиворкспейса — мигрировать в таблицу `workspace_members`.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `display_name` | text | | Имя пользователя |
| `language` | text | NOT NULL, DEFAULT 'en' | `ru` или `en` |
| `timezone` | text | | Заморожено. Поле есть, не используется |
| `consent_given_at` | timestamptz | | Когда принял условия |
| `consent_version` | text | | Версия документа согласия |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id)`.

---

### `auth_methods`

Способы входа, привязанные к пользователю. Один пользователь — несколько способов входа.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| `type` | text | NOT NULL | `telegram` / `email` / `google` |
| `value` | text | NOT NULL | Telegram ID (строкой) / email / Google sub |
| `confirmed` | boolean | NOT NULL, DEFAULT false | Подтверждён ли способ входа |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** `UNIQUE(type, value)` — один Telegram ID не может принадлежать двум пользователям.
**Индексы:** `(type, value)` (основной lookup), `(user_id)`.

---

### `contractors`

Заказчики / подрядчики — внешние бизнес-сущности. Используются в Tasks (ось «с кем») и Knowledge Base.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | Название (компания или ФИО ИП) |
| `notes` | text | | Свободные заметки о подрядчике |
| `archived_at` | timestamptz | | Soft-delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id)`, `(workspace_id, archived_at)`.
**FTS:** индекс на `name`.

---

### `contractor_contacts`

Контактные данные подрядчика (телефоны, почты, мессенджеры, соцсети). Это строки-реквизиты, не поимённые сотрудники — сотрудники хранятся в `people`.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | NOT NULL, FK → contractors(id) ON DELETE CASCADE | |
| `type` | text | NOT NULL | `phone` / `email` / `telegram` / `whatsapp` / `instagram` / `website` / `other` |
| `value` | text | NOT NULL | Значение контакта |
| `label` | text | | Метка (например «личный», «рабочий») |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(contractor_id)`, `(workspace_id)`.

---

### `topics`

Темы задач — ось «про что». У каждого воркспейса есть тема-дефолт «Прочее», которая сидируется при создании.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | Название темы |
| `is_default` | boolean | NOT NULL, DEFAULT false | Ровно одна тема на воркспейс — дефолт |
| `visible` | boolean | NOT NULL, DEFAULT true | Скрыть из меню, не удалять |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** ровно один `is_default = true` на `workspace_id` — обеспечивать в коде.
**Сидирование:** при создании воркспейса автоматически создаётся тема `'Прочее'` (ru) / `'Other'` (en) с `is_default = true`.
**Индексы:** `(workspace_id)`, `(workspace_id, is_default)`.

---

### `categories`

Виды работ — ось «что делаем». Основа продуктовой аналитики.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | Название (переговоры, продажи, монтаж…) |
| `visible` | boolean | NOT NULL, DEFAULT true | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id)`.

---

### `tasks`

Ядро продукта. Четыре оси разбивки + статус + даты.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `title` | text | NOT NULL | Заголовок |
| `description` | text | | Описание |
| `status` | text | NOT NULL, DEFAULT 'open' | `open` / `in_progress` / `done` / `deferred` |
| `contractor_id` | uuid | FK → contractors(id), nullable | Ось 1: заказчик / с кем |
| `topic_id` | uuid | NOT NULL, FK → topics(id) | Ось 2: тема (дефолт «Прочее») |
| `category_id` | uuid | FK → categories(id), nullable | Ось 3: вид работы |
| `parent_task_id` | uuid | FK → tasks(id), nullable | Подзадача (иерархия) |
| `due_at` | timestamptz | | Срок выполнения |
| `deleted_at` | timestamptz | | Soft-delete (корзина) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

> Ось 4 (участники) — отдельная таблица `task_participants`.

**Индексы:**
- `(workspace_id, status)` — основной запрос «мои открытые задачи»
- `(workspace_id, contractor_id)`
- `(workspace_id, topic_id)`
- `(workspace_id, category_id)`
- `(workspace_id, due_at)` — просроченные / на сегодня
- `(parent_task_id)` — подзадачи
- FTS на `to_tsvector('russian', title || ' ' || coalesce(description, ''))`

---

### `people`

Участники и исполнители задач. Могут быть связаны с подрядчиком (`contractor_id`) и/или с системным пользователем (`user_id`).

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `name` | text | NOT NULL | Имя |
| `contractor_id` | uuid | FK → contractors(id), nullable | Если человек представляет подрядчика (напр. директор ООО Рога) |
| `user_id` | uuid | FK → users(id), nullable | Если человек — системный пользователь |
| `archived_at` | timestamptz | | Soft-delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id)`, `(contractor_id)`, `(user_id)`.
**Сидирование:** при создании воркспейса создаётся запись `people` для владельца с `user_id` = его `users.id`.

---

### `task_participants`

Связь задача ↔ участник (many-to-many) с ролью. Ось 4 задач.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | Для RLS |
| `task_id` | uuid | NOT NULL, FK → tasks(id) ON DELETE CASCADE | |
| `person_id` | uuid | NOT NULL, FK → people(id) | |
| `role` | text | NOT NULL, DEFAULT 'executor' | `executor` / `participant` / `observer` |

**Ограничения:** `UNIQUE(task_id, person_id)`.
**Индексы:** `(task_id)`, `(person_id)`, `(workspace_id, person_id)`.

---

### `notes`

Заметки к задачам. Могут создаваться группой в режиме «встреча» (общий `session_id`).

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `task_id` | uuid | FK → tasks(id), nullable | Привязка к задаче (nullable — до привязки в режиме встречи) |
| `content` | text | NOT NULL | Текст заметки |
| `source` | text | NOT NULL, DEFAULT 'text' | `text` / `voice` |
| `session_id` | text | | Идентификатор сессии встречи (группировка заметок) |
| `deleted_at` | timestamptz | | Soft-delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id, task_id)`, `(session_id)`.
**FTS:** на `content`.

---

### `attachments`

Вложения (файлы, скрины, PDF). Полиморфная привязка к задаче или заметке — целостность на уровне приложения.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `entity_type` | text | NOT NULL | `task` / `note` |
| `entity_id` | uuid | NOT NULL | ID задачи или заметки |
| `file_name` | text | NOT NULL | Оригинальное имя файла |
| `mime_type` | text | | MIME-тип |
| `file_size` | bigint | | Размер в байтах |
| `storage_path` | text | NOT NULL | Путь в Supabase Storage |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** лимит 20 МБ — проверяется в коде, не в БД.
**Индексы:** `(workspace_id, entity_type, entity_id)`.

---

### `time_entries`

Учёт времени на задачах.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `task_id` | uuid | NOT NULL, FK → tasks(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | Кто фиксирует время |
| `started_at` | timestamptz | NOT NULL | |
| `ended_at` | timestamptz | | NULL если ещё идёт |
| `duration_seconds` | integer | | Ручной ввод или вычисляется |
| `notes` | text | | Комментарий к записи |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id, task_id)`, `(workspace_id, user_id)`.

---

### `reminders`

Напоминания. Планировщик читает эту таблицу и отправляет пинги.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | Кому напомнить |
| `entity_type` | text | | `task` / NULL (свободное напоминание) |
| `entity_id` | uuid | | Ссылка на сущность (nullable) |
| `remind_at` | timestamptz | NOT NULL | Когда отправить (UTC) |
| `status` | text | NOT NULL, DEFAULT 'pending' | `pending` / `sent` / `cancelled` |
| `message` | text | | Текст напоминания |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(status, remind_at)` — планировщик читает `pending` в хронологии, `(workspace_id, user_id)`.

---

### `services`

Услуги и прайс-позиции подрядчиков. Денежные поля — под будущий калькулятор бюджета.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | FK → contractors(id), nullable | Чья услуга |
| `name` | text | NOT NULL | Название |
| `description` | text | | |
| `price` | numeric(12,2) | | Цена (nullable — неизвестна) |
| `currency` | text | DEFAULT 'RUB' | |
| `unit` | text | | Единица измерения (`шт`, `час`, `м²`…) |
| `archived_at` | timestamptz | | Soft-delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id, contractor_id)`.

---

### `kb_entries`

База знаний (RAG). Эмбеддинги через pgvector. Review-gate: `status = 'approved'` только после подтверждения пользователем.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `contractor_id` | uuid | FK → contractors(id), nullable | Привязка к подрядчику |
| `title` | text | NOT NULL | Заголовок |
| `content` | text | NOT NULL | Полный текст |
| `embedding` | vector(1536) | | Эмбеддинг (text-embedding-3-small) |
| `status` | text | NOT NULL, DEFAULT 'pending' | `pending` / `approved` |
| `source_type` | text | | `manual` / `document` / `note` |
| `source_id` | uuid | | Ссылка на исходный объект (nullable) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** векторный поиск — только по `status = 'approved'`.
**Индексы:** `(workspace_id, status)`, `(workspace_id, contractor_id)`, HNSW на `embedding` (pgvector).
**FTS:** на `(title, content)` — точный поиск кодов и артикулов.

---

### `bot_sessions`

Состояние многошаговых диалогов. `workspace_id` явный.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `user_id` | uuid | NOT NULL, FK → users(id) | |
| `state` | text | NOT NULL, DEFAULT 'idle' | Текущий шаг диалога |
| `data` | jsonb | DEFAULT '{}' | Данные текущего шага |
| `expires_at` | timestamptz | | Таймаут сессии |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Ограничения:** `UNIQUE(user_id)` — у пользователя одна активная сессия.
**Индексы:** `(user_id)`, `(expires_at)` — для чистки истёкших.

---

### `token_usage`

Учёт расхода токенов OpenAI. Ведётся с первого дня — основа для лимитов и единичной экономики.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `workspace_id` | uuid | NOT NULL, FK → workspaces(id) | |
| `operation_type` | text | NOT NULL | `whisper` / `embedding` / `generation` |
| `model` | text | NOT NULL | `gpt-4o-mini`, `text-embedding-3-small`… |
| `input_tokens` | integer | | |
| `output_tokens` | integer | | |
| `total_tokens` | integer | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Индексы:** `(workspace_id, created_at)`, `(workspace_id, operation_type)`.

---

### `processed_updates`

Идемпотентность Telegram: хранит обработанные `update_id`. Защита от двойной обработки.

| Поле | Тип | Ограничения | Описание |
|---|---|---|---|
| `update_id` | bigint | PK | Telegram update_id |
| `processed_at` | timestamptz | NOT NULL, DEFAULT now() | |

> Глобальная таблица — `workspace_id` не нужен.
> Чистить записи старше 24 часов (pg_cron).

---

## RLS (Row Level Security)

Для каждой таблицы с `workspace_id` — политика изоляции. Пишется вручную (🔴 Claude), не Gemini.

```sql
-- Шаблон (применять к каждой таблице)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON <table>
  USING (workspace_id = current_setting('app.workspace_id')::uuid);
```

Тест изоляции (два воркспейса — данные не пересекаются) — **блокер перед Этапом 3**.

---

## Сидирование при создании воркспейса

Автоматически при создании нового воркспейса:
1. Тема `'Прочее'` / `'Other'` с `is_default = true`.
2. Запись `people` для владельца воркспейса (`user_id` = его `users.id`).
3. Запись `bot_sessions` с `state = 'idle'` для пользователя.

---

## Открыто к уточнению при генерации миграций

- Точные параметры HNSW-индекса pgvector (`m`, `ef_construction`).
- FTS-конфигурация: `russian` для основного контента, `english` для фолбэка.
- Каскады `ON DELETE` — уточнить для каждой таблицы.
- Расписание чистки `processed_updates` и истёкших `bot_sessions` (pg_cron).
