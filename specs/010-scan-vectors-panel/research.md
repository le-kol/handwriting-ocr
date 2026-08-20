# Research: Панель просмотра всех векторизованных слов скана

**Feature**: `010-scan-vectors-panel`  
**Date**: 2026-08-20

## 1. Зеркальная раскладка слотов (clarify Q1)

**Decision**: Панель векторов строится из того же `displayLines` (`Word[][]`), что текстовый блок: **одна строка UI на каждую строку раскладки**, **один слот на каждую позицию слова** в строке. В слоте невекторизованного слова — пустая область или нейтральный маркер без SVG-кривых; в слоте векторизованного — `WordCurveThumbnail`.

**Rationale**: Clarification B; FR-003/FR-003a; позиционное соответствие с текстом для сравнения «строка за строкой».

**Alternatives considered**:
- **Компактный список без слотов** — против clarify и SC-002.
- **Слоты только для векторизованных** — теряется горизонтальное выравнивание с текстом.

## 2. Пустое состояние без векторизованных слов (clarify Q2)

**Decision**: Панель **всегда видима** при наличии `displayLines`; если ни одно слово векторизовано — **все слоты** пустые/нейтральные по той же схеме зеркала (не отдельный «текстовый» empty state и не скрытие панели).

**Rationale**: Clarify Q2; FR-011; оператор видит структуру раскладки до первой векторизации.

**Alternatives considered**:
- **Скрыть панель** — отклонено в clarify.
- **Только сообщение «нет векторов»** — не зеркалирует раскладку.

## 3. Выбор слова и подсветка (clarify Q3–Q4)

**Decision**:
- Клик по **любому слоту** (миниатюра, пустой или нейтральный) → существующий `handleWordSelect(word)` / `selectWord`.
- Слот выбранного слова: класс `.selected` (или эквивалент) **как у `.word.selected`** — outline + accent background на контейнере слота.

**Rationale**: FR-006, FR-006a; единое состояние `draft`; панель как третий канал навигации.

**Alternatives considered**:
- **Клик только по миниатюре** — отклонено в clarify Q4.
- **Подсветка только при миниатюре** — отклонено в clarify Q3.

## 4. Компонент и переиспользование миниатюры

**Decision**: Новый компонент `ScanVectorsPanel.tsx` (и опционально `VectorWordSlot.tsx`) в `handwritingocr.client/src/`. Миниатюра — **только** существующий `WordCurveThumbnail` + класс `.word-curve-thumb` (9rem × 4.5rem). Нейтральный маркер — CSS-рамка без path (например `.vector-slot.empty` с dashed border, совпадающий с `.word.not-vectorized` визуально).

**Rationale**: Spec Assumptions; FR-004; избегаем дублирования SVG-логики из `curvePoints.ts`.

**Alternatives considered**:
- **Inline только в App.tsx** — ухудшает читаемость уже большого файла.
- **Отдельный SVG-компонент** — дублирование `WordCurveThumbnail`.

## 5. Раскладка workspace: вертикальное деление справа

**Decision**:
- `.workspace-side` → `display: flex; flex-direction: column; min-height: 0;` (в контексте workspace с фиксированной доступной высотой).
- Обёртка `.workspace-side-main` с `flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 0.5rem`.
- `.recognized-text-block` → `flex: 1 1 0; min-height: 12rem; overflow: auto;` (локальная прокрутка).
- `.scan-vectors-panel` → `flex: 1 1 0; min-height: 12rem; overflow: auto;` с заголовком секции.
- Пропорция **50/50** доступной высоты правой колонки (равные flex-grow); при нехватке высоты — локальный scroll внутри секций, не прокрутка всей страницы для поиска второй секции.

**Rationale**: FR-008, SC-004; Assumptions про локальную прокрутку; deferred в clarify — разумный brownfield default.

**Alternatives considered**:
- **Фиксированная высота панели в px** — хуже на разных viewport.
- **Только текст растёт** — панель векторов может оказаться слишком маленькой.

## 6. Адаптивность (узкий экран)

**Decision**: `@media (max-width: 900px)` (или `768px`): `.workspace { flex-direction: column; }` — порядок: `.scan`, затем `.workspace-side` (текст, затем панель векторов внутри column flex). Существующий горизонтальный flex scan | side на десктопе.

**Rationale**: FR-010; порядок «скан → текст → векторы».

**Alternatives considered**:
- **Отдельный mobile-only компонент** — избыточно для одного breakpoint.

## 7. Синхронизация после векторизации / DnD

**Decision**: Панель **не** держит собственный кэш слов; props: `lines` (= `displayLines`), `selectedWordId` (= `draft?.id`), `onSelectWord`. Обновление после vectorize/batch/delete — **автоматически** через существующие `setWords` / `setLayoutLines` / `applyWordUpdateInLayout` без дополнительного fetch.

**Rationale**: FR-012, FR-014; SC-005; минимальный diff.

**Alternatives considered**:
- **Отдельный state для панели** — риск рассинхрона с текстом.

## 8. Скан без слов / повреждённые curvePoints

**Decision**:
- `displayLines` пустой или null → панель с минимальным empty (без строк слотов), как edge case в spec.
- `isWordVectorized(word)` true но `WordCurveThumbnail` возвращает null → слот остаётся нейтральным/пустым, UI не падает.

**Rationale**: Edge cases в spec; `filterValidCurves` уже в `WordCurveThumbnail`.

## 9. Backend / API

**Decision**: **Без изменений** сервера, Liquibase, формата Word. Данные — уже в `GET /api/Scans/{id}/words`.

**Rationale**: Spec out of scope; конституция I, V.

## 10. Line gaps в тексте

**Decision**: Панель векторов **не** рендерит `line-gap-drop` между строками — только строки слов из `displayLines`, без DnD-зазоров. Вертикальный ритм — отступ между строками слотов (`margin` на row), не копирование gap-зон текста.

**Rationale**: Gap-зоны — UI для перетаскивания между строк, не позиции слов; зеркалирование «строк и позиций слов» (FR-003).
