-- MesaPOS · 07c — Cobro manual, edición de comanda y reserva Point SERIALIZADOS por el bloqueo de la fila de la venta.
-- Problema que corrige (revisión de Codex a 8bbb98f): leer los cobros Point y después escribir la venta eran dos pasos; un cobro Point creado
-- entre ambos quedaba junto a un cobro manual. Ahora todo ocurre dentro de UNA transacción que bloquea la venta (FOR UPDATE):
--   · cobrar_venta_manual / editar_comanda_venta: bloquean la venta, comprueban "sin medio de pago" y "sin cobro Point en curso o aprobado", y escriben.
--   · trigger pagos_point_bloquea_venta (BEFORE INSERT en pagos_point): bloquea la MISMA venta y rechaza la reserva si ya tiene medio de pago.
--   Además compara pagos_point.monto con el total VIGENTE de la venta bajo ese bloqueo (si cambió → SQLSTATE P0409 'MONTO_NO_COINCIDE', el servidor responde 409 sin llamar al proveedor).
--   Si gana el cobro manual, la reserva Point espera y luego se rechaza; si gana la reserva, el cobro manual espera y luego responde 'point_en_curso'.
-- PROPUESTA: NO APLICADA. Solo agrega objetos (no modifica filas). Compatible con 04b (trigger con FOR SHARE): ambos coexisten sin deadlock.
-- Orden en la base: 07b → 07c → 07a → 07. Reversión: 07c_cobro_manual_atomico_REVERSION.sql
begin;

create or replace function public.pagos_point_bloquea_venta() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v record;
begin
  select id, total, metodo_pago into v from public.ventas where id::text = new.venta_id and empresa_id::text = new.restaurante_id::text for update;
  if not found then return new; end if;            -- inexistente/otro negocio: lo rechaza 04b (no se duplica la regla)
  if coalesce(v.metodo_pago, '') <> '' then
    raise exception 'VENTA_YA_COBRADA: la venta ya tiene medio de pago' using errcode = 'P0409';
  end if;
  -- El importe se valida BAJO el bloqueo de la venta: si la comanda se editó entre la lectura del servidor y esta reserva, se rechaza (409)
  -- antes de llamar al proveedor. Una lectura previa fuera de esta transacción no basta.
  if new.monto is distinct from round(v.total)::integer then
    raise exception 'MONTO_NO_COINCIDE: la reserva es por % y la venta vale %', new.monto, round(v.total)::integer using errcode = 'P0409';
  end if;
  return new;
end $$;
drop trigger if exists pagos_point_bloquea_venta on public.pagos_point;
create trigger pagos_point_bloquea_venta before insert on public.pagos_point for each row execute function public.pagos_point_bloquea_venta();

create or replace function public.cobrar_venta_manual(p_empresa text, p_venta text, p_medio text, p_mixto_suma integer default null)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare v record;
begin
  select id, total, metodo_pago into v from public.ventas where id::text = p_venta and empresa_id::text = p_empresa for update;
  if not found then return 'no_encontrada'; end if;
  if coalesce(v.metodo_pago, '') <> '' then return 'ya_cobrada'; end if;
  if exists (select 1 from public.pagos_point where venta_id = p_venta and restaurante_id::text = p_empresa
               and lower(coalesce(estado, '')) not in ('canceled', 'cancelled', 'failed', 'expired', 'refunded')) then return 'point_en_curso'; end if;
  if p_mixto_suma is not null and p_mixto_suma <> round(v.total) then return 'mixto_no_suma'; end if;
  update public.ventas set metodo_pago = p_medio, estado = 'listo' where id = v.id;
  return 'ok';
end $$;

create or replace function public.editar_comanda_venta(p_empresa text, p_venta text, p_total integer, p_items jsonb, p_mesa text default null, p_mesero text default null, p_personas integer default null)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare v record; suma bigint;
begin
  if jsonb_typeof(p_items) <> 'array' then return 'items_invalidos'; end if;
  select coalesce(sum((i->>'cantidad')::bigint * (i->>'precio_unit')::bigint), 0) into suma from jsonb_array_elements(p_items) i;
  if suma <> p_total then return 'total_no_coincide'; end if;
  select id, metodo_pago into v from public.ventas where id::text = p_venta and empresa_id::text = p_empresa for update;
  if not found then return 'no_encontrada'; end if;
  if coalesce(v.metodo_pago, '') <> '' then return 'ya_cobrada'; end if;
  if exists (select 1 from public.pagos_point where venta_id = p_venta and restaurante_id::text = p_empresa
               and lower(coalesce(estado, '')) not in ('canceled', 'cancelled', 'failed', 'expired', 'refunded')) then return 'point_en_curso'; end if;
  update public.ventas set total = p_total, items = p_items, mesa = coalesce(p_mesa, mesa), mesero = coalesce(p_mesero, mesero), personas = coalesce(p_personas, personas) where id = v.id;
  return 'ok';
end $$;

revoke all on function public.cobrar_venta_manual(text, text, text, integer), public.editar_comanda_venta(text, text, integer, jsonb, text, text, integer), public.pagos_point_bloquea_venta() from public, anon, authenticated;
grant execute on function public.cobrar_venta_manual(text, text, text, integer), public.editar_comanda_venta(text, text, integer, jsonb, text, text, integer) to service_role;
commit;
