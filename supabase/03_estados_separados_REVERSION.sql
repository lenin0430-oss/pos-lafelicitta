-- Reversión de 03_estados_separados.sql. Antes: volver a desplegar el código anterior (8142dc7), que usa estado='listo' como "cobrada".
-- PIERDE información nueva (ver docs/PLAN_PUBLICACION.md): pagado_at, la distinción cortesía/sin identificar/pagado,
-- y el estado de cocina de las ventas nuevas cobradas (quedan 'listo', que el código antiguo interpreta como cobrada).
-- Conserva todas las ventas, importes, métodos y fechas.
begin;
-- 1) Filas convertidas por la migración: se restaura el estado de cocina original.
update ventas set estado = estado_legacy where estado_legacy is not null;
-- 2) Ventas nuevas cobradas (o cortesía) que el código antiguo no vería como cobradas: pasan a 'listo'.
update ventas set estado = 'listo'
where estado_legacy is null and estado_pago in ('pagado','cortesia') and estado in ('pendiente','en_proceso','entregado');
drop trigger if exists trg_ventas_compat_estado_pago on ventas;
drop function if exists ventas_compat_estado_pago();
drop index if exists idx_ventas_empresa_pago_fecha;
drop index if exists idx_ventas_empresa_pagado_at;
alter table ventas drop constraint if exists ventas_estado_pago_chk;
alter table ventas drop column if exists estado_legacy;
alter table ventas drop column if exists pagado_at;
alter table ventas drop column if exists estado_pago;
commit;
