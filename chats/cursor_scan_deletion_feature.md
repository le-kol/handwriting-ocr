# Scan deletion feature
_Exported on 8/14/2026 at 13:18:28 GMT+7 from Cursor (3.15.19)_

---

**User**

/speckit-specify 
Добавить удаление скана: кнопку и backend endpoint. Подтверждение 
перед удалением не требуется — удаление происходит сразу по клику.

Backend:
- DELETE /api/Scans/{id} — удаляет запись скана из БД (слова 
  удаляются каскадно существующим ON DELETE CASCADE, отдельно 
  ничего не удалять) и файл изображения с диска через существующий 
  FileStorageService. Успех — 204 NoContent (по карте конституции, 
  принцип III). Скан не найден — 404 «Не найдена запись в БД». Если 
  файл на диске уже отсутствует к моменту удаления — это не 
  считается ошибкой всего запроса (запись в БД и так удаляется), 
  но такой случай не должен приводить к 500.

Frontend — два места вызова одного и того же действия:
1. Кнопка "Удалить скан" в панели действий текущего открытого 
   скана, рядом с "Распознать текст" и "Добавить слово". Удаляет 
   текущий открытый (scanId) скан. После успеха — сброс состояния 
   редактора до пустого (как перед загрузкой/выбором скана): 
   scanId, words, layoutLines, draft и все статусы очищаются.
2. Кнопка "Удалить" в каждой строке таблицы сканов. Удаляет скан 
   этой строки независимо от того, открыт ли он сейчас в редакторе.
   - Если удаляемый скан — это текущий открытый (scanId совпадает) — 
     применяется тот же сброс состояния редактора, что и в пункте 1.
   - После успешного удаления таблица обновляется: перезапрашивается 
     текущая страница; если страница оказалась пустой и это не 
     первая страница — переход на предыдущую страницу.

Не входит в объём: подтверждение удаления; массовое удаление 
нескольких сканов; восстановление удалённого скана (undo).

---

**Cursor**

Создаю спецификацию по skill speckit-specify: проверяю хуки, шаблон и существующие specs.


Создаю директорию фичи и пишу спецификацию.


## Спецификация создана

| Параметр | Значение |
|----------|----------|
| **Директория фичи** | `specs/006-delete-scan` |
| **Файл спецификации** | `specs/006-delete-scan/spec.md` |
| **Чеклист** | `specs/006-delete-scan/checklists/requirements.md` |

### Краткое содержание

Спецификация описывает удаление скана в трёх пользовательских сценариях:

1. **P1 — из редактора**: кнопка «Удалить скан» в панели действий, один клик без подтверждения, полный сброс редактора после успеха.
2. **P1 — из таблицы**: кнопка «Удалить» в каждой строке, обновление текущей страницы; если страница пуста и это не первая — переход на предыдущую.
3. **P1 — сервер**: `DELETE /api/Scans/{id}` → 204; 404 «Не найдена запись в БД»; каскадное удаление слов; удаление файла; отсутствие файла на диске не блокирует успех.

**Вне объёма**: подтверждение, массовое удаление, undo.

### Результаты валидации

Все 16 пунктов чеклиста пройдены с первой итерации. Маркеров `[NEEDS CLARIFICATION]` нет — входное описание было достаточно полным.

### Следующий шаг

Спецификация готова к **`/speckit-plan`** (уточнения через `/speckit-clarify` не требуются).

---

**User**

/speckit-clarify 

---

**Cursor**

Запускаю speckit-clarify: проверяю prerequisites и загружаю текущую спецификацию.


Проверяю паттерны клиента на предмет неоднозначностей, влияющих на UX.


Провёл сканирование спецификации `specs/006-delete-scan/spec.md` по таксономии skill. Критических неоднозначностей, требующих формального уточнения, не обнаружено.

---

## Отчёт о завершении `/speckit-clarify`

| Параметр | Значение |
|----------|----------|
| **Вопросов задано и принято** | 0 |
| **Обновлённая спецификация** | `specs/006-delete-scan/spec.md` (без изменений) |
| **Затронутые разделы** | — |

### Spec Quality Checklist

**16/16 → 16/16** пунктов пройдено (изменений нет).

- **Новых прохождений:** нет  
- **Регрессий:** нет  
- **Остаётся непройденным:** нет  

---

### Сводка покрытия

| Категория | Статус |
|-----------|--------|
| Functional Scope & Behavior | **Clear** — цели, out-of-scope, сценарии и SC заданы явно |
| Domain & Data Model | **Clear** — скан, слова (CASCADE), файл; схема не меняется |
| Interaction & UX Flow | **Clear** — два пути удаления, сброс редактора, обновление таблицы, ошибки |
| Non-Functional (performance, security) | **Clear** — для brownfield-монолита без auth; метрики не критичны |
| Integration & Dependencies | **Clear** — существующий список сканов, хранилище файлов |
| Edge Cases & Failure Handling | **Clear** — двойной клик, отсутствие файла, пустая страница, сеть |
| Constraints & Tradeoffs | **Clear** — без confirm/undo/bulk; порядок БД/файл → plan |
| Terminology & Consistency | **Clear** — термины согласованы с `005` и конституцией |
| Completion Signals | **Clear** — FR и acceptance scenarios проверяемы |

### Отложено на этап планирования (низкий impact)

- Блокировка кнопок удаления во время распознавания/векторизации — следует существующему паттерну (`disabled` при `isRecognizing` и т.п.).
- Поведение при гонке двух DELETE (второй → 404) — в edge cases уже указано «UI не ломается»; детали guard/in-flight — в plan.
- Обновление таблицы после удаления из редактора — **намеренно не входит** в path 1 по исходному описанию; только path 2 обновляет список.

---

### Рекомендация

Спецификация достаточно полная для планирования. Следующий шаг:

**`/speckit-plan`**

---

**User**

/speckit-plan 
Backend: новый метод в ScanDbService (DELETE по id, параметризованный SQL); удаление файла через метод в FileStorageService. Контроллер без SQL.

Frontend: логика сброса состояния при удалении текущего открытого скана переиспользует уже существующую последовательность сброса (ту же, что при переключении скана из таблицы / при новой загрузке файла) — не дублировать её отдельным блоком кода. Обе кнопки ("в панели" и "в строке таблицы") вызывают один и тот же клиентский обработчик удаления с параметром id скана.

Не вводить: soft-delete / флаг удаления в БД (удаление — обычный DELETE); подтверждающие диалоги.

---

**Cursor**

Запускаю speckit-plan: поднимаю окружение и собираю контекст по существующему коду.


Создаю артефакты планирования: plan.md, research.md, data-model.md, contracts и quickstart.


## План готов

**Ветка:** `006-delete-scan`

### Артефакты

| Файл | Назначение |
|------|------------|
| [specs/006-delete-scan/plan.md](specs/006-delete-scan/plan.md) | План реализации, Constitution Check, структура кода |
| [specs/006-delete-scan/research.md](specs/006-delete-scan/research.md) | Решения: SQL, порядок БД→файл, один `handleDeleteScan`, `resetEditorState` |
| [specs/006-delete-scan/data-model.md](specs/006-delete-scan/data-model.md) | Hard delete, CASCADE, переходы состояния клиента |
| [specs/006-delete-scan/contracts/delete-scan.md](specs/006-delete-scan/contracts/delete-scan.md) | `DELETE /api/Scans/{id}` → 204 / 404 |
| [specs/006-delete-scan/contracts/delete-scan-ui.md](specs/006-delete-scan/contracts/delete-scan-ui.md) | Две кнопки → один обработчик, сброс, refresh таблицы |
| [specs/006-delete-scan/quickstart.md](specs/006-delete-scan/quickstart.md) | 10 ручных сценариев проверки |

### Ключевые решения

**Backend**
- `ScanDbService.DeleteScanAsync(id)` — `DELETE FROM scans WHERE id = @id`, возвращает `bool`
- `FileStorageService.DeleteFileIfExistsAsync(path)` — no-op, если файла нет
- Контроллер: `GetScanPathAsync` → `DeleteScanAsync` → удаление файла → **204**; без SQL в контроллере

**Frontend**
- `deleteScan(id)` + единый `handleDeleteScan(id)` для обеих кнопок
- Сброс текущего скана: `setScanId(null)` + `resetEditorState()` (без дублирования setter'ов)
- `resetEditorState` расширить: `isRecognizing`, `isSaving`, `isSavingLayout`, `wordsOpenError`
- Из таблицы: refresh текущей страницы; пустая страница N > 1 → `listPage - 1`
- Без soft-delete, confirm-диалогов и refresh таблицы при удалении только из панели редактора

**Constitution Check:** все пункты PASS (до и после design).

### Следующий шаг

**`/speckit-tasks`** — разбить план на задачи для реализации.

---

**User**

Получение пути файла лучше получать через RETURNING в запросе DELETE в DeleteScanAsync 

---

**Cursor**

Обновляю plan и research: путь к файлу будет возвращаться через `RETURNING` в `DeleteScanAsync`.


Обновил артефакты под ваше решение.

### Изменение

`DeleteScanAsync(int id)` теперь возвращает `Task<string?>`:

```sql
DELETE FROM scans WHERE id = @id RETURNING path;
```

- **`null`** → 404 «Не найдена запись в БД»
- **path** → `DeleteFileIfExistsAsync(path)` → 204

Отдельный `GetScanPathAsync` перед удалением больше не нужен — один round-trip, без гонки между SELECT и DELETE.

### Обновлённые файлы

- `specs/006-delete-scan/research.md` — секции 1 и 3
- `specs/006-delete-scan/plan.md` — Constitution Check, структура кода
- `specs/006-delete-scan/contracts/delete-scan.md` — server layering
- `specs/006-delete-scan/data-model.md` — описание DELETE
- `specs/006-delete-scan/spec.md` — допущение о порядке операций

---

**User**

/speckit-tasks 

---

**Cursor**

Запускаю speckit-tasks: поднимаю окружение и читаю артефакты фичи.


Пишу `tasks.md` по шаблону и артефактам фичи.


## `tasks.md` создан

**Путь:** `specs/006-delete-scan/tasks.md`

### Сводка

| Метрика | Значение |
|---------|----------|
| **Всего задач** | 15 (T001–T015) |
| **Phase 1 Setup** | 1 |
| **Phase 2 US3 (backend)** | 3 |
| **Phase 3 US1 (редактор)** | 4 |
| **Phase 4 US2 (таблица)** | 3 |
| **Phase 5 Polish** | 4 |

### Задачи по user stories

| Story | Задачи | Фокус |
|-------|--------|--------|
| **US3** | T002–T004 | `DeleteScanAsync` (`RETURNING path`), `DeleteFileIfExistsAsync`, `DELETE {id}` |
| **US1** | T005–T008 | `resetEditorState`, `deleteScan`, `handleDeleteScan`, кнопка «Удалить скан» |
| **US2** | T009–T011 | refresh списка, кнопка «Удалить» в строке, CSS |
| **—** | T001, T012–T015 | Setup, контракты, quickstart, регрессии |

### Параллельность

- **T002 ∥ T003** — сервисы БД и файлов
- **T006** — после T005, параллельно с UI-разметкой
- **T011 ∥ T010** — стили после разметки строки

### MVP

**Phase 2 (US3) + Phase 3 (US1)** — backend + удаление открытого скана из редактора (quickstart §1–§4).

### Независимые проверки

- **US3:** quickstart §1–§3 (HTTP)
- **US1:** quickstart §4 (редактор)
- **US2:** quickstart §5–§7, §10 (таблица)

### Следующий шаг

**`/speckit-implement`** или **`/speckit-analyze`** для проверки согласованности spec/plan/tasks.

---

**User**

/speckit-analyze 

---

**Cursor**

Запускаю speckit-analyze: проверяю prerequisites и загружаю spec, plan, tasks и constitution.


## Specification Analysis Report

**Feature:** `006-delete-scan`  
**Artifacts:** `spec.md`, `plan.md`, `tasks.md`  
**Constitution:** нарушений MUST не обнаружено

---

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| U1 | Underspecification | MEDIUM | spec.md FR-008; tasks.md T005 | FR-008 требует «пустое состояние как до выбора/загрузки», но T005 расширяет только `resetEditorState` (words, layout, in-flight). Не упомянуты `uploadStatus`, `selectedFile` — после удаления может остаться текст «Загрузка завершена» или выбранный файл в input. | В T005 или delete-scan-ui.md явно перечислить: при `id === scanId` дополнительно сбрасывать `uploadStatus` / `selectedFile` (если нужно полное соответствие FR-008), либо зафиксировать в spec, что upload-блок вне «редактора». |
| U2 | Underspecification | MEDIUM | spec.md US2 сценарий 5, FR-013; tasks.md T008, T010 | Ошибка удаления из **строки таблицы** должна быть видна оператору (FR-013, US2#5). T008 привязывает `deleteScanStatus` к `.workspace-side`; T010 не указывает, где показывать ошибку при delete из таблицы, когда редактор свёрнут/пуст. | Разместить `deleteScanStatus` (или общий блок ошибок) в `.scans-section` над таблицей; обновить T010/T013. |
| A1 | Ambiguity | MEDIUM | tasks.md T009 | Формулировка «`fetchScansPageWithRetry` (or `loadScansPage` with callback)» — два паттерна без выбора; риск расхождения с существующим `loadScansPage` (без возврата data в then). | Зафиксировать один подход: например, расширить `loadScansPage` callback с `{ items, totalCount }` или вызывать `fetchScansPageWithRetry` напрямую в `handleDeleteScan`. |
| I1 | Inconsistency | LOW | tasks.md T007 vs T009 | `handleDeleteScan` создаётся в US1 (T007) с отложенной логикой `refreshList` до US2 (T009). Это осознанное разбиение, но MVP US1 technically ships handler без table-refresh branch. | Оставить как есть; в T007 добавить stub `if (options?.refreshList) { /* T009 */ }` или явную пометку «no-op until T009». |
| D1 | Duplication | LOW | spec.md FR-008, FR-011 | FR-011 повторяет сброс редактора из FR-008 для пути «удаление из таблицы текущего скана». | Не менять — полезно для трассировки US1/US2; при желании FR-011 сослаться на FR-008. |
| E1 | Coverage gap (edge) | LOW | spec.md edge cases; tasks.md | После удаления скана `brokenThumbnails` может сохранять id удалённого скана (005). Не блокирует функциональность. | Опционально: в T007/T009 удалять id из `brokenThumbnails` при успехе. |
| G1 | Coverage gap (SC) | LOW | spec.md SC-007 | KPI «90% участников…» — post-launch метрика, не buildable work. | Исключить из scope tasks (корректно); проверять SC-001–SC-006 через T014. |

**Overflow:** прочие edge cases (двойной клик, единственный скан, черновик `id===0`) покрыты T007, T009, T013, T014.

---

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 | ✅ | T004, T012 | DELETE endpoint |
| FR-002 | ✅ | T004, T012 | 204 NoContent |
| FR-003 | ✅ | T004, T012 | 404 «Не найдена запись в БД» |
| FR-004 | ✅ | T002, T004 | CASCADE, no word DELETE |
| FR-005 | ✅ | T003, T004 | File removal |
| FR-006 | ✅ | T003, T004, T012, T014 | Missing file → 204 |
| FR-007 | ✅ | T008 | Editor button, no confirm |
| FR-008 | ✅ | T005, T007, T008 | Partial: см. U1 |
| FR-009 | ✅ | T010, T011 | Table button |
| FR-010 | ✅ | T009 | List refresh + page N−1 |
| FR-011 | ✅ | T007, T009 | Reset when id === scanId |
| FR-012 | ✅ | T009 | No editor change otherwise |
| FR-013 | ✅ | T007, T013 | Partial: см. U2 |
| FR-014 | ✅ | T006, T007, T010 | Single `deleteScan` + handler |
| FR-015 (out of scope) | ✅ | Notes | Negative scope in tasks Notes |
| SC-001 … SC-006 | ✅ | T008–T014 | Manual quickstart |
| SC-007 | — | — | Excluded (user survey KPI) |

---

### Constitution Alignment Issues

**Нет.** Plan/tasks согласованы с принципами I–V:

- SQL только в `ScanDbService` (`RETURNING path`)
- Контроллер без SQL, 204/404 plain text
- Без Liquibase / soft-delete
- CASCADE для слов

---

### Unmapped Tasks

| Task | Mapping |
|------|---------|
| T001 | Setup / brownfield prerequisites |
| T011 | Supports FR-009 (UI) |
| T012–T015 | Verification & regression (cross-cutting) |

Все задачи имеют обоснованное назначение; «осиротевших» задач нет.

---

### Metrics

| Metric | Value |
|--------|-------|
| Total Functional Requirements (buildable) | 14 (FR-001…FR-014) |
| Total Tasks | 15 |
| Requirement Coverage | **100%** (14/14) |
| Ambiguity Count | 1 (A1) |
| Duplication Count | 1 intentional (D1) |
| **Critical Issues Count** | **0** |

---

### Next Actions

Критических блокеров нет — можно переходить к **`/speckit-implement`**.

Перед реализацией желательно (не блокирует):

1. Уточнить U1 — полный сброс vs только editor state.
2. Уточнить U2 — видимость `deleteScanStatus` для ошибок из таблицы.
3. Зафиксировать в T009 один паттерн refresh (A1).

Команды при доработке артефактов: правки `tasks.md` и/или `contracts/delete-scan-ui.md` вручную или повторный **`/speckit-plan`** только для UI-контракта (минимальный diff).

---

Хотите, чтобы я предложил **конкретные правки** для топ-3 находок (U1, U2, A1) в `tasks.md` / `delete-scan-ui.md`? (Применять автоматически не буду — только текст правок для вашего одобрения.)

---

**User**

U1 - полный сброс

---

**Cursor**

Обновляю артефакты: при удалении текущего скана — полный сброс состояния (U1).


U1 зафиксирован: **полный сброс** через `clearToEmptyState()`.

### Что меняется при удалении текущего скана

Новый хелпер `clearToEmptyState()` в `App.tsx`:

1. `setScanId(null)`
2. `setSelectedFile(null)`
3. `setUploadStatus(null)`
4. `resetEditorState()` (расширенный: in-flight + `wordsOpenError`)
5. Сброс `<input type="file">` через ref (`value = ""`)

`resetEditorState()` **не** трогает `scanId` и upload-поля — чтобы не ломать `handleScanRowClick` / `handleFileChange`.

### Обновлённые файлы

- `contracts/delete-scan-ui.md` — контракт полного сброса
- `tasks.md` — T005, T007, T013, Notes
- `plan.md`, `research.md`, `data-model.md`, `spec.md` (Assumptions)

`handleDeleteScan` при `id === scanId` вызывает только `clearToEmptyState()`, без отдельного блока setter'ов.

