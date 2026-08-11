# Word vector representation feature
_Exported on 8/11/2026 at 15:12:23 GMT+7 from Cursor (3.15.6)_

---

**User**

/speckit-specify 
Добавить функционал получения векторного представления слова из его 
изображения на скане.

Контекст: конечная цель — использование вектора в будущем для генерации 
почерка из текста (offline handwriting synthesis). Данные о порядке и 
направлении написания штрихов недоступны (offline-скан) и на данном 
этапе не требуются — задача текущей фичи ограничивается получением 
геометрического представления формы штрихов слова. Кривые аппроксимации 
— кубические кривые Безье (4 контрольные точки (x, y) на кривую).

Вход: существующая запись Word (Id, ScanId, четыре вершины рамки 
X1..Y4 в порядке, в котором их возвращает Yandex OCR — рамка может быть 
повёрнутым четырёхугольником, не axis-aligned прямоугольником).

Хранение: векторное представление хранится в существующей таблице 
words — как новая колонка этой же таблицы, привязанная к слову напрямую 
через её собственный первичный ключ (Id). Отдельная таблица для 
хранения векторного представления не создаётся — это уже принятое 
архитектурное решение, не предмет обсуждения на этапе планирования.

Требования:

1. Извлечение фрагмента слова
- Когда получен запрос на векторизацию слова (по его Id), система 
  должна по координатам X1..Y4 этого слова извлечь выровненный (с 
  учётом поворота рамки) фрагмент изображения скана, к которому 
  принадлежит слово (ScanId).
- Система должна поддерживать настраиваемый отступ от границ рамки 
  слова при извлечении фрагмента.
- Если слово с указанным Id не найдено, система должна вернуть ошибку 
  404 (см. constitution, принцип III).
- Если исходный файл скана недоступен или повреждён, система должна 
  вернуть ошибку без создания частичной записи вектора (карта ошибок — 
  см. constitution, принцип III).

2. Получение геометрического представления штрихов
- Система должна преобразовать изображение фрагмента слова в набор 
  кубических кривых Безье, аппроксимирующих форму (осевые линии) 
  штрихов слова.
- Погрешность аппроксимации должна быть настраиваемой.
- Порядок и направление между отдельными кривыми/сегментами не имеет 
  значения на данном этапе.
- Если для фрагмента не удаётся выделить ни одного штриха (пустой/
  нечитаемый фрагмент), система должна вернуть ошибку без создания 
  частичной записи.

3. Результат
- Система должна сохранить полученное представление (набор кривых) 
  в колонке curve_points существующей таблицы words, для 
  соответствующей записи Word (по Id) — без создания отдельной 
  таблицы.
- Тип колонки — real[], используемый как трёхмерный массив 
  вещественных чисел: [кривая][точка 0..3][координата x/y]. Число 
  кривых на слово переменное (задаётся первым измерением массива), 
  число точек на кривую фиксировано (см. контекст: кубическая кривая 
  Безье — 4 контрольные точки).
- Колонка добавляется как nullable (значение отсутствует до момента 
  векторизации слова).
- Добавление колонки в words должно быть выполнено через Liquibase 
  changeset (см. constitution, принцип V), как отдельное изменение 
  схемы.

Нефункциональные требования:
- Функционал должен следовать существующим паттернам проекта: тонкий 
  контроллер, сервис со scoped DI, явные транзакции при мутациях, карта 
  HTTP-ошибок из constitution (принцип III), схема БД — только через 
  Liquibase changeset (принцип V).
- Все числовые параметры (отступ, погрешность аппроксимации) должны 
  быть конфигурируемыми, не захардкоженными.

---

**Cursor**

Сначала проверю хуки Spec Kit и шаблоны, затем создам спецификацию по описанию векторизации слова.

Каталог `001-word-stroke-vector` уже есть — заполню спецификацию и чеклист качества. Хуков `extensions.yml` нет, пропускаю.

Проверяю спецификацию по чеклисту качества и фиксирую результат.

Спецификация готова.

### Результат

| | |
|---|---|
| **SPECIFY_FEATURE_DIRECTORY** | `specs/001-word-stroke-vector` |
| **SPEC_FILE** | `specs/001-word-stroke-vector/spec.md` |
| **Checklist** | `specs/001-word-stroke-vector/checklists/requirements.md` — все пункты пройдены |

### Содержание спецификации

- **P1**: векторизация слова по Id → вырезка выровненного фрагмента → кубические Безье → сохранение в `curve_points` у той же записи Word  
- **P1**: ошибки без частичных записей (404, файл, пустые штрихи)  
- **P2**: повторная векторизация с полной заменой  
- Scope явно ограничен геометрией формы; stroke order/direction и synthesis — вне объёма  
- Clarification-маркеров нет (решения зафиксированы в Assumptions)

### Хуки

`.specify/extensions.yml` отсутствует — pre/post hooks пропущены.

### Дальше

Можно переходить к `/speckit-plan` или, при необходимости уточнений, к `/speckit-clarify`.

---

**User**

/speckit-plan 

---

**Cursor**

Запускаю workflow планирования: проверю хуки и setup-скрипт, затем соберу контекст по спецификации и кодовой базе.

Контекст собран. Пишу `plan.md`, `research.md`, `data-model.md`, контракты и `quickstart.md`.

План Phase 0–1 готов. Constitution Check: **PASS**.

### Пути

| | |
|---|---|
| **Branch** (из setup-скрипта) | `001-word-stroke-vector` |
| **IMPL_PLAN** | `specs/001-word-stroke-vector/plan.md` |
| Текущий git branch | `dev` (каталог фичи не привязан к имени ветки) |

### Артефакты

- `research.md` — ImageSharp, pipeline скелет→Безье, `real[]` 3D, endpoint, карта ошибок, конфиг
- `data-model.md` — расширение Word + Liquibase changeset
- `contracts/vectorize-word.md` — `POST /api/Scans/{id}/words/{wordId}/vectorize`
- `quickstart.md` — ручная приёмка

### Ключевые решения

- Managed CV (ImageSharp + свой crop/skeleton/fit), без OpenCV  
- Хранение только в `words.curve_points`, отдельной таблицы нет  
- UI и synthesis — вне scope  

Хуки `extensions.yml` отсутствуют — пропущены.

Дальше: `/speckit-tasks`.

---

**User**

Исправить расхождение в data-model.md: тип C# для CurvePoints указан как
float[][][]?, тогда как в research.md зафиксировано float[,,]? —
прямоугольный многомерный массив.

Нужно заменить float[][][]? на float[,,]? везде в data-model.md, где
упоминается C#-тип колонки CurvePoints (таблица Word, раздел CurvePoints,
API model mapping или любые другие упоминания).

---

**Cursor**

В `data-model.md` тип `CurvePoints` в таблице Word заменён на `float[,,]?` — других упоминаний `float[][][]?` в файле не было.

---

**User**

/speckit-tasks 

---

**Cursor**

Генерирую `tasks.md`: сначала setup-скрипт и загрузка артефактов плана.

Сгенерирован `specs/001-word-stroke-vector/tasks.md`.

### Сводка

| | |
|---|---|
| **Всего задач** | 25 (T001–T025) |
| **US1** (векторизация, P1 MVP) | 5 (T011–T015) |
| **US3** (ошибки без порчи данных, P1) | 4 (T016–T019) |
| **US2** (повторная векторизация, P2) | 3 (T020–T022) |
| **Setup + Foundational + Polish** | 13 |

Автотесты не включены (в spec не запрошены).

### Параллельность

- Setup: T002–T004  
- US1: T011 ∥ T012 (Imaging)  
- US3: T017 ∥ проверки DB  
- Polish: T023 ∥ T024  

### Independent tests

- **US1**: quickstart §1 — `200` + непустой `curvePoints`  
- **US3**: quickstart §3–6 — 404/400/503 без частичной записи  
- **US2**: quickstart §2 — замена; ошибка не затирает старое  

### MVP

Phase 1–3 (Setup + Foundational + **US1**).

Формат чеклиста соблюдён: `- [ ]`, ID, `[P]`/`[US*]` где нужно, пути к файлам.

Хуки `extensions.yml` отсутствуют. Дальше: `/speckit-implement` или `/speckit-analyze`.

---

**User**

/speckit-analyze 

---

**Cursor**

Запускаю read-only анализ артефактов: сначала prerequisites, затем сверю spec/plan/tasks с конституцией.

## Specification Analysis Report

Критических нарушений конституции нет. Есть несколько расхождений и рисков перед `/speckit-implement`, в первую очередь вокруг сериализации `float[,,]` и формулировки «векторизация по Id».

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | HIGH | data-model.md (API JSON); tasks.md T006; plan/research (тип C#) | Контракт JSON задаёт вложенные массивы `curvePoints: [[[x,y],…]]`, а канонический C#-тип — `float[,,]?`. `System.Text.Json` по умолчанию плохо/не сериализует прямоугольные многомерные массивы в такой JSON. | В plan/tasks явно добавить custom converter или DTO для API; в research убрать вариант `float[][][]?` как равноправный. |
| I2 | Inconsistency | MEDIUM | spec.md FR-001, US1; contracts/vectorize-word.md; plan.md; tasks.md T015 | Spec: запрос «по Id слова». Plan/contract/tasks: обязательны `scanId` + `wordId` в пути. | Уточнить в spec: Id слова в рамках скана / путь `…/Scans/{id}/words/{wordId}/vectorize` (как принятое решение research). |
| I3 | Inconsistency | MEDIUM | research.md §3; data-model.md; tasks.md Notes | research всё ещё допускает `float[][][]?` **или** `float[,,]?`; data-model/tasks — только `float[,,]?`. | В research зафиксировать одно решение: `float[,,]?` (+ converter для JSON). |
| I4 | Inconsistency | LOW | spec FR-005 / US3.2; research/contract | «Файл недоступен или повреждён» в spec одним сценарием; в contract: нет файла → 404, повреждён → 400. | Оставить разведение 404/400 (как GetImage + ArgumentException); одной фразой отразить в spec Assumptions. |
| A1 | Ambiguity | MEDIUM | spec.md Edge Cases | «Почти нулевая площадь» рамки без порога. | Задать порог в plan/research (напр. min area / min side в px) и сослаться из tasks T011. |
| A2 | Ambiguity | LOW | plan.md Performance Goals | «Единицы секунд» без критерия приёмки и без задачи. | Оставить ориентиром или добавить необязательную проверку в quickstart; не блокирует MVP. |
| U1 | Underspecification | MEDIUM | spec SC-001 | 90% успеха на «тестовом наборе» без определения набора и процедуры в tasks. | Либо описать минимальный набор в quickstart, либо понизить SC-001 до качественного ориентира вне gate. |
| U2 | Underspecification | LOW | spec Edge: повторный OCR | Поведение «векторы не наследуются» верно при DELETE/replace слов, но нет явной задачи/заметки «не менять ReplaceWordsFromOcr». | Одна строка в tasks Polish или Notes: OCR-replace не трогать. |
| D1 | Duplication | LOW | spec FR-003 ↔ FR-015 | Оба про конфигурируемые отступ/погрешность. | Можно объединить при следующей правке spec; на tasks не влияет. |
| D2 | Duplication | LOW | tasks T009/T018/T020–T021 | US2/US3 в основном «confirm/verify» уже заложенной семантики UPDATE. | Допустимо как hardening; при желании сжать US2 до 1–2 задач. |
| C1 | Coverage | LOW | FR-008 | Нет отдельной задачи (осознанный non-goal). | Покрытие дизайн-решением; задача не нужна. |
| G1 | Constitution | — | constitution I–V vs plan/tasks | Конфликтов MUST нет: Liquibase, тонкий контроллер, plain-text ошибки, без ORM/отдельной таблицы. | — |

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 vectorize-by-word-id | Yes | T015 | Форма API — scan+word (см. I2) |
| FR-002 extract-aligned-fragment | Yes | T011 | |
| FR-003 configurable-padding | Yes | T002, T003, T011 | |
| FR-004 word-not-found-404 | Yes | T015, T019 | |
| FR-005 scan-file-error-no-write | Yes | T016, T019 | 404 vs 400 — I4 |
| FR-006 bezier-stroke-approx | Yes | T012 | |
| FR-007 configurable-tolerance | Yes | T002, T003, T012 | |
| FR-008 no-stroke-order-contract | N/A | — | Non-goal; C1 |
| FR-009 zero-strokes-error | Yes | T012, T017 | |
| FR-010 store-on-word-no-extra-table | Yes | T005, T009 | |
| FR-011 real-array-N×4×2 | Yes | T005, T006, T009 | JSON risk — I1 |
| FR-012 nullable-until-success | Yes | T005, T006 | |
| FR-013 liquibase-changeset | Yes | T005 | |
| FR-014 no-partial-replace-on-success | Yes | T009, T013, T018, T020, T021 | |
| FR-015 params-from-config | Yes | T002, T003, T010, T013 | |
| FR-016 project-patterns | Yes | T009, T013–T015 | |
| SC-001 90%-readable-words | Partial | T023 (косвенно) | Нет процедуры/набора — U1 |
| SC-002 negative-100%-no-partial | Yes | T016–T019, T023 | |
| SC-003 single-representation | Yes | T020–T022 | |
| SC-004 operator-invoke-feedback | Yes | T015 | |
| SC-005 schema-null-then-persist-read | Yes | T005, T007, T025 | |

### Constitution Alignment Issues

Нет CRITICAL. Принципы I–V согласованы с plan/tasks.

### Unmapped Tasks

| Task | Mapping |
|------|---------|
| T001 ImageSharp | infra / plan stack |
| T004 Imaging stubs | setup |
| T008 GetWordAsync | поддержка FR-001/US1 |
| T014 DI register | FR-016 |
| T022–T025 | US2 smoke / polish / SC-005 |

Все задачи привязаны к story, infra или polish — «сирот» нет.

### Metrics

| Metric | Value |
|--------|-------|
| Total Requirements (FR) | 16 |
| Buildable SC considered | SC-002…005 (+ SC-001 partial) |
| Total Tasks | 25 |
| FR coverage (≥1 task) | 15/16 явных + FR-008 non-goal → **~100%** функционального объёма |
| Ambiguity count | 2 (A1, A2) |
| Duplication count | 2 (D1, D2) |
| Critical issues | **0** |
| High issues | **1** (I1) |

---

### Next Actions

CRITICAL нет — `/speckit-implement` допустим, но **перед кодом API-ответа** лучше закрыть **I1** (сериализация `float[,,]`), иначе высок риск несоответствия контракту.

Рекомендуемый порядок:
1. Вручную поправить `research.md` (I3) и при желании `spec.md` (I2, I4, A1 / U1).
2. Добавить в `tasks.md` явный пункт: JSON converter/DTO для `curvePoints` (I1).
3. Затем `/speckit-implement`.

Альтернатива: сразу implement, заложив converter в T006/T015 без правки артефактов (хуже для трассируемости).

---

Would you like me to suggest concrete remediation edits for the top issues (I1–I3, A1)? (Только предложения — правки сам не применяю, пока не попросите.)

---

**User**

/speckit-analyze 

---

**Cursor**

Повторный анализ: сначала prerequisites и актуальные версии артефактов.

## Specification Analysis Report

Повторный прогон после правок: прежний **HIGH (сериализация `float[,,]`)** закрыт (`T007b` + research). CRITICAL нет — к `/speckit-implement` можно переходить; остались уточнения MEDIUM/LOW.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I2 | Inconsistency | MEDIUM | spec.md FR-001, Assumptions; plan/contracts/tasks | Spec: векторизация «по Id слова»; plan/contract/tasks: `POST /api/Scans/{id}/words/{wordId}/vectorize` (нужны scan + word). | В FR-001/Assumptions явно: слово идентифицируется `wordId` в маршруте скана `{id}` (как research §4). |
| I4 | Inconsistency | LOW | spec FR-005 / US3.2; research/contract/tasks T016 | Spec сливает «нет файла» и «повреждён»; contract: 404 vs 400. | Одна фраза в Assumptions: отсутствует → 404, повреждён → 400. |
| A1 | Ambiguity | MEDIUM | spec Edge Cases; tasks T011 | «Почти нулевая площадь» без порога. | Зафиксировать порог в research/plan (min area / min side px) и сослаться в T011. |
| U1 | Underspecification | MEDIUM | spec SC-001 | 90% на «тестовом наборе» без набора/процедуры в tasks. | Мини-набор в quickstart **или** SC-001 как ориентир вне gate реализации. |
| U2 | Underspecification | LOW | plan.md Project Structure | В research/tasks есть `Serialization/Float3DJsonConverter.cs`; в дереве plan — нет. | Добавить путь в plan (косметика трассируемости). |
| U3 | Underspecification | LOW | spec Edge: OCR replace | Поведение верное при delete/replace слов; явной заметки в tasks нет. | Строка в Notes/Polish: `ReplaceWordsFromOcr` не менять. |
| D1 | Duplication | LOW | spec FR-003 ↔ FR-015 | Оба про конфигурируемые параметры. | Опционально слить при правке spec. |
| D2 | Duplication | LOW | tasks T009 / T018 / T020–T021 | US2/US3 частично «verify» уже заданной семантики UPDATE. | Допустимо; при желании сжать US2. |
| F1 | Inconsistency | LOW | tasks.md T007b | ID `T007b` вне строгого ряда T00N. | Оставить или переименовать в T026 / вставить как T008 со сдвигом — на исполнение не влияет. |
| C1 | Coverage | — | FR-008 | Non-goal (нет stroke order) — отдельная задача не нужна. | — |

**Resolved since prior analyze (не открыты):** бывший I1 (`Float3DJsonConverter` / T007b); бывший I3 (research: канон только `float[,,]?`).

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 vectorize-request | Yes | T015 | Форма API — I2 |
| FR-002 aligned-crop | Yes | T011 | |
| FR-003 padding-config | Yes | T002, T003, T011 | |
| FR-004 word-404 | Yes | T015, T019 | |
| FR-005 file-error-no-write | Yes | T016, T019 | I4 |
| FR-006 bezier-fit | Yes | T012 | |
| FR-007 tolerance-config | Yes | T002, T003, T012 | |
| FR-008 no-stroke-order | N/A | — | C1 |
| FR-009 zero-strokes | Yes | T012, T017 | |
| FR-010 store-on-word | Yes | T005, T009 | |
| FR-011 real[] N×4×2 | Yes | T005, T006, T007, T007b, T009 | JSON закрыт T007b |
| FR-012 nullable | Yes | T005, T006 | |
| FR-013 liquibase | Yes | T005 | |
| FR-014 no-partial / replace | Yes | T009, T013, T018, T020, T021 | |
| FR-015 config-params | Yes | T002, T003, T010, T013 | |
| FR-016 project-patterns | Yes | T009, T013–T015 | |
| SC-001 90% readable | Partial | T023 | U1 — KPI без процедуры |
| SC-002 negatives | Yes | T016–T019, T023 | |
| SC-003 single-repr | Yes | T020–T022 | |
| SC-004 operator-UX | Yes | T015 | |
| SC-005 null-then-read | Yes | T005, T007, T007b, T025 | |

### Constitution Alignment Issues

Нет. I–V соблюдены (Liquibase, тонкий контроллер, plain-text ошибки, без ORM/отдельной таблицы).

### Unmapped Tasks

Нет сирот: T001/T004 — setup; T007b — FR-011/SC-005; T008 — US1; T014 — DI; T022–T025 — US2/polish.

### Metrics

| Metric | Value |
|--------|-------|
| Total Requirements (FR) | 16 |
| Total Tasks | 26 (T001–T025 + T007b) |
| FR coverage (≥1 task) | 15/16 + FR-008 non-goal ≈ **100%** |
| Ambiguity Count | 1 open (A1; perf «единицы секунд» в plan — вне FR) |
| Duplication Count | 2 (D1, D2) |
| Critical Issues | **0** |
| High Issues | **0** |

---

### Next Actions

CRITICAL/HIGH нет — можно `/speckit-implement`.

По желанию до кода (не блокирует):
1. Уточнить FR-001 под `Scans/{id}/words/{wordId}` (I2).
2. Порог вырожденной рамки (A1).
3. Статус SC-001 (U1).
4. Синхронизировать дерево в `plan.md` с `Serialization/` (U2).

---

Would you like me to suggest concrete remediation edits for the top issues (I2, A1, U1)? (Правки сам не применяю, пока не попросите.)

---

**User**

Предложи правки

---

**Cursor**

Ниже конкретные правки по открытым пунктам анализа (I2, A1, U1 + связанные I4/U2/U3). Только предложения — файлы не трогаю, пока не скажете применить.

---

### I2 — FR-001 и маршрут scan+word

**Файл:** `specs/001-word-stroke-vector/spec.md`

**Было:**
```markdown
- **FR-001**: Система MUST принимать запрос на векторизацию существующего слова по его идентификатору (Id).
```

**Стало:**
```markdown
- **FR-001**: Система MUST принимать запрос на векторизацию существующего слова в контексте скана: идентификатор скана и идентификатор слова в маршруте (как у прочих операций со словами). Слово MUST принадлежать указанному скану.
```

**Assumptions** — заменить первый пункт:
```markdown
- Фича на данном этапе — серверный функционал. Endpoint: `POST /api/Scans/{id}/words/{wordId}/vectorize` (оба id обязательны; `wordId` без совпадения со сканом → 404). Отдельный UI не входит в объём; контракт — plain-text ошибки, маршруты сканов/слов.
```

---

### I4 — нет файла vs повреждён

**Файл:** `spec.md` → Assumptions, после пункта про карту ошибок (или уточнить FR-005):

**Дополнить Assumptions:**
```markdown
- Отсутствие файла скана на диске → 404 («Не найден файл»), по аналогии с выдачей изображения. Повреждённое/нечитаемое содержимое изображения → 400 с русским текстом причины. В обоих случаях `curve_points` не обновляется.
```

Опционально смягчить FR-005 (без смены смысла):
```markdown
- **FR-005**: Если исходный файл скана недоступен или повреждён, система MUST вернуть ошибку по карте ошибок проекта (см. Assumptions: 404 / 400) и MUST NOT сохранять векторное представление для этого слова.
```

---

### A1 — порог вырожденной рамки

**Файл:** `specs/001-word-stroke-vector/research.md` — новый короткий подпункт в §2 (после шага вырезки) или отдельный mini-decision:

```markdown
## 2a. Критерий вырожденной рамки

**Decision**: Рамка считается вырожденной, если площадь четырёхугольника (абсолютное значение формулы шнурка по X1..Y4) < `1.0` квадратных пикселя **или** длина любой стороны < `1.0` px. Тогда `ArgumentException` до записи в БД.

**Rationale**: Порог в 1 px отсекает нулевую/почти нулевую геометрию без ложных срабатываний на мелких, но валидных словах OCR; не выносится в appsettings (не параметр качества аппроксимации).
```

**Файл:** `spec.md` Edge Cases — заменить формулировку:
```markdown
- Слово существует, но координаты рамки вырождены (площадь < 1 px² или сторона < 1 px — см. research): система возвращает ошибку и не сохраняет вектор.
```

**Файл:** `tasks.md` T011 — в конец описания добавить:
```text
; treat quad as degenerate when polygon area < 1.0 px² or any edge length < 1.0 px (see research.md §2a)
```

---

### U1 — SC-001 без процедуры

**Вариант A (рекомендую):** понизить до ориентира, не gate.

**Файл:** `spec.md` SC-001:
```markdown
- **SC-001**: *(ориентир качества, не gate реализации)* На рукописных словах с читаемыми штрихами успешная векторизация в типичном случае сохраняет непустой набор кривых. Количественная проверка на фиксированном корпусе — вне обязательного объёма этой фичи; приёмка MVP — сценарии quickstart.
```

**Вариант B:** оставить метрику и добавить в `quickstart.md`:
```markdown
### 7. Ориентир SC-001 (опционально)
На 10 словах с читаемыми штрихами с ≥2 тестовых сканов: ≥9/10 успешных `POST …/vectorize` с непустым `curvePoints`.
```
И в `tasks.md` Polish: `- [ ] T026 Optionally run quickstart §7 (SC-001 smoke sample)`.

---

### U2 — дерево в plan

**Файл:** `specs/001-word-stroke-vector/plan.md` — в Source Code tree после `Models/` или рядом с `Program.cs`:

```text
├── Serialization/                   # NEW
│   └── Float3DJsonConverter.cs      # JSON [[[x,y],...]] ↔ float[,,]
```

---

### U3 — OCR replace

**Файл:** `tasks.md` → Notes:
```markdown
- Повторный OCR (`ReplaceWordsFromOcrAsync`) не менять: старые слова (и их `curve_points`) удаляются вместе с заменой набора слов
```

---

### Порядок применения

1. I2 + I4 в `spec.md`  
2. A1 в `research.md` + edge в `spec` + хвост T011  
3. U1 — вариант A **или** B  
4. U2 в `plan.md`, U3 в Notes `tasks.md`

Напишите, например: «примени все» / «примени I2 A1 U1A U2 U3» — внесу правки в файлы.

---

**User**

Примени I2, I4, U2.
Убери проверку "после отступа и обрезки размер результирующего фрагмента 
< MinFragmentSidePx" в её текущей форме — она ложно отклоняет валидные слова, 
которые просто стоят близко к краю скана (в таком случае отступ должен 
просто клипаться по границе изображения без ошибки, а не приводить к отказу).

Вместо неё добавь проверку ДО применения отступа: пересекается ли исходная 
рамка слова (X1..Y4, без padding) с прямоугольником изображения [0..width, 
0..height] вообще. Если пересечение пустое или почти пустое (площадь 
пересечения < 1 px²) — это не "слово у края", а признак несоответствия данных 
текущему файлу скана (например, скан на диске заменён другим файлом другого 
размера) — ArgumentException с текстом, отличным от "вырожденная рамка" 
(например "рамка слова не пересекается с изображением скана").

Если пересечение непустое — отступ применяется и клипается по границам 
изображения как обычно, без дополнительной проверки итогового размера; 
уменьшение отступа с одной стороны у края скана — нормальное поведение, 
не ошибка.

Обнови в research.md критерий вырожденности так, чтобы он состоял из:
1) PRE-check на саму рамку X1..Y4 (площадь/стороны < порога — то, что уже есть),
2) отдельная проверка пересечения рамки с границами изображения (новая, 
   заменяет прежний "post-crop size check"), 
без проверки итогового размера фрагмента после клипа.

---

**Cursor**

Применяю I2, I4, U2 и обновляю критерии валидации рамки в `research.md`.

Вношу правки в `spec.md`, `plan.md`, `research.md` и согласую связанные формулировки в `tasks.md`.

Проверяю, что edge cases OCR не потерялись, и заменяю `&lt;` на обычный `<`.

Сделано.

### I2 / I4 — `spec.md`
- **FR-001 / FR-004**: маршрут `Scans/{id}/words/{wordId}`, принадлежность скану  
- **Assumptions**: явный endpoint; 404 нет файла / 400 повреждённый файл  
- **FR-005**: ссылка на Assumptions  

### U2 — `plan.md`
- Добавлен `Serialization/Float3DJsonConverter.cs`  

### Рамка / отступ — `research.md` §2 + **§2a**
1. Вырожденность X1..Y4 (площадь/сторона &lt; 1 px)  
2. Пересечение с изображением **до** padding (площадь &lt; 1 px²) — отдельное сообщение  
3. Post-crop / `MinFragmentSidePx` — отвергнуты  

Согласованы `spec` edge cases, `tasks` T011/T017, `data-model`, `contracts`, карта ошибок в plan.

---

**User**

/speckit-analyze 

---

**Cursor**

Повторный анализ после правок I2/I4/U2 и §2a.

## Specification Analysis Report

После правок I2/I4/U2 и §2a ядро согласовано. CRITICAL/HIGH нет — артефакты готовы к `/speckit-implement`.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| U1 | Underspecification | MEDIUM | spec.md SC-001 | 90% на «тестовом наборе» без набора/процедуры в tasks/quickstart. | Понизить до ориентира **или** добавить опциональный § в quickstart. |
| U4 | Underspecification | LOW | research.md §2a п.2 | Задан порог площади пересечения, не алгоритм (AABB ∩ повёрнутый quad). | При implement: clip polygon / Sutherland–Hodgman; в research не обязательно. |
| D1 | Duplication | LOW | spec FR-003 ↔ FR-015 | Оба про конфигурируемые параметры. | Опционально слить. |
| D2 | Duplication | LOW | tasks T009 / T018 / T020–T021 | US2/US3 частично verify уже заданной семантики. | Допустимо оставить. |
| F1 | Inconsistency | LOW | tasks.md T007b | ID вне строгого ряда T00N. | Косметика. |
| T1 | Terminology | LOW | quickstart.md §5 title | Заголовок «пустой фрагмент» устарел относительно §2a. | Переименовать в «нет штрихов». |
| C1 | Coverage | — | FR-008 | Non-goal — задача не нужна. | — |

**Closed since prior runs:** I1 (converter/T007b), I2 (FR-001+Assumptions), I3 (`float[,,]?`), I4 (404/400 файл), A1 (порог 1 px), U2 (`Serialization/` в plan), post-crop/`MinFragmentSidePx` отвергнуты и согласованы в spec/tasks/research.

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 scan+word route | Yes | T015 | Согласовано с contract |
| FR-002 aligned-crop | Yes | T011 | §2a в T011 |
| FR-003 padding-config | Yes | T002, T003, T011 | |
| FR-004 word-404 | Yes | T015, T019 | |
| FR-005 file-error | Yes | T016, T019 | Assumptions 404/400 |
| FR-006 bezier | Yes | T012 | |
| FR-007 tolerance | Yes | T002, T003, T012 | |
| FR-008 no-stroke-order | N/A | — | C1 |
| FR-009 zero-strokes | Yes | T012, T017 | |
| FR-010 store-on-word | Yes | T005, T009 | |
| FR-011 N×4×2 + JSON | Yes | T005–T007, T007b, T009 | |
| FR-012 nullable | Yes | T005, T006 | |
| FR-013 liquibase | Yes | T005 | |
| FR-014 no-partial/replace | Yes | T009, T013, T018, T020, T021 | |
| FR-015 config | Yes | T002, T003, T010, T013 | |
| FR-016 patterns | Yes | T009, T013–T015 | |
| SC-001 90% | Partial | T023 | U1 |
| SC-002 negatives | Yes | T016–T019, T023 | |
| SC-003 single-repr | Yes | T020–T022 | |
| SC-004 operator UX | Yes | T015 | |
| SC-005 null-then-read | Yes | T005, T007, T007b, T025 | |

### Constitution Alignment Issues

Нет.

### Unmapped Tasks

Нет сирот (setup/polish учтены).

### Metrics

| Metric | Value |
|--------|-------|
| Total Requirements (FR) | 16 |
| Total Tasks | 26 (T001–T025 + T007b) |
| FR coverage | ~100% (FR-008 non-goal) |
| Ambiguity Count | 0 blocking (U4 — алгоритм на implement) |
| Duplication Count | 2 (D1, D2) |
| Critical Issues | **0** |
| High Issues | **0** |

---

### Next Actions

Можно `/speckit-implement`.

По желанию до/во время кода: U1 (статус SC-001), T1 (заголовок quickstart §5). Остальное — косметика.

Would you like me to suggest concrete remediation edits for the top issues (U1, T1)?

