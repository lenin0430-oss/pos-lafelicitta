-- Reversión de 13: pierde el registro de devoluciones (los retiros en movimientos_caja se conservan) y la columna gastos.pagado_por.
begin;
drop function if exists public.reembolso_pagar(uuid, text, text);
drop function if exists public.reembolsos_pendientes(uuid);
drop table if exists public.reembolsos_trabajador;
alter table public.gastos drop column if exists pagado_por;
commit;
