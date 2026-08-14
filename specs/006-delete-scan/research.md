# Research: Удаление скана

**Feature**: `006-delete-scan`  
**Date**: 2026-08-14

Все пункты Technical Context закрыты; NEEDS CLARIFICATION не осталось. Вход `/speckit-plan`: `DeleteScanAsync` в `ScanDbService`; файл через `FileStorageService`; контроллер без SQL; клиент — один `handleDeleteScan(id)` и переиспользование `resetEditorState()`.

## 1. SQL удаления в `ScanDbService`

**Decision**: Метод `DeleteScanAsync(int id)` → `Task<string?>` — возвращает `path` удалённой строки или `null`, если запись не найдена.

```sql
DELETE FROM scans WHERE id = @id RETURNING path;
```

- Параметр `@id` через `AddWithValue("id", id)`.
- `ExecuteScalarAsync()` / reader: одна строка → `path`; нет строки → `null`.
- Одно соединение (`await using`), один round-trip; без транзакции с файлом (файл вне БД).
- Слова не удалять отдельно — FK `words.scan_id REFERENCES scans(id) ON DELETE CASCADE` (changeset в `liquibase/changelog.sql`).

**Rationale**: Конституция II; path нужен для удаления файла после DELETE — `RETURNING path` атомарно отдаёт путь без отдельного SELECT. Spec FR-004 запрещает отдельные DELETE по словам.

**Alternatives considered**:
- **`GetScanPathAsync` + отдельный `DELETE`** — два запроса и окно гонки между SELECT и DELETE; отвергнуто.
- **`DELETE` + `ExecuteNonQueryAsync` (bool)** — path теряется после удаления; потребовал бы предварительный SELECT.
- **Soft-delete / флаг `deleted`** — явно вне scope.
- **SQL в контроллере** — нарушение принципа II.

## 2. Удаление файла в `FileStorageService`

**Decision**: Метод `DeleteFileIfExistsAsync(string path)` (или sync `DeleteFileIfExists` — по стилю соседних методов; предпочтительно async-обёртка для единообразия API контроллера).

- Если `!File.Exists(path)` — **ничего не делать**, не бросать исключение.
- Если файл есть — `File.Delete(path)`.
- IO-ошибки (нет прав и т.п.) — пробрасывать; контроллер не перехватывает в 500 специально для «файл уже нет» (это покрыто веткой Exists).

**Rationale**: Spec FR-006: отсутствие файла не должно ломать успешное удаление записи. Запись к этому моменту уже удалена в БД.

**Alternatives considered**:
- **Удалять файл до DELETE в БД** — при сбое БД останется запись без файла (хуже для домена).
- **Транзакция БД + файл** — невозможна для файловой системы; принят порядок: DELETE БД (`RETURNING path`) → DELETE файл.

## 3. Порядок операций в контроллере

**Decision**: Тонкий action `DELETE {id}`:

1. `path = await _scanDbService.DeleteScanAsync(id)` → `null` → **404** «Не найдена запись в БД» (как `GetImage`, `GetWords`).
2. `await _fileStorageService.DeleteFileIfExistsAsync(path)` — ошибки только реального IO, не «нет файла».
3. **204 NoContent**.

**Rationale**: `DELETE … RETURNING path` за один запрос удаляет строку и отдаёт путь для файла — без гонки между SELECT и DELETE. Spec FR-005/FR-006. Карта ошибок III: 404 для «не найдена запись»; 204 для успешного удаления.

**Alternatives considered**:
- **`GetScanPathAsync` + `DeleteScanAsync(bool)`** — два round-trip'а; отвергнуто по решению плана.
- **`ResourceNotFoundException` + try/catch** — допустимо; для `string?` достаточно проверки `null`.

## 4. HTTP-контракт

**Decision**: `DELETE /api/Scans/{id}` на `ScansController`. Тело запроса отсутствует.

| Ситуация | HTTP | Тело |
|----------|------|------|
| Запись удалена (файл удалён или уже отсутствовал) | 204 | нет |
| Скан не найден | 404 | `Не найдена запись в БД` |

**Rationale**: Spec FR-001…FR-003; принцип III (204 для delete).

**Alternatives considered**:
- **200 + JSON** — против конституции для delete.
- **404 если файл не найден после успеха БД** — против FR-006.

## 5. Клиент: один обработчик и сброс редактора

**Decision**:

- Fetch-хелпер `deleteScan(id: number): Promise<void>` — `DELETE /api/Scans/{id}`, успех при `response.status === 204`; при `!ok` → `throw Error(await response.text())`.
- Единый `handleDeleteScan(id: number)`:
  - Guard: `isDeletingScan` — блокировать повторный клик; disabled на обеих кнопках + во время recognize/batch (как у vectorize).
  - `deleteScan(id).then(...)`:
    - Если `id === scanId` → **`clearToEmptyState()`** (полный сброс: `scanId`, `selectedFile`, `uploadStatus`, file input ref, `resetEditorState()`).
    - Если вызов из таблицы (всегда после успеха для table path): пересчитать страницу — `loadScansPage(listPage)`; если `items.length === 0 && listPage > 1` → `setListPage(listPage - 1)` (effect подгрузит N−1).
  - Ошибка → текст (отдельный `deleteScanStatus` или reuse `listError` только для table — предпочтительно **`deleteScanStatus`** под панелью редактора / над таблицей, чтобы не путать со сбоем GET list).
- Кнопка в редакторе: `onClick={() => scanId !== null && handleDeleteScan(scanId)}`, рядом с «Распознать текст» / «Добавить слово»; видна только при `scanId !== null`.
- Кнопка в строке: `onClick={(e) => { e.stopPropagation(); handleDeleteScan(item.id); }}` — не открывать скан (spec assumption).

**Расширение `resetEditorState()`** (единая точка сброса, уже используется в `handleScanRowClick` / `handleFileChange`):

- Добавить сброс `isRecognizing`, `isSaving`, `isSavingLayout`, `wordsOpenError` — чтобы удаление во время операций не оставляло «висящие» статусы.
- **Не** включать `setScanId(null)` / upload-поля **внутрь** `resetEditorState()` — переключение строки таблицы сразу ставит новый id; полное пустое состояние после delete — **`clearToEmptyState()`**.

**Rationale**: Вход плана запрещает дублировать блок сброса. `resetEditorState` уже централизует words/layout/draft/статусы vectorize/delete. Разделение: «очистить рабочее состояние редактора» vs «нет текущего скана».

**Alternatives considered**:
- **Отдельная функция `clearEditorToEmpty()`** — дублировала бы большую часть `resetEditorState`; отвергнуто.
- **Refresh таблицы после delete из редактора** — spec не требует (только path из таблицы); не делать.
- **Confirm dialog** — вне scope.

## 6. Обновление таблицы после удаления из строки

**Decision**: После 204:

```text
loadScansPage(listPage)
  → в then: если items пуст и listPage > 1 → setListPage(listPage - 1)
```

Либо один вызов с проверкой `totalCount` из ответа GET. Предпочтительно: после `loadScansPage` в callback проверить `data.items.length === 0 && page > 1`.

**Rationale**: Spec FR-010, SC-005.

**Alternatives considered**:
- **Всегда `listPage - 1`** — неверно при удалении не последнего на странице.
- **Локально выкинуть строку без GET** — расходится с totalCount и пагинацией.

## 7. In-flight и двойной клик

**Decision**: Флаг `isDeletingScan`; кнопки disabled пока запрос не завершён. Второй параллельный DELETE → 404 — ошибку показать, UI не сбрасывать (spec edge case). Не трактовать 404 как успех.

**Rationale**: Spec US1 сценарий 4 и edge case «два быстрых клика».

**Alternatives considered**:
- **Idempotent 404 → success на клиенте** — против явного сценария «показать ошибку» для stale delete.
