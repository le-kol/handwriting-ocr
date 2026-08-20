# Research: Параметры запуска векторизации слов

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20

Все пункты Technical Context закрыты; NEEDS CLARIFICATION не осталось.

## 1. Как передать параметры операции от клиента к серверу

**Decision**: Опциональное JSON-тело на существующих `POST`-endpoint'ах векторизации:

```json
{
  "paddingPx": 4,
  "approximationTolerance": 1.5
}
```

Оба поля опциональны. Отсутствие тела или поля → сервер подставляет значение из `WordVectorization` в конфигурации (поведение до фичи, FR-005).

**Rationale**: Обратная совместимость (старые клиенты без body); явный контракт; model binding ASP.NET Core; не засоряет query string; оба параметра логически связаны.

**Alternatives considered**:
- **Query-параметры** (`?paddingPx=4&approximationTolerance=1.5`) — проще для curl, но хуже для расширения и менее idiomatic для POST с side effects.
- **Отдельный endpoint «prepare vectorize»** — лишний round-trip; отвергнуто.
- **Только клиентская валидация без передачи на сервер** — нарушает spec (параметры должны влиять на вычисление); прямой вызов API обойдёт UI.

## 2. Как клиент получает значения по умолчанию для предзаполнения полей

**Decision**: Новый read-only endpoint:

```http
GET /api/Scans/vectorization-defaults
```

**200 OK** → JSON `{ "paddingPx": 4, "approximationTolerance": 1.5 }` из `IOptions<WordVectorizationOptions>`.  
**503** → plain text, если конфигурация отсутствует или невалидна (как сегодня при vectorize).

**Rationale**: FR-003 требует показывать действующие серверные defaults при открытии; клиент не имеет доступа к `appsettings.json`; один запрос на открытие скана достаточен для обоих наборов полей (single + batch используют одни и те же defaults как стартовые значения, но хранят независимое локальное состояние — FR-004, clarification Q1).

**Alternatives considered**:
- **Встроить defaults в `GET …/words`** — смешивает чтение слов с конфигом CV; отвергнуто.
- **Хардкод defaults на клиенте (4 / 1.5)** — расходится с сервером при смене конфига; нарушает FR-003/FR-005.

## 3. Где применять параметры в backend pipeline

**Decision**: Расширить сигнатуру внутреннего ядра:

```csharp
VectorizeWordCoreAsync(Word word, byte[] fileBytes, int scanId, float paddingPx, float approximationTolerance)
```

Публичные `VectorizeAsync` / `VectorizeBatchAsync` принимают опциональные override-параметры, разрешают effective values:

```text
effectivePadding = request.PaddingPx ?? _options.PaddingPx (после EnsureOptionsValid)
effectiveTolerance = request.ApproximationTolerance ?? _options.ApproximationTolerance
```

**Rationale**: Единая точка применения; batch и single используют один core; DRY после рефакторинга 003.

**Alternatives considered**:
- **Временно мутировать `_options`** — не thread-safe в scoped DI; отвергнуто.
- **Дублировать extract/fit в контроллере** — нарушает принцип II.

## 4. Валидация параметров (клиент + сервер)

**Decision**: Дублировать правила на клиенте (мгновенный отказ до fetch, FR-008) и на сервере (защита API):

| Поле | Правило |
|------|---------|
| `paddingPx` | число, ≥ 0 |
| `approximationTolerance` | число, > 0 |

При нескольких нарушениях — **одно** сообщение со всеми причинами (clarification Q2).  
Клиент: `vectorizeStatus` / локальный статус batch.  
Сервер: `400 Bad Request`, plain text RU.

Пустое поле, нечисловой ввод, отрицательные/нулевые значения — отклонение без HTTP-запроса на клиенте.

**Rationale**: FR-006–FR-009; spec edge case для нечислового ввода; серверная валидация для Swagger/скриптов.

**Alternatives considered**:
- **Только серверная валидация** — оператор видит ошибку после round-trip; хуже UX для FR-008.
- **Первая ошибка only** — отвергнуто clarification Q2.

## 5. Поведение UI при недоступных defaults (FR-015)

**Decision**: При `GET …/vectorization-defaults` → не 200 (503 или сеть):

- Вместо полей + кнопки «Векторизовать» в `.editor-actions` — `<p>` с текстом ошибки.
- Вместо полей + кнопки «Векторизовать все слова» в `.layout-toolbar` — аналогичное сообщение.
- Наборы single/batch независимы: если defaults недоступны, оба блока в одинаковом error-состоянии (один источник defaults).

**Rationale**: Clarification Q3; совпадает с сегодняшним классом ошибки конфигурации.

## 6. Независимые наборы полей single vs batch

**Decision**: Два независимых React state в `App.tsx`:

- `singleRunParams` — `{ paddingPx: string, approximationTolerance: string }` (controlled inputs)
- `batchRunParams` — отдельный объект того же shape

При смене `scanId` / открытии скана: оба сбрасываются к свежим defaults с `GET …/vectorization-defaults` (FR-012).  
Изменение single не трогает batch и наоборот (FR-004).

**Rationale**: Clarification Q1; минимальный diff без нового state-менеджера (конституция).

**Alternatives considered**:
- **Один shared state** — отвергнуто пользователем в clarify.
- **Отдельный компонент `VectorizeParamsFields`** — допустимо в tasks; не обязательно в research.

## 7. Обратная совместимость и FR-005

**Decision**: Если клиент отправляет body с теми же числами, что defaults сервера, результат MUST совпадать с pre-feature поведением (те же float в extract/fit). Тест: defaults 4/1.5, body `{ "paddingPx": 4, "approximationTolerance": 1.5 }` vs пустое body — идентичный `curvePoints`.

**Rationale**: SC-001; явное требование spec.

## 8. Изменения схемы и хранения

**Decision**: Без Liquibase changeset; без новых колонок; параметры запроса не персистятся (FR-010, FR-014).

**Rationale**: Spec и конституция V.

## 9. Тестирование

**Decision**: Ручная приёмка по [quickstart.md](./quickstart.md). Автотестов в репозитории нет — не создаём test-проект в scope plan.

**Rationale**: Brownfield; согласовано с 001/003/010.
