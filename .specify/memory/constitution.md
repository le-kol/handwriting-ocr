<!--
Sync Impact Report
- Version change: (template placeholders) → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Верность стеку и монолиту SPA+API
  - [PRINCIPLE_2_NAME] → II. Тонкие контроллеры, сервисы с явным SQL
  - [PRINCIPLE_3_NAME] → III. Типизированная карта ошибок HTTP
  - [PRINCIPLE_4_NAME] → IV. Целостность домена скана и порядка слов
  - [PRINCIPLE_5_NAME] → V. Схема только через Liquibase
- Added sections:
  - Core Principles (I–V заполнены по brownfield-анализу)
  - Technology Stack & Constraints (бывш. SECTION_2)
  - Client–API Contract & UX State (бывш. SECTION_3)
  - Governance (процедура поправок)
- Removed sections: none (шаблонные плейсхолдеры заменены)
- Follow-up TODOs: none
-->

# handwriting-ocr Constitution

## Core Principles

### I. Верность стеку и монолиту SPA+API

Проект — единое ASP.NET Core 8 приложение с встроенным React
(Vite) клиентом (`SpaRoot` / SpaProxy). Backend MUST оставаться
`net8.0` Web API; frontend MUST оставаться React + TypeScript + Vite
с проксированием `/api` на Kestrel. Данные MUST храниться в PostgreSQL;
миграции MUST выполняться Liquibase (`liquibase/changelog.sql`).
Распознавание рукописи MUST идти через Yandex Vision OCR
(`YandexOcrService` + `AddHttpClient`). Не вводить ORM (EF Core и
аналоги), отдельные микросервисы или альтернативный OCR-провайдер без
явной поправки конституции.

**Rationale**: Конституция фиксирует уже работающий brownfield-стек,
а не идеальную целевую архитектуру.

### II. Тонкие контроллеры, сервисы с явным SQL

`ScansController` MUST только валидировать вход, вызывать сервисы и
маппить результат в `IActionResult`. Доступ к PostgreSQL MUST идти
через scoped-сервисы (`ScanDbService`, `WordDbService`) на Npgsql с
параметризованным SQL. Файлы сканов MUST обрабатываться
`FileStorageService`; OCR — только `YandexOcrService`. Каждый вызов
БД MUST открывать своё соединение из пула (`await using`); мутации
слов MUST оборачиваться в транзакцию с явным `CommitAsync`. DI:
scoped для DB/storage; `AddHttpClient<T>` для HTTP-клиентов, не
`AddScoped` с ручным `HttpClient`.

**Rationale**: Так уже устроен код: контроллер не знает SQL, сервисы
не отдают HTTP-коды.

### III. Типизированная карта ошибок HTTP

Ошибки домена и интеграций MUST выражаться типами исключений или
nullable/bool из сервисов; контроллер MUST переводить их в HTTP так:

- валидация входа / формата → `400 BadRequest` (текст на русском);
- сущность не найдена (скан, файл, слово) → `404 NotFound`;
- `ArgumentException` из сервиса (раскладка, MIME OCR) → `400`;
- `InvalidOperationException` (нет конфига OCR/Storage) → `503`;
- `HttpRequestException` (сбой Yandex) → `502`;
- успешное удаление → `204 NoContent`; создание слова → `201 Created`.

Тело ошибки MUST быть plain text (строка), не JSON ProblemDetails.
Клиент MUST читать `response.text()` при `!ok`. Не глотать исключения
OCR/раскладки без этой карты.

**Rationale**: `YandexOcrService` и `ApplyLayoutAsync` уже различают
причины сбоя типами; фронт ожидает текст.

### IV. Целостность домена скана и порядка слов

Скан (`scans`) владеет файлом на диске и набором слов (`words`).
`order_index` MUST быть плотным и уникальным в пределах `scan_id`
(0, 1, 2, …); `line_index` MUST быть плотным номером строки OCR.
Ограничение `unique_order` MUST оставаться `deferrable initially
deferred`, чтобы сдвиг индексов внутри транзакции был допустим.
Повторный OCR (`POST …/recognize`) MUST полностью заменять слова
скана (`ReplaceWordsFromOcrAsync`), не смешивая со старыми. Рамки
слов MUST хранить четыре вершины (x1..y4) как у Yandex. Поля `id` /
`scanId` из тела запроса MUST игнорироваться: источник истины —
маршрут и БД. Контент слова (текст + рамка) и раскладка (строки /
порядок) MUST сохраняться разными операциями (`PUT …/words/{id}` vs
`PUT …/words/layout`).

**Rationale**: Домен завязан на чтение слева направо и ручную правку
порядка без потери рамок.

### V. Схема только через Liquibase

Изменения таблиц, ограничений и колонок MUST добавляться новыми
changeset'ами в `liquibase/changelog.sql` (formatted SQL) с
`--rollback`. Прикладной код MUST НЕ создавать/менять схему в
runtime. Секреты и строки подключения MUST жить в конфигурации
(`ConnectionStrings:Default`, `Storage:ScansFolder`, блок
`YandexOcr`), не в исходниках и не в changelog. Имена файлов сканов
MUST быть GUID + расширение; в БД хранится абсолютный путь,
возвращённый `FileStorageService`.

**Rationale**: README и миграции уже задают единственный путь эволюции
схемы и конфигурации.

## Technology Stack & Constraints

- **Backend**: ASP.NET Core 8, контроллеры `[Route("api/[controller]")]`,
  Swagger в Development, `MapFallbackToFile("/index.html")`.
- **Frontend**: React 19, один основной экран (`App.tsx`), fetch к
  `/api/Scans/...`, без отдельного state-менеджера.
- **DB**: PostgreSQL + Npgsql; таблицы `scans`, `words` (FK
  `on delete cascade`).
- **OCR**: синхронный `recognizeText`, model по умолчанию
  `handwritten`, языки `ru`/`en`; MIME в API — короткие `PNG`/`JPEG`.
- **Файлы**: только `.png` / `.jpg` / `.jpeg` (проверка расширения).
- **Язык UX/ошибок**: русские сообщения пользователю и в HTTP-теле.
- **Комментарии в коде**: поясняют «почему» (отложенный unique,
  замена слов OCR, игнор id из тела) — новые критичные инварианты
  SHOULD документироваться так же.

Запрещено без поправки конституции: EF/Dapper-обёртки как новый
стандарт доступа, JSON-ошибки вместо текста, неявное «дописывание»
слов при OCR, хранение исходного имени файла как ключа.

## Client–API Contract & UX State

Клиентский `Word` MUST зеркалить серверную модель (camelCase JSON:
`orderIndex`, `lineIndex`, вершины рамки). Локальная раскладка
(`layoutLines`) MAY расходиться с `words` до «Сохранить порядок»;
сохранение текста/рамки MUST НЕ сбрасывать локальный порядок.
Новое слово с `id === 0` — черновик до `POST …/words`; layout с
несохранённым словом MUST НЕ отправляться. Размеры изображения для
SVG-рамок берутся из `naturalWidth`/`naturalHeight`, не из БД.
Прокси Vite MUST сохранять префикс `/api`. Любой новый endpoint
сканов SHOULD следовать существующим путям и статусной семантике
принципа III.

## Governance

Эта конституция имеет приоритет над локальными привычками и
«улучшениями ради чистоты», если они противоречат принципам I–V.
Поправки MUST:

1. Обновлять `.specify/memory/constitution.md` с Sync Impact Report.
2. Поднимать **Version** по semver: MAJOR — удаление/переопределение
   принципов; MINOR — новый принцип или существенное расширение;
   PATCH — уточнения формулировок.
3. Ставить **Last Amended** в ISO-дату дня правки; **Ratified** не
   менять без отдельного решения о переучреждении.
4. При конфликте с кодом либо править код под конституцию, либо
   сначала амendirовать конституцию с обоснованием brownfield-факта.

Перед merge фичи ревьюер SHOULD проверить: слой сервисов и SQL,
карту ошибок, инварианты `order_index`/`line_index`, changeset
Liquibase при смене схемы, контракт клиента с plain-text ошибками.
Сложность сверх текущего монолита MUST быть явно обоснована в spec
или PR.

**Version**: 1.0.0 | **Ratified**: 2026-08-10 | **Last Amended**: 2026-08-10
