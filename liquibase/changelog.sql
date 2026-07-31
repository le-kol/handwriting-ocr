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


