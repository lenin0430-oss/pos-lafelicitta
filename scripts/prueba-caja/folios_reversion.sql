-- Reversión y re-aplicación de 09 sobre una base que ya pasó folios.sql (negocio B con 60 turnos y 60 cierres).
-- Uso: psql -f 09_correlativos_REVERSION.sql ; psql -f 09_correlativos.sql ; psql -f folios_reversion.sql  (antes: snapshot en z_snap, ver abajo)
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-4000-8000-00000000000a'''
\set B '''bbbbbbbb-0000-4000-8000-00000000000b'''
create temp table res(n text, ok boolean, det text);
create function pg_temp.chk(n text, cond boolean, det text default '') returns void language sql as $$ insert into res values (n, coalesce(cond,false), det) $$;
select pg_temp.chk('contadores restaurados: B sigue en 60 turnos y 60 cierres', (select ultimo from correlativos where empresa_id=:B::uuid and tipo='turno')=60 and (select ultimo from correlativos where empresa_id=:B::uuid and tipo='cierre')=60);
select pg_temp.chk('contadores restaurados: iguales a los de antes de revertir', (select md5(string_agg(empresa_id||tipo||ultimo,',' order by empresa_id,tipo)) from correlativos)=(select md5(string_agg(empresa_id||tipo||ultimo,',' order by empresa_id,tipo)) from z_snap_corr));
select pg_temp.chk('folios, números de turno y de cierre restaurados idénticos fila a fila', (select md5(string_agg(id::text||coalesce(folio::text,'')||coalesce(clave_idempotencia::text,''),',' order by id)) from ventas)=(select v from z_snap_h where k='v')
  and (select md5(string_agg(id::text||coalesce(numero_turno::text,'')||coalesce(clave_apertura::text,''),',' order by id)) from aperturas_caja)=(select v from z_snap_h where k='a')
  and (select md5(string_agg(id::text||coalesce(numero_cierre::text,''),',' order by id)) from cierres_turno)=(select v from z_snap_h where k='c'));
select pg_temp.chk('históricos intactos (mismo id y número)', (select md5(string_agg(id::text||':'||coalesce(numero::text,''),',' order by id)) from ventas)=(select v from z_snap_h where k='n'));
select (public.turno_abrir(:B::uuid, 1000, 'Cajera', gen_random_uuid())->>'numero_turno')::int t \gset
select pg_temp.chk('la siguiente apertura de B recibe 61 (no 1)', :t = 61);
insert into ventas(mesa,total,empresa_id) values ('m',1,:A::uuid) returning numero \gset
select pg_temp.chk('la siguiente comanda de A continúa sin repetir el máximo anterior', :numero = (select max(folio) from ventas where empresa_id=:A::uuid and folio is not null) and :numero > (select v::int from z_snap_h where k='maxa'));
select pg_temp.chk('el respaldo queda en respaldo_correlativos (no renombrarlo hasta confirmar la re-aplicación)', to_regclass('respaldo_correlativos.correlativos') is not null);
select n, case when ok then 'OK ' else 'FALLA' end, det from res order by ok, n;
