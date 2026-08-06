--liquibase formatted sql

--changeset Nikolay:1
create table scans (
    id serial primary key,
    path text not null
)
--rollback DROP TABLE scans;

--changeset Nikolay:2
create table words (
    id serial primary key,
    scan_id int not null references scans(id) on delete cascade,
    word text not null,
    x1 real not null,
    y1 real not null,
    x2 real not null,
    y2 real not null,
    x3 real not null,
    y3 real not null,
    x4 real not null,
    y4 real not null
)
--rollback DROP TABLE words;


--changeset Nikolay:3
alter table words add column order_index int not null;
-- deferrable initially deferred: при вставке и перемещении слова порядковые номера соседей
-- сдвигаются одним UPDATE, из-за чего внутри транзакции возникают временные дубликаты.
-- Отложенная проверка выполняется один раз при commit, когда нумерация снова корректна
alter table words add constraint unique_order unique (scan_id, order_index) deferrable initially deferred;
--rollback alter table words drop column order_index;

--changeset Nikolay:4
-- Номер строки OCR в пределах скана; default 0 для уже существующих записей
alter table words add column line_index int not null default 0;
--rollback alter table words drop column line_index;

