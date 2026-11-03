-- MesaPOS · RESPALDO previo a 08 (copia de las tablas de caja en el esquema respaldo_pre08 de la MISMA base).
-- NO es un respaldo externo: además exportar CSV desde el panel (Table Editor → Export) y guardarlos fuera de Supabase.
-- Escribe solo en un esquema nuevo; no toca public. Una transacción; si el esquema ya existe, se detiene sin cambiar nada.
begin;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'respaldo_pre08') then
    raise exception 'respaldo_pre08 ya existe: no se sobrescribe. Renombrarlo o borrarlo con aprobación.';
  end if;
end $$;
create schema respaldo_pre08;
revoke all on schema respaldo_pre08 from public, anon, authenticated;
create table respaldo_pre08.ventas         as select * from public.ventas;
create table respaldo_pre08.aperturas_caja as select * from public.aperturas_caja;
create table respaldo_pre08.cierres_caja   as select * from public.cierres_caja;
create table respaldo_pre08.gastos         as select * from public.gastos;
create table respaldo_pre08.propinas       as select * from public.propinas;
create table respaldo_pre08.pagos_point    as select * from public.pagos_point;
revoke all on all tables in schema respaldo_pre08 from public, anon, authenticated;
-- Conteos para anotar y comparar después:
select 'ventas' t, (select count(*) from public.ventas) orig, (select count(*) from respaldo_pre08.ventas) copia, (select coalesce(sum(total),0) from respaldo_pre08.ventas) suma_total
union all select 'aperturas_caja', (select count(*) from public.aperturas_caja), (select count(*) from respaldo_pre08.aperturas_caja), 0
union all select 'cierres_caja', (select count(*) from public.cierres_caja), (select count(*) from respaldo_pre08.cierres_caja), 0
union all select 'gastos', (select count(*) from public.gastos), (select count(*) from respaldo_pre08.gastos), (select coalesce(sum(monto),0) from respaldo_pre08.gastos)
union all select 'propinas', (select count(*) from public.propinas), (select count(*) from respaldo_pre08.propinas), (select coalesce(sum(monto),0) from respaldo_pre08.propinas)
union all select 'pagos_point', (select count(*) from public.pagos_point), (select count(*) from respaldo_pre08.pagos_point), 0;
commit;
