-- MesaPOS · Migración 03 — separa "preparación/entrega" (ventas.estado) del "estado financiero" (ventas.estado_pago).
-- REVISAR ANTES DE APLICAR. No aplicada en ningún entorno remoto. Criterio y excepciones: docs/conversion-historica-estado-pago.md
-- Aditiva y compatible con el código actual (8142dc7): se puede aplicar ANTES de desplegar el código nuevo.
-- Orden: 1) respaldo  2) este archivo  3) supabase/verificar_03_04.sql  4) desplegar código  5) (más tarde) 03b
-- Reversión: 03_estados_separados_REVERSION.sql
-- Aplicar fuera de horario de servicio (ver docs/PLAN_PUBLICACION.md).
begin;

alter table ventas add column if not exists estado_pago   text not null default 'pendiente';
alter table ventas add column if not exists pagado_at     timestamptz;
alter table ventas add column if not exists estado_legacy text;   -- copia del estado de cocina previo a esta migración (para la reversión)

alter table ventas drop constraint if exists ventas_estado_pago_chk;
alter table ventas add constraint ventas_estado_pago_chk
  check (estado_pago in ('pendiente','pagado','cortesia','sin_identificar'));

-- ── Conversión del histórico ────────────────────────────────────────────────────────────────────
-- Regla: NUNCA se deduce "pagado" solo por un estado de cocina. El código anterior escribía metodo_pago
-- ('') al crear la comanda y solo lo rellenaba en el paso de cobro, junto con estado='listo'.
-- Por eso, para una venta en 'listo':
--   · método "Cortesía"      → 'cortesia'        (no es un cobro)
--   · método no vacío        → 'pagado'          (el método registrado evidencia el paso de cobro)
--   · método vacío           → 'sin_identificar' (no se inventa método ni se asume cobro; importes intactos)
-- Cualquier otro estado de cocina (pendiente, en_proceso, entregado…) → queda 'pendiente'.
-- pagado_at queda NULL en el histórico (hora real desconocida); los informes usan created_at como respaldo.
-- No se modifican metodo_pago, total, created_at ni items.
update ventas set estado_pago = case
    when btrim(coalesce(metodo_pago,'')) ~* '^cortes[ií]a$' then 'cortesia'
    when btrim(coalesce(metodo_pago,'')) <> ''              then 'pagado'
    else 'sin_identificar'
  end
where estado = 'listo' and estado_pago = 'pendiente';

-- Cocina: 'listo' antiguo significaba "cobrada y cerrada". Para que la pantalla de cocina no muestre miles de comandas
-- viejas (ya no se oculta por antigüedad), las 'listo' de más de 12 h pasan a 'entregado'; el estado anterior se guarda
-- en estado_legacy. Las 'listo' recientes se dejan tal cual: el personal las retira con "Entregado".
update ventas set estado_legacy = estado, estado = 'entregado'
where estado = 'listo' and created_at < now() - interval '12 hours' and estado_legacy is null;

create index if not exists idx_ventas_empresa_pago_fecha on ventas (empresa_id, estado_pago, created_at);
create index if not exists idx_ventas_empresa_pagado_at  on ventas (empresa_id, pagado_at) where pagado_at is not null;

-- Compatibilidad durante el despliegue: el código ANTIGUO cobra haciendo estado='listo' + metodo_pago (antes vacío).
-- Mientras corra, este disparador registra el cobro en estado_pago/pagado_at en ese caso exacto.
-- No toca ventas.estado (la comanda sigue visible hasta "Entregado"). Cocina marcando 'listo' no cambia
-- metodo_pago (vacío), así que NO marca pagado. El código nuevo escribe estado_pago explícitamente. Se retira con 03b.
create or replace function ventas_compat_estado_pago() returns trigger language plpgsql as $$
begin
  if new.estado = 'listo'
     and coalesce(btrim(new.metodo_pago), '') <> ''
     and new.estado_pago = 'pendiente'
     and (tg_op = 'INSERT' or old.estado is distinct from 'listo') then
    new.estado_pago := case when btrim(new.metodo_pago) ~* '^cortes[ií]a$' then 'cortesia' else 'pagado' end;
    new.pagado_at   := coalesce(new.pagado_at, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_ventas_compat_estado_pago on ventas;
create trigger trg_ventas_compat_estado_pago before insert or update on ventas
  for each row execute function ventas_compat_estado_pago();

commit;
