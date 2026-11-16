-- MesaPOS · 11 — Abonos (pago en partes de una venta: parte ahora, saldo después).
-- PROPUESTA: NO APLICADA. Requiere 08_turnos_caja.sql (versión final) ya aplicada. Una sola transacción.
-- Reversión: 11_abonos_REVERSION.sql
--
-- Modelo:
--  · ventas.estado_pago gana el valor 'abonada' = «tiene abonos y le queda saldo». No cobra ni retira comanda.
--  · tabla abonos = libro de pagos de una venta: tipo 'abono' (parcial) y tipo 'saldo' (el pago final).
--  · Cada abono/saldo escribe su fila en cobros_turno (referencia 'abono:<id>' / 'saldo:<id>') en el turno ABIERTO de ese momento:
--    el cierre de turno cuenta el dinero el día que de verdad entró, sin tocar turno_resumen ni turno_cerrar.
--  · Una venta 'abonada' NO bloquea el cierre de turno (turno_bloqueos solo bloquea estado_pago='pendiente').
--  · Cobrar/editar normal sigue rechazando una venta abonada (07c: estado_pago <> 'pendiente' → ya_cobrada) y 04b rechaza reservar Point.
--  · Al pagar el saldo, ventas.metodo_pago queda como el detalle completo («Efectivo» o «Mixto: Efectivo $6.000 + Transferencia $6.000»),
--    con el mismo formato que ya entienden cierre.ts y reportes; la suma siempre iguala el total.
begin;

-- ───────── 1. Nuevo estado financiero ─────────
alter table public.ventas drop constraint if exists ventas_estado_pago_chk;
alter table public.ventas add constraint ventas_estado_pago_chk
  check (estado_pago in ('pendiente','abonada','pagado','cortesia','sin_identificar'));

-- ───────── 2. Libro de abonos (RLS cerrada: solo service_role) ─────────
create table if not exists public.abonos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venta_id uuid not null,     -- sin FK (igual que cobros_turno): borrar la venta anula sus abonos pero conserva el historial
  turno_id uuid references public.aperturas_caja(id),
  tipo text not null default 'abono' check (tipo in ('abono','saldo')),
  monto integer not null check (monto > 0),
  medio text not null check (medio in ('efectivo','debito','credito','transferencia')),
  cliente text check (cliente is null or char_length(cliente) <= 80),
  registrado_por text,
  anulado_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists abonos_venta_idx on public.abonos (venta_id) where anulado_at is null;
create index if not exists abonos_empresa_idx on public.abonos (empresa_id, created_at);
alter table public.abonos enable row level security;
revoke all on public.abonos from public, anon, authenticated;
grant all on public.abonos to service_role;

-- ───────── 3. Un abono y el saldo pueden usar el MISMO medio ─────────
-- Antes: un cobro activo por (venta, medio). Ahora además por referencia (NULL = cobro normal de la venta, como siempre).
drop index if exists public.cobros_turno_activo_uq;
create unique index cobros_turno_activo_uq on public.cobros_turno (venta_id, medio, (coalesce(referencia, ''))) where anulado_at is null;

-- ───────── 4. Trigger de cobro a turno: igual que 08, con dos cambios marcados «11» ─────────
create or replace function public.trg_cobro_a_turno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_turno uuid; v_medio_point text; p record; v_anulado boolean := false;
begin
  if new.empresa_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.estado_pago = 'pagado' and new.estado_pago is distinct from 'pagado' then
    perform 1 from public.aperturas_caja a join public.cobros_turno c on c.turno_id = a.id
      where c.venta_id = new.id and c.anulado_at is null order by a.id for share of a;
    insert into public.turno_eventos(empresa_id, turno_id, evento, detalle)
      select new.empresa_id, c.turno_id,
             case when a.estado = 'cerrada' then 'anulacion_posterior_al_cierre' else 'cobro_anulado' end,
             jsonb_build_object('venta_id', new.id, 'cobro_id', c.id, 'medio', c.medio, 'monto', c.monto, 'nuevo_estado_pago', new.estado_pago)
        from public.cobros_turno c left join public.aperturas_caja a on a.id = c.turno_id
       where c.venta_id = new.id and c.anulado_at is null;
    update public.cobros_turno set anulado_at = clock_timestamp() where venta_id = new.id and anulado_at is null;
    return new;
  end if;
  if new.estado_pago not in ('pagado','cortesia') then return new; end if;
  if tg_op = 'UPDATE' and old.estado_pago in ('pagado','cortesia') then return new; end if;
  v_turno := public._turno_abierto(new.empresa_id);
  if v_turno is null and not exists (select 1 from public.pagos_point where venta_id = new.id::text and estado = 'processed') then
    raise exception 'SIN_TURNO_ABIERTO' using errcode = 'P0413', hint = 'Abre el turno antes de cobrar';
  end if;
  new.turno_id := v_turno;
  -- 11: una venta con abonos ya escribió sus cobros (abonos y saldo) en cobros_turno mediante cobrar_saldo(); no se vuelven a repartir por metodo_pago.
  if exists (select 1 from public.abonos where venta_id = new.id and tipo = 'abono' and anulado_at is null) then return new; end if;
  select medio_reportado into v_medio_point from public.pagos_point
    where venta_id = new.id::text and estado = 'processed' and medio_reportado is not null order by updated_at desc limit 1;
  for p in select * from public._partes_cobro(new.metodo_pago, new.total) loop
    insert into public.cobros_turno (empresa_id, turno_id, venta_id, medio, proveedor, monto)
    values (new.empresa_id, v_turno,
            new.id,
            case when p.proveedor = 'point' and v_medio_point is not null then v_medio_point else p.medio end,
            p.proveedor, p.monto)
    on conflict (venta_id, medio, (coalesce(referencia, ''))) where anulado_at is null do nothing;   -- 11: el índice único ahora incluye la referencia
  end loop;
  if v_turno is null then
    insert into public.turno_eventos(empresa_id, turno_id, evento, detalle)
      values (new.empresa_id, null, 'cobro_sin_turno', jsonb_build_object('venta_id', new.id, 'total', new.total));
  end if;
  return new;
end $$;

-- ───────── 5. Borrar una venta anula también sus abonos ─────────
create or replace function public.trg_abonos_venta_eliminada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.abonos set anulado_at = clock_timestamp() where venta_id = old.id and anulado_at is null;
  return old;
end $$;
drop trigger if exists ventas_eliminada_anula_abonos on public.ventas;
create trigger ventas_eliminada_anula_abonos after delete on public.ventas
  for each row execute function public.trg_abonos_venta_eliminada();

-- ───────── 6. Registrar un abono ─────────
-- Bloquea la venta (FOR UPDATE) como 07c; exige turno abierto; el abono debe ser MENOR que el saldo (si cubre todo, se usa cobrar_saldo).
create or replace function public.registrar_abono(p_empresa uuid, p_venta uuid, p_monto integer, p_medio text, p_cliente text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v record; v_turno uuid; v_abonado integer; v_id uuid;
begin
  if p_medio is null or p_medio not in ('efectivo','debito','credito','transferencia') then return jsonb_build_object('ok', false, 'codigo', 'medio_invalido'); end if;
  if p_monto is null or p_monto <= 0 then return jsonb_build_object('ok', false, 'codigo', 'monto_invalido'); end if;
  select id, total, metodo_pago, estado_pago into v from public.ventas where id = p_venta and empresa_id = p_empresa for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'venta_no_encontrada'); end if;
  if v.estado_pago not in ('pendiente','abonada') or coalesce(v.metodo_pago, '') <> '' then return jsonb_build_object('ok', false, 'codigo', 'ya_cobrada'); end if;
  if exists (select 1 from public.pagos_point where venta_id = p_venta::text and restaurante_id::text = p_empresa::text
               and lower(coalesce(estado, '')) not in ('canceled', 'cancelled', 'failed', 'expired', 'refunded')) then
    return jsonb_build_object('ok', false, 'codigo', 'point_en_curso');
  end if;
  select coalesce(sum(monto), 0) into v_abonado from public.abonos where venta_id = p_venta and tipo = 'abono' and anulado_at is null;
  if v_abonado + p_monto >= v.total then return jsonb_build_object('ok', false, 'codigo', 'abono_cubre_todo', 'saldo', v.total - v_abonado); end if;
  v_turno := public._turno_abierto(p_empresa);
  if v_turno is null then return jsonb_build_object('ok', false, 'codigo', 'sin_turno'); end if;
  insert into public.abonos (empresa_id, venta_id, turno_id, tipo, monto, medio, cliente, registrado_por)
    values (p_empresa, p_venta, v_turno, 'abono', p_monto, p_medio, nullif(btrim(p_cliente), ''), p_por) returning id into v_id;
  insert into public.cobros_turno (empresa_id, turno_id, venta_id, medio, proveedor, monto, referencia)
    values (p_empresa, v_turno, p_venta, p_medio, 'manual', p_monto, 'abono:' || v_id);
  update public.ventas set estado_pago = 'abonada' where id = p_venta;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, v_turno, 'abono', jsonb_build_object('venta_id', p_venta, 'abono_id', v_id, 'monto', p_monto, 'medio', p_medio), p_por);
  return jsonb_build_object('ok', true, 'abono_id', v_id, 'abonado', v_abonado + p_monto, 'saldo', v.total - v_abonado - p_monto);
end $$;

-- ───────── 7. Cobrar el saldo ─────────
create or replace function public.cobrar_saldo(p_empresa uuid, p_venta uuid, p_medio text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v record; v_turno uuid; v_abonado integer; v_saldo integer; v_id uuid; v_metodo text; v_n integer;
begin
  if p_medio is null or p_medio not in ('efectivo','debito','credito','transferencia') then return jsonb_build_object('ok', false, 'codigo', 'medio_invalido'); end if;
  select id, total, metodo_pago, estado_pago into v from public.ventas where id = p_venta and empresa_id = p_empresa for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'venta_no_encontrada'); end if;
  if v.estado_pago <> 'abonada' then return jsonb_build_object('ok', false, 'codigo', 'no_abonada'); end if;
  select coalesce(sum(monto), 0) into v_abonado from public.abonos where venta_id = p_venta and tipo = 'abono' and anulado_at is null;
  v_saldo := v.total - v_abonado;
  if v_saldo <= 0 then return jsonb_build_object('ok', false, 'codigo', 'sin_saldo'); end if;
  v_turno := public._turno_abierto(p_empresa);
  if v_turno is null then return jsonb_build_object('ok', false, 'codigo', 'sin_turno'); end if;
  insert into public.abonos (empresa_id, venta_id, turno_id, tipo, monto, medio, registrado_por)
    values (p_empresa, p_venta, v_turno, 'saldo', v_saldo, p_medio, p_por) returning id into v_id;
  insert into public.cobros_turno (empresa_id, turno_id, venta_id, medio, proveedor, monto, referencia)
    values (p_empresa, v_turno, p_venta, p_medio, 'manual', v_saldo, 'saldo:' || v_id);
  -- Detalle completo para ventas.metodo_pago: un solo medio → ese medio; varios → «Mixto: …» (formato de 07/cierre.ts). La suma siempre es el total.
  select count(*) into v_n from (select medio from public.abonos where venta_id = p_venta and anulado_at is null group by medio) m;
  if v_n = 1 then
    v_metodo := case p_medio when 'efectivo' then 'Efectivo' when 'debito' then 'Débito' when 'credito' then 'Crédito' else 'Transferencia' end;
  else
    select 'Mixto: ' || string_agg(
             case medio when 'efectivo' then 'Efectivo' when 'debito' then 'Débito' when 'credito' then 'Crédito' else 'Transferencia' end
             || ' $' || replace(to_char(suma, 'FM999,999,999'), ',', '.'),
             ' + ' order by orden)
      into v_metodo
      from (select medio, sum(monto) as suma, min(case medio when 'efectivo' then 1 when 'debito' then 2 when 'credito' then 3 else 4 end) as orden
              from public.abonos where venta_id = p_venta and anulado_at is null group by medio) x;
  end if;
  update public.ventas set metodo_pago = v_metodo, estado_pago = 'pagado', pagado_at = now() where id = p_venta;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, v_turno, 'cobro_saldo', jsonb_build_object('venta_id', p_venta, 'abono_id', v_id, 'monto', v_saldo, 'medio', p_medio, 'metodo_pago', v_metodo), p_por);
  return jsonb_build_object('ok', true, 'saldo_cobrado', v_saldo, 'metodo_pago', v_metodo);
end $$;

revoke all on function public.registrar_abono(uuid, uuid, integer, text, text, text), public.cobrar_saldo(uuid, uuid, text, text), public.trg_abonos_venta_eliminada() from public, anon, authenticated;
grant execute on function public.registrar_abono(uuid, uuid, integer, text, text, text), public.cobrar_saldo(uuid, uuid, text, text) to service_role;
commit;
