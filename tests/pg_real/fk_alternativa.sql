-- Experimento: clave foránea compuesta (venta_id, restaurante_id) -> ventas(id, empresa_id) como alternativa al trigger. SOLO PostgreSQL local.
\set ON_ERROR_STOP off
\echo '--- esquema como en producción (venta_id text, restaurante_id text; ventas.id uuid, empresa_id uuid)'
create table ventas (id uuid primary key default gen_random_uuid(), numero int, empresa_id uuid);
create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text not null, restaurante_id text, estado text default 'reservado', monto int default 1);
insert into ventas (id,numero,empresa_id) values ('11111111-1111-1111-1111-111111111111',1,'aaaaaaaa-0000-0000-0000-00000000000a'),('22222222-2222-2222-2222-222222222222',2,'bbbbbbbb-0000-0000-0000-00000000000b');
insert into pagos_point (venta_id,restaurante_id) values ('v1','A'),('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-00000000000b'),('legado',null);   -- históricos incompatibles
alter table ventas add constraint ventas_id_empresa_uq unique (id, empresa_id);
\echo '1) FK directa con los tipos actuales:'
alter table pagos_point add constraint fk_v foreign key (venta_id, restaurante_id) references ventas(id, empresa_id) not valid;
\echo '2) cambiar tipos a uuid con históricos no convertibles:'
alter table pagos_point alter column venta_id type uuid using venta_id::uuid;
\echo '   -> se descartan los históricos no convertibles para seguir el experimento (en producción habría que decidir qué hacer con ellos)'
delete from pagos_point where venta_id !~* '^[0-9a-f-]{36}$' or restaurante_id !~* '^[0-9a-f-]{36}$' or restaurante_id is null;
alter table pagos_point alter column venta_id type uuid using venta_id::uuid;
alter table pagos_point alter column restaurante_id type uuid using restaurante_id::uuid;
\echo '3) FK NOT VALID (MATCH SIMPLE por defecto): filas nuevas se validan, históricas no'
alter table pagos_point add constraint fk_v foreign key (venta_id, restaurante_id) references ventas(id, empresa_id) not valid;
insert into pagos_point (venta_id,restaurante_id) values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-00000000000a');
\echo '   ^ B/A cruzado debe fallar (23503)'
insert into pagos_point (venta_id,restaurante_id) values ('11111111-1111-1111-1111-111111111111',null);
\echo '   ^ restaurante_id NULL: con MATCH SIMPLE PASA (hueco) si la columna admite NULL'
select count(*) as filas_con_negocio_nulo from pagos_point where restaurante_id is null;
\echo '4) VALIDATE con un histórico incompatible:'
alter table pagos_point validate constraint fk_v;
\echo '5) cambio posterior de empresa de una venta que SÍ tiene un cobro válido (NO ACTION):'
insert into pagos_point (venta_id,restaurante_id) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a');
update ventas set empresa_id='bbbbbbbb-0000-0000-0000-00000000000b' where id='11111111-1111-1111-1111-111111111111';
\echo '6) MATCH FULL + NOT NULL cierra el hueco de nulos:'
delete from pagos_point where restaurante_id is null;
alter table pagos_point drop constraint fk_v;
alter table pagos_point alter column restaurante_id set not null;
alter table pagos_point add constraint fk_v foreign key (venta_id, restaurante_id) references ventas(id, empresa_id) match full not valid;
insert into pagos_point (venta_id,restaurante_id) values ('11111111-1111-1111-1111-111111111111',null);
\echo '7) un UPDATE de otra columna sobre un histórico incompatible con la FK NOT VALID (el webhook hace esto):'
update pagos_point set estado='processed' where venta_id='11111111-1111-1111-1111-111111111111' and restaurante_id='bbbbbbbb-0000-0000-0000-00000000000b';
select count(*) as filas_actualizadas from pagos_point where estado='processed';
