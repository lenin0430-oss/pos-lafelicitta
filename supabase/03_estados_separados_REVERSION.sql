-- Reversión de 03_estados_separados.sql. No toca ventas.estado ni ningún dato histórico.
-- Antes de revertir: volver a desplegar el código anterior (8142dc7), que usa estado='listo' como "cobrada".
-- Ventas cobradas con el código nuevo y aún en estado 'pendiente'/'en_proceso' se marcan 'listo' (incluye 'entregado') para que el
-- código antiguo las vea como cobradas (se pierde la distinción preparación/pago solo para ellas).
begin;
update ventas set estado = 'listo' where estado_pago = 'pagado' and estado in ('pendiente','en_proceso','entregado');
drop trigger if exists trg_ventas_compat_estado_pago on ventas;
drop function if exists ventas_compat_estado_pago();
drop index if exists idx_ventas_empresa_pago_fecha;
alter table ventas drop constraint if exists ventas_estado_pago_chk;
alter table ventas drop column if exists pagado_at;
alter table ventas drop column if exists estado_pago;
commit;
