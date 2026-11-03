-- Reversión de 08_turnos_caja.sql. Conserva los datos en el esquema respaldo_turnos antes de quitar nada.
begin;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'respaldo_turnos') then
    raise exception 'respaldo_turnos ya existe: renombrarlo (alter schema respaldo_turnos rename to respaldo_turnos_AAAAMMDD) antes de revertir; no se sobrescribe un respaldo.';
  end if;
end $$;
create schema if not exists respaldo_turnos;
create table if not exists respaldo_turnos.cobros_turno as select * from public.cobros_turno;
create table if not exists respaldo_turnos.movimientos_caja as select * from public.movimientos_caja;
create table if not exists respaldo_turnos.cierres_turno as select * from public.cierres_turno;
create table if not exists respaldo_turnos.cierres_turno_medios as select * from public.cierres_turno_medios;
create table if not exists respaldo_turnos.turno_eventos as select * from public.turno_eventos;
drop trigger if exists ventas_cobro_a_turno on public.ventas;
drop trigger if exists ventas_serializa_cierre on public.ventas;
drop trigger if exists ventas_eliminada_anula_cobros on public.ventas;
drop trigger if exists pagos_point_turno_abierto on public.pagos_point;
drop trigger if exists gastos_a_turno on public.gastos;
drop trigger if exists propinas_a_turno on public.propinas;
drop trigger if exists aperturas_v2_guard on public.aperturas_caja;
drop trigger if exists cierres_caja_v2_guard on public.cierres_caja;
drop function if exists public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb), public.cobro_conciliar(uuid,text,text),
  public.movimiento_registrar(uuid,integer,text,text,text), public.turno_resumen(uuid), public.turno_abrir(uuid,integer,text),
  public.trg_cobro_a_turno(), public.turno_bloqueos(uuid), public.trg_venta_serializa_cierre(), public.trg_venta_eliminada(), public.trg_pagos_point_requiere_turno(), public.trg_turno_solo_por_funcion(), public.trg_gasto_propina_a_turno(), public._turno_abierto(uuid), public._partes_cobro(text,integer);
drop table if exists public.cierres_turno_medios, public.cierres_turno, public.turno_eventos, public.movimientos_caja, public.cobros_turno;
drop function if exists public.turno_solo_agregar();
alter table public.ventas drop column if exists turno_id;
alter table public.pagos_point drop column if exists medio_reportado;
drop index if exists public.aperturas_caja_un_turno_abierto_v2;
-- aperturas_caja.modelo / fecha_apertura / cerrada_por se conservan (inocuas); no se borran datos de turnos v2.
commit;
