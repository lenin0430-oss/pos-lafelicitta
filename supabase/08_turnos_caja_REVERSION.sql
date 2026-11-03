-- Reversión de 08_turnos_caja.sql. Conserva los datos en el esquema respaldo_turnos antes de quitar nada.
begin;
create schema if not exists respaldo_turnos;
create table if not exists respaldo_turnos.cobros_turno as select * from public.cobros_turno;
create table if not exists respaldo_turnos.movimientos_caja as select * from public.movimientos_caja;
create table if not exists respaldo_turnos.cierres_turno as select * from public.cierres_turno;
create table if not exists respaldo_turnos.cierres_turno_medios as select * from public.cierres_turno_medios;
create table if not exists respaldo_turnos.turno_eventos as select * from public.turno_eventos;
drop trigger if exists ventas_cobro_a_turno on public.ventas;
drop trigger if exists gastos_a_turno on public.gastos;
drop trigger if exists propinas_a_turno on public.propinas;
drop function if exists public.turno_cerrar(uuid,jsonb,text,uuid,text), public.cobro_conciliar(uuid,text,text),
  public.movimiento_registrar(uuid,integer,text,text,text), public.turno_resumen(uuid), public.turno_abrir(uuid,integer,text),
  public.trg_cobro_a_turno(), public.trg_gasto_propina_a_turno(), public._turno_abierto(uuid), public._partes_cobro(text,integer);
drop table if exists public.cierres_turno_medios, public.cierres_turno, public.turno_eventos, public.movimientos_caja, public.cobros_turno;
drop function if exists public.turno_solo_agregar();
alter table public.ventas drop column if exists turno_id;
alter table public.pagos_point drop column if exists medio_reportado;
drop index if exists public.aperturas_caja_un_turno_abierto_v2;
-- aperturas_caja.modelo / fecha_apertura / cerrada_por se conservan (inocuas); no se borran datos de turnos v2.
commit;
