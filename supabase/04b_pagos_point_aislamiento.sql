-- MesaPOS · 04b — aislamiento entre negocios en pagos_point (defensa en profundidad). PROPUESTA, NO APLICADA. Requiere 04.
-- Un negocio solo puede crear (o mover) un cobro Point sobre una venta que le pertenece. La API ya filtra por empresa_id;
-- esto lo hace cumplir también la base, aunque alguien escriba con la llave de servicio por error.
-- No toca filas existentes (solo se evalúa en INSERT y al cambiar venta_id/restaurante_id). Reversión: 04b_pagos_point_aislamiento_REVERSION.sql
begin;
create or replace function pagos_point_valida_venta() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from ventas v where v.id::text = new.venta_id and v.empresa_id::text = new.restaurante_id::text) then
    raise exception 'La venta % no pertenece al negocio %', new.venta_id, new.restaurante_id using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_pagos_point_valida_venta on pagos_point;
create trigger trg_pagos_point_valida_venta before insert or update of venta_id, restaurante_id on pagos_point
  for each row execute function pagos_point_valida_venta();
commit;
