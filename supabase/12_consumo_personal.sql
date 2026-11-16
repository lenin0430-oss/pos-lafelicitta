-- MesaPOS · 12 — Consumo personal de trabajadores (se descuenta del pago diario; NO entra a la caja).
-- PROPUESTA: NO APLICADA. Requiere 08_turnos_caja.sql y 11_abonos.sql ya aplicadas. Una sola transacción.
-- Reversión: 12_consumo_personal_REVERSION.sql
--
-- Modelo:
--  · ventas.estado_pago gana el valor 'consumo_personal' = el trabajador consumió y se le descuenta de su pago.
--    No es un cobro: no escribe en cobros_turno, no suma a efectivo/débito/transferencia y no cambia el arqueo.
--  · ventas.metodo_pago queda como 'Consumo personal' (las comandas siguen mostrando el medio).
--  · tabla consumos_personal = libro por trabajador: pendiente (descontado_at NULL) o descontado (descontado_at con fecha).
--  · Una venta 'consumo_personal' NO bloquea el cierre de turno (turno_bloqueos solo bloquea estado_pago='pendiente').
--  · Cobrar/editar normal rechaza esta venta (07c: estado_pago <> 'pendiente' → ya_cobrada) y 04b rechaza reservar Point.
--  · Descontar = marcar el consumo como descontado del pago del trabajador. Es solo un registro: no mueve dinero.
begin;

-- ───────── 1. Nuevo estado financiero ─────────
alter table public.ventas drop constraint if exists ventas_estado_pago_chk;
alter table public.ventas add constraint ventas_estado_pago_chk
  check (estado_pago in ('pendiente','abonada','pagado','cortesia','sin_identificar','consumo_personal'));

-- ───────── 2. Libro de consumos (RLS cerrada: solo service_role) ─────────
create table if not exists public.consumos_personal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venta_id uuid not null,     -- sin FK (igual que abonos): borrar la venta anula su consumo pero conserva el historial
  turno_id uuid references public.aperturas_caja(id),   -- turno abierto al registrar (informativo; puede ser NULL)
  trabajador text not null check (char_length(trabajador) between 1 and 60),
  monto integer not null check (monto >= 0),
  registrado_por text,
  descontado_at timestamptz,
  descontado_por text,
  anulado_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists consumos_personal_venta_uq on public.consumos_personal (venta_id) where anulado_at is null;
create index if not exists consumos_personal_pend_idx on public.consumos_personal (empresa_id, created_at) where anulado_at is null and descontado_at is null;
alter table public.consumos_personal enable row level security;
revoke all on public.consumos_personal from public, anon, authenticated;
grant all on public.consumos_personal to service_role;

-- ───────── 3. Borrar una venta anula también su consumo ─────────
create or replace function public.trg_consumo_venta_eliminada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.consumos_personal set anulado_at = clock_timestamp() where venta_id = old.id and anulado_at is null;
  return old;
end $$;
drop trigger if exists ventas_eliminada_anula_consumo on public.ventas;
create trigger ventas_eliminada_anula_consumo after delete on public.ventas
  for each row execute function public.trg_consumo_venta_eliminada();

-- ───────── 4. Registrar el consumo de un trabajador ─────────
-- Bloquea la venta (FOR UPDATE) como 07c. No exige turno abierto: no entra dinero a la caja.
create or replace function public.registrar_consumo_personal(p_empresa uuid, p_venta uuid, p_trabajador text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v record; v_id uuid; v_nombre text; v_turno uuid;
begin
  v_nombre := nullif(btrim(p_trabajador), '');
  if v_nombre is null or char_length(v_nombre) > 60 then return jsonb_build_object('ok', false, 'codigo', 'trabajador_invalido'); end if;
  select id, total, metodo_pago, estado_pago into v from public.ventas where id = p_venta and empresa_id = p_empresa for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'venta_no_encontrada'); end if;
  if v.estado_pago <> 'pendiente' or coalesce(v.metodo_pago, '') <> '' then return jsonb_build_object('ok', false, 'codigo', 'ya_cobrada'); end if;
  if exists (select 1 from public.pagos_point where venta_id = p_venta::text and restaurante_id::text = p_empresa::text
               and lower(coalesce(estado, '')) not in ('canceled', 'cancelled', 'failed', 'expired', 'refunded')) then
    return jsonb_build_object('ok', false, 'codigo', 'point_en_curso');
  end if;
  v_turno := public._turno_abierto(p_empresa);
  insert into public.consumos_personal (empresa_id, venta_id, turno_id, trabajador, monto, registrado_por)
    values (p_empresa, p_venta, v_turno, v_nombre, v.total, p_por) returning id into v_id;
  update public.ventas set estado_pago = 'consumo_personal', metodo_pago = 'Consumo personal', pagado_at = null where id = p_venta;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, v_turno, 'consumo_personal', jsonb_build_object('venta_id', p_venta, 'consumo_id', v_id, 'trabajador', v_nombre, 'monto', v.total), p_por);
  return jsonb_build_object('ok', true, 'consumo_id', v_id, 'trabajador', v_nombre, 'monto', v.total);
end $$;

-- ───────── 5. Marcar consumos como descontados del pago ─────────
-- Solo marca los que siguen pendientes y son del negocio; devuelve cuántos y cuánto sumaron.
create or replace function public.descontar_consumos_personal(p_empresa uuid, p_ids uuid[], p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare n integer; total integer;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 200 then return jsonb_build_object('ok', false, 'codigo', 'ids_invalidos'); end if;
  with u as (
    update public.consumos_personal
       set descontado_at = clock_timestamp(), descontado_por = p_por
     where empresa_id = p_empresa and id = any (p_ids) and descontado_at is null and anulado_at is null
     returning monto)
  select count(*), coalesce(sum(monto), 0) into n, total from u;
  if n = 0 then return jsonb_build_object('ok', false, 'codigo', 'nada_pendiente'); end if;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, public._turno_abierto(p_empresa), 'consumo_descontado', jsonb_build_object('cantidad', n, 'monto', total), p_por);
  return jsonb_build_object('ok', true, 'cantidad', n, 'monto', total);
end $$;

revoke all on function public.registrar_consumo_personal(uuid, uuid, text, text), public.descontar_consumos_personal(uuid, uuid[], text), public.trg_consumo_venta_eliminada() from public, anon, authenticated;
grant execute on function public.registrar_consumo_personal(uuid, uuid, text, text), public.descontar_consumos_personal(uuid, uuid[], text) to service_role;
commit;
