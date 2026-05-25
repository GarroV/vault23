# Шаблон промта для Gemini

> Использовать для каждого 🟢/🟡-блока. Вкладывать DATA_MODEL + MODULE_CONTRACT + CONVENTIONS целиком.
> Шаг 1.4 (🔴 Claude).

---

## Структура промта

```
[ПРЕАМБУЛА — вставлять всегда]

Ты пишешь TypeScript/Deno код для Supabase Edge Functions.
Это часть проекта Task Assistant Bot — мультитенантный SaaS на Telegram.

Стек: Supabase (Postgres + Edge Functions + Storage) · TypeScript/Deno · Telegram Bot API · OpenAI.

Ниже — три документа, которые являются источниками правды. Следуй им строго.

---
## DATA_MODEL.md
<вставить содержимое DATA_MODEL.md целиком>

---
## MODULE_CONTRACT.md
<вставить содержимое MODULE_CONTRACT.md целиком>

---
## CONVENTIONS.md
<вставить содержимое CONVENTIONS.md целиком>

---

[ЗАДАНИЕ — менять под каждый блок]

## Задача

<Описание конкретного блока. Примеры ниже.>

## Что сгенерировать

<Список файлов с кратким описанием каждого.>

## Ограничения

- Не добавлять поля в БД которых нет в DATA_MODEL.md.
- Не писать RLS-политики — это делается отдельно вручную.
- Не писать логику идентификации пользователя и воркспейса — это ядро.
- workspace_id всегда из ctx.user.workspaceId.
- Все тексты через ctx.t() — оба языковых файла (ru.ts и en.ts) обязательны.
- Запросы к БД — только в queries.ts, не в handlers.ts.

## Формат ответа

Выдать готовые файлы блоком кода с путём в комментарии сверху:
// functions/modules/tasks/index.ts
<код>

// functions/modules/tasks/handlers.ts
<код>

...и так для каждого файла.
```

---

## Примеры заданий для частых блоков

### CRUD справочника (категории / темы)

```
## Задача
Реализовать модуль управления категориями задач (виды работ).

Пользователь может:
- /categories — показать список категорий воркспейса
- Создать новую категорию (многошаговый диалог: запросить название)
- Архивировать категорию (кнопка в списке)

Категория: таблица categories (см. DATA_MODEL.md).

## Что сгенерировать
- functions/modules/categories/index.ts — BotModule
- functions/modules/categories/handlers.ts — обработчики команд
- functions/modules/categories/queries.ts — запросы к БД
- functions/modules/categories/locales/ru.ts
- functions/modules/categories/locales/en.ts
```

### CRUD задач

```
## Задача
Реализовать базовые операции с задачами.

Пользователь может:
- /task — создать задачу (многошаговый диалог: название обязательно, остальное опционально)
- /tasks — показать открытые задачи воркспейса (статус open/in_progress, не удалённые)
- Закрыть задачу (кнопка → статус done)
- Отложить задачу (кнопка → статус deferred)

При создании: topic_id = дефолтная тема воркспейса (is_default=true), исполнитель = сам пользователь.

## Что сгенерировать
- functions/modules/tasks/index.ts
- functions/modules/tasks/handlers.ts
- functions/modules/tasks/queries.ts
- functions/modules/tasks/locales/ru.ts
- functions/modules/tasks/locales/en.ts
```

### Заметки

```
## Задача
Реализовать создание заметок к задачам.

Пользователь может:
- /note <task_id> — добавить заметку к задаче
- Без task_id — создать заметку без привязки (task_id = null, session_id = текущая сессия)

source = 'text' для текстового ввода. source = 'voice' устанавливается ядром до передачи в модуль.

## Что сгенерировать
- functions/modules/notes/index.ts
- functions/modules/notes/handlers.ts
- functions/modules/notes/queries.ts
- functions/modules/notes/locales/ru.ts
- functions/modules/notes/locales/en.ts
```

### SQL-миграции

```
## Задача
Сгенерировать SQL-миграции для следующих таблиц по DATA_MODEL.md:
<перечислить таблицы>

## Что сгенерировать
Отдельный .sql файл для каждой таблицы.
Имя файла: <timestamp>_create_<table>.sql

Каждый файл содержит:
1. CREATE TABLE с полями, типами и ограничениями строго по DATA_MODEL.md
2. CREATE INDEX для всех индексов из DATA_MODEL.md
3. Комментарий -- rollback: с DROP TABLE

Не генерировать: RLS-политики, триггеры, функции — это отдельный шаг.
```

### Обёртка над OpenAI API

```
## Задача
Реализовать функцию транскрибации голосового сообщения через OpenAI Whisper.

Вход: Telegram file_id голосового сообщения.
Выход: строка с текстом расшифровки.

Шаги:
1. Скачать файл из Telegram по file_id (Telegram Bot API getFile → скачать)
2. Отправить в OpenAI Whisper (model: whisper-1)
3. Вернуть текст

После транскрибации — записать расход в token_usage (operation_type='whisper', model='whisper-1').

## Что сгенерировать
- functions/core/voice-transcribe.ts — функция transcribeVoice(fileId, workspaceId, db)
```

---

## Чеклист проверки Gemini-блока (Claude делает после генерации)

- [ ] Поля в запросах совпадают с DATA_MODEL.md
- [ ] workspace_id берётся из параметра, не хардкодится
- [ ] Оба языковых файла есть и заполнены
- [ ] Запросы к БД в queries.ts, не в handlers.ts
- [ ] Нет RLS-политик в коде (они отдельно)
- [ ] Возвращается ModuleResult во всех ветках
- [ ] Нет `any` типов
- [ ] Ошибки обрабатываются по трём классам из CONVENTIONS.md
