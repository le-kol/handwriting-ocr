# Speckit project code analysis
_Exported on 8/10/2026 at 13:47:18 GMT+7 from Cursor (3.15.6)_

---

**User**

/speckit-constitution 
Это уже существующий (brownfield) проект. Проанализируй кодовую базу 
максимально подробно (сервисы, контроллеры, модели данных и др.), не пропускай 
детали. Сформулируй принципы, отражающие реальный стек (ASP.NET + React + PostgreSQL/Liquibase + Yandex OCR), 
архитектурные конвенции и стиль обработки ошибок, уже используемые в проекте.

---

**Cursor**

Сначала проверю хуки и текущую конституцию, затем подробно разберу кодовую базу, чтобы вывести принципы из реального стека и конвенций.

Хуков нет. Читаю сервисы, контроллеры, модели и конфигурацию проекта.

Формирую конституцию по фактическим конвенциям стека и кода.

Конституция проекта зафиксирована в `.specify/memory/constitution.md` как **v1.0.0** (первая версия с шаблона-плейсхолдеров → MAJOR-уровень заполнения, семантически это начальная ратификация).

### Версия и обоснование
- **1.0.0** — первая конкретная конституция brownfield-проекта (не PATCH к уже принятым принципам).
- **Ratified / Last Amended**: `2026-08-10`.

### Принципы (из реального кода)
1. **Верность стеку** — ASP.NET Core 8 + React/Vite SPA, PostgreSQL, Liquibase, Yandex OCR; без ORM и смены провайдера OCR без поправки.
2. **Тонкие контроллеры / сервисы + Npgsql** — SQL в `*DbService`, `AddHttpClient` для OCR, транзакции на мутациях слов.
3. **Карта ошибок** — plain text; `ArgumentException→400`, `InvalidOperationException→503`, `HttpRequestException→502`, not found→404.
4. **Домен скана** — плотные `order_index`/`line_index`, deferrable unique, полная замена слов при OCR, раздельное сохранение контента и раскладки.
5. **Схема только Liquibase** — changeset'ы + rollback; секреты в `appsettings`.

Дополнительно: секции **Technology Stack & Constraints** и **Client–API Contract & UX State** (локальный layout, `id===0`, SVG из natural size).

### TODO
Нет отложенных плейсхолдеров.

### Suggested commit message
```
docs: adopt constitution v1.0.0 from brownfield stack analysis
```

