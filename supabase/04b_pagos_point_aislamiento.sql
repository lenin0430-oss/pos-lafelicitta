-- MesaPOS · 04b — aislamiento entre negocios en pagos_point (defensa en profundidad). PROPUESTA, NO APLICADA. Requiere 04.
-- Regla: un cobro Point solo puede existir sobre una venta que pertenece al MISMO negocio (ventas.empresa_id = pagos_point.restaurante_id).
-- La API ya filtra por empresa_id; esto lo hace cumplir también la base, aunque alguien escriba con la llave de servicio por error.
--
-- Qué hace:
--  1) pagos_point: al INSERTAR o al cambiar venta_id/restaurante_id, exige que la venta exista, tenga empresa y sea de ese negocio.
--     Nulos => se rechaza. Bloquea la fila de la venta (FOR SHARE) hasta terminar la transacción: nadie puede cambiarle la empresa en paralelo.
--  2) ventas: no deja cambiar empresa_id/id si eso dejaría incompatible algún cobro existente (sí permite corregirla para que coincida).
-- No toca filas existentes y NO corrige automáticamente cobros históricos incompatibles (se listan con verificar_04b.sql).
-- Un UPDATE de otras columnas (estado, monto, mp_order_id…) en filas históricas sigue funcionando: el trigger no se evalúa.
-- Ver docs/DECISION_04B_TRIGGER_VS_FK.md. Reversión: 04b_pagos_point_aislamiento_REVERSION.sql. Una sola transacción.
begin;

create or replace function pagos_point_valida_venta() returns trigger language plpgsql as $$
begin
  if new.restaurante_id is null or new.venta_id is null then
    raise exception 'El cobro debe indicar negocio y venta (restaurante_id=%, venta_id=%)', new.restaurante_id, new.venta_id using errcode = '23514';
  end if;
  perform 1 from ventas v
   where v.id::text = new.venta_id and v.empresa_id is not null and v.empresa_id::text = new.restaurante_id::text
   for share;                                   -- bloquea la venta: su empresa no puede cambiar hasta que esta transacción termine
  if not found then
    raise exception 'La venta % no pertenece al negocio %', new.venta_id, new.restaurante_id using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_pagos_point_valida_venta on pagos_point;
create trigger trg_pagos_point_valida_venta before insert or update of venta_id, restaurante_id on pagos_point
  for each row execute function pagos_point_valida_venta();

create or replace function ventas_protege_pagos_point() returns trigger language plpgsql as $$
begin
  if exists (select 1 from pagos_point p
              where p.venta_id = old.id::text
                and (p.restaurante_id is distinct from new.empresa_id::text or p.venta_id <> new.id::text)) then
    raise exception 'La venta % tiene cobros Point de otro negocio o con otro id; no se puede cambiar su empresa/id así', old.id using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_ventas_protege_pagos_point on ventas;
create trigger trg_ventas_protege_pagos_point before update of empresa_id, id on ventas
  for each row execute function ventas_protege_pagos_point();

commit;
