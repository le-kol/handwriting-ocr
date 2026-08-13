# Research: Таблица сканов с пагинацией и миниатюрами

**Feature**: `005-scans-table-thumbnails`  
**Date**: 2026-08-14

Все пункты Technical Context закрыты; NEEDS CLARIFICATION не осталось. Вход `/speckit-plan`: размер страницы — Options по аналогии с `WordVectorizationOptions`; запрос списка — метод `ScanDbService`.

## 1. Размер страницы в Options

**Decision**: Новый класс `handwritingOCR.Server.Options.ScanListOptions` по образцу `WordVectorizationOptions`:

- `SectionName = "ScanList"`
- `PageSize` (int), значение по умолчанию **30**
- Регистрация: `builder.Services.Configure<ScanListOptions>(builder.Configuration.GetSection(ScanListOptions.SectionName))`
- В `appsettings.json`: `"ScanList": { "PageSize": 30 }`
- Контроллер списка читает `IOptions<ScanListOptions>`; клиент **не** передаёт `pageSize` в query
- Если `PageSize <= 0` — `InvalidOperationException` → **503** (как невалидная `WordVectorization`)

**Rationale**: Явное указание плана; spec FR-001 запрещает выбор размера клиентом, но не запрещает серверную конфигурацию. Дублировать «магическую» `const` в контроллере хуже, чем существующий паттерн Options.

**Alternatives considered**:
- **`const int PageSize = 30` в контроллере** — проще, но расходится с запрошенным паттерном Options.
- **Query `pageSize`** — запрещено spec (FR-001 / FR-015).
- **Вынести 30 только в клиент** — сервер обязан сам ограничивать выборку.

Уточнение к допущению spec «не выносится в настройки»: имелись в виду настройки **оператора/клиента**. Серверная секция `ScanList` — место константы, аналогично `WordVectorization`.

## 2. Выборка страницы в `ScanDbService`

**Decision**: Один метод, например `GetScansPageAsync(int page, int pageSize)`, возвращает `{ items: id[], totalCount }`. Одно соединение из пула (`await using`), два параметризованных SQL:

```sql
SELECT COUNT(*)::int FROM scans;

SELECT id FROM scans
ORDER BY id DESC
LIMIT @limit OFFSET @offset;
```

`offset = (page - 1) * pageSize`. Метод **не** проверяет `page < 1` (это валидация контроллера → 400). Для `page` за последней — пустой `items`, `totalCount` как есть.

**Rationale**: Конституция II: SQL в scoped-сервисе, не в контроллере. Пользователь явно потребовал метод в `ScanDbService`. Один метод — один контракт страницы, без гонки двух отдельных публичных вызовов COUNT/SELECT с разными снимками.

**Alternatives considered**:
- **SQL в контроллере** — нарушение принципа II.
- **Два публичных метода Count + List** — контроллер координирует SQL-последовательность; отвергнуто по входу плана.
- **`COUNT(*) OVER()` одним SELECT** — один round-trip, но менее привычно и дублирует count в каждой строке; два запроса на одном соединении достаточно для дипломного объёма.
- **Keyset pagination** — spec фиксирует номер страницы `page=1…n`.

## 3. HTTP-контракт списка

**Decision**: `GET /api/Scans?page={page}` на существующем `ScansController` (`[HttpGet]`, `[FromQuery] int page = 1`). Успех: `200` + JSON:

```json
{ "items": [ { "id": 12 }, { "id": 11 } ], "totalCount": 42 }
```

Модель ответа — небольшой тип в `Models/` (camelCase по умолчанию), не анонимный объект Upload: нужен стабильный контракт для клиента и Swagger.

| Ситуация | HTTP | Тело |
|----------|------|------|
| Успех (в т.ч. пустая БД, page за последней) | 200 | JSON `items` + `totalCount` |
| `page` отсутствует | 200 | как `page=1` |
| `page < 1` | 400 | RU, напр. «Номер страницы должен быть не меньше 1» |
| `PageSize` в конфиге ≤ 0 | 503 | RU текст `InvalidOperationException` |

**Rationale**: Spec FR-001…FR-004; принцип III.

**Alternatives considered**:
- **`{ scans, total }`** — менее явно, чем `items`/`totalCount` из spec.
- **Отдельный `ScansListController`** — лишний маршрут вне `api/Scans`.

## 4. Миниатюра на лету (ImageSharp)

**Decision**: `GET /api/Scans/{id}/thumbnail`. Сервис `ScanThumbnailService` (scoped):

1. `GetScanPathAsync` → `null` → `ResourceNotFoundException("Не найдена запись в БД")`
2. `GetFileAsync` → `null` → `ResourceNotFoundException("Не найден файл")`
3. `Image.Load` + `Mutate` `Resize` с `ResizeMode.Max`, размер **200×200** (большая сторона ≤ ~200px, без апскейла мелких кадров)
4. Кодировать в **исходный формат** (PNG/JPEG по расширению пути), как `GetImage` — без записи файла
5. Повреждение: тот же catch, что в `WordFragmentExtractor` (`UnknownImageFormatException` / `InvalidImageContentException`) → `ArgumentException("Повреждённое или нечитаемое изображение скана.")`

Контроллер маппит как vectorize: 404 / 400; успех — `File(bytes, contentType)` плюс заголовок `Cache-Control: public, max-age=86400`.

Константа 200px живёт в сервисе/Imaging (spec «~200px»); в Options выносится **только** `PageSize`, как потребовано на плане.

**Rationale**: ImageSharp уже в проекте; spec запрещает хранение миниатюр; карта ошибок совпадает с `GetImage` и векторизацией.

**Alternatives considered**:
- **Ресайз в контроллере** — контроллер толстеет, против II.
- **Всегда JPEG** — чуть легче, но меняет MIME относительно исходного скана; ресайз до 200px уже даёт «облегчённость».
- **Превью на диске / колонка path** — вне scope (FR-015).
- **`ThumbnailMaxSidePx` в ScanListOptions** — лишнее относительно входа плана.

## 5. Клиент: таблица, пагинация, ошибки списка

**Decision**: Секция на том же `App.tsx` (всегда видна, не отдельный route). State: `scanItems`, `totalCount`, `listPage` (с 1), `listError`. Константа клиента `SCAN_PAGE_SIZE = 30` (совпадает с дефолтом Options) для `lastPage = max(1, ceil(totalCount / 30))`.

- Загрузка: `GET /api/Scans?page=` при mount и смене `listPage`
- При `!ok`: `response.text()` → `listError`; **не** делать `setScanItems([])`, если уже был успешный список
- Кнопки «Назад» / «Вперёд»; disabled на первой / последней
- `<img src={"/api/Scans/" + id + "/thumbnail"} />`; `onError` — пустая ячейка, строка остаётся
- После успешного upload: `setListPage(1)` и повторный fetch страницы 1 (даже если уже была 1)

**Rationale**: Clarifications A/B по upload и ошибкам списка; FR-008, FR-009, FR-012, FR-013.

**Alternatives considered**:
- **Брать pageSize из ответа** — spec не добавляет поле; при смене Options без правки клиента рассинхрон возможен, но смена размера вне scope.
- **Полноразмерный `/image` в таблице** — запрещено FR-008.

## 6. Открытие скана из строки

**Decision**: Вынести сброс редактора из `handleFileChange` в общую функцию (тот же набор полей: words, layout, draft, статусы, imageSize, drag, vectorize/delete flags). `handleFileChange` вызывает её и затем upload. Клик по строке:

1. Тот же сброс (без обязательного `setSelectedFile`)
2. `setScanId(id)`
3. `fetchWords(id)` → `setWords` + `syncLayoutFromWords`; пустой массив — пустой редактор по словам
4. **Не** вызывать recognize
5. Ошибка GET words: текстовое сообщение; `scanId` уже новый; words остаются сброшенными (`null`/пусто), без данных прежнего скана

Изображение редактора — существующий `/api/scans/{id}/image`.

Выделение: `className` на `<tr>`, если `item.id === scanId`. Стиль — фон/контур, отличимый от остальных. На странице без этого id — ни одна строка не `.current`. После upload новый id выделен на странице 1.

**Rationale**: Clarifications B (слова) и A (highlight); FR-010, FR-011, FR-014.

**Alternatives considered**:
- **Только setScanId без fetchWords** — отвергнуто на clarify.
- **Авто-recognize при пустых словах** — отвергнуто на clarify.

## 7. Тестирование

**Decision**: Ручная приёмка по [quickstart.md](./quickstart.md). Новый test-проект не создаётся.

**Rationale**: Brownfield без автотестов; конституция не требует xUnit.
