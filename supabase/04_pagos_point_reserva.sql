-- MesaPOS · Migración 04 — reserva atómica de cobros Point (sin duplicados ni siquiera con solicitudes simultáneas).
-- REVISAR ANTES DE APLICAR. No aplicada. Aditiva. Aplicar ANTES de desplegar el código que la usa.
-- Reversión: 04_pagos_point_reserva_REVERSION.sql
begin;

-- Clave de idempotencia estable por intento de cobro (se envía a Mercado Pago en X-Idempotency-Key).
alter table pagos_point add column if not exists clave_idempotencia uuid not null default gen_random_uuid();
alter table pagos_point add column if not exists referencia_externa text;   -- external_reference enviado a MP
alter table pagos_point add column if not exists detalle text;              -- motivo si el intento se cierra en 'failed'

-- Solo UN intento activo por venta y negocio. La base lo garantiza aunque lleguen dos solicitudes a la vez.
-- 'reservado' = fila creada antes de llamar a Mercado Pago (aún sin mp_order_id).
create unique index if not exists pagos_point_un_intento_activo
  on pagos_point (restaurante_id, venta_id)
  where estado in ('reservado','created','at_terminal');

commit;
