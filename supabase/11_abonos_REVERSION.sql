-- Reversión de 11_abonos.sql. NO destruye datos: si ya hay abonos registrados, se detiene (hay dinero cobrado en partes que quedaría sin respaldo contable).
-- Si no hay abonos (p. ej. se revierte antes de usarlo), deja la base exactamente como estaba con 08.
begin;
do $$ begin
  if exists (select 1 from public.abonos) then
    raise exception 'Hay abonos registrados: no se revierte. Cobra los saldos pendientes y conserva public.abonos (respáldala antes de decidir).';
  end if;
end $$;
drop trigger if exists ventas_eliminada_anula_abonos on public.ventas;
drop function if exists public.registrar_abono(uuid, uuid, integer, text, text, text), public.cobrar_saldo(uuid, uuid, text, text), public.trg_abonos_venta_eliminada();
drop table if exists public.abonos;
drop index if exists public.cobros_turno_activo_uq;
create unique index if not exists cobros_turno_activo_uq on public.cobros_turno (venta_id, medio) where anulado_at is null;
alter table public.ventas drop constraint if exists ventas_estado_pago_chk;
alter table public.ventas add constraint ventas_estado_pago_chk check (estado_pago in ('pendiente','pagado','cortesia','sin_identificar'));
-- Trigger de cobro a turno: versión de 08_turnos_caja.sql (sin los cambios «11»).
create or replace function public.trg_cobro_a_turno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_turno uuid; v_medio_point text; p record; v_anulado boolean := false;
begin
  if new.empresa_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.estado_pago = 'pagado' and new.estado_pago is distinct from 'pagado' then
    -- La anulación queda registrada con su turno; si ese turno ya estaba cerrado, su cierre NO cambia (usa su instantánea).
    perform 1 from public.aperturas_caja a join public.cobros_turno c on c.turno_id = a.id
      where c.venta_id = new.id and c.anulado_at is null order by a.id for share of a;   -- serializa con el cierre
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
  if tg_op = 'UPDATE' and old.estado_pago in ('pagado','cortesia') then return new; end if;   -- ya registrado
  v_turno := public._turno_abierto(new.empresa_id);
  -- Un cobro NUEVO exige turno abierto. Única excepción: el proveedor ya confirmó el pago (pagos_point.processed): no se pierde, queda sin turno y se informa.
  if v_turno is null and not exists (select 1 from public.pagos_point where venta_id = new.id::text and estado = 'processed') then
    raise exception 'SIN_TURNO_ABIERTO' using errcode = 'P0413', hint = 'Abre el turno antes de cobrar';
  end if;
  new.turno_id := v_turno;
  select medio_reportado into v_medio_point from public.pagos_point
    where venta_id = new.id::text and estado = 'processed' and medio_reportado is not null order by updated_at desc limit 1;
  for p in select * from public._partes_cobro(new.metodo_pago, new.total) loop
    insert into public.cobros_turno (empresa_id, turno_id, venta_id, medio, proveedor, monto)
    values (new.empresa_id, v_turno,
            new.id,
            case when p.proveedor = 'point' and v_medio_point is not null then v_medio_point else p.medio end,
            p.proveedor, p.monto)
    on conflict (venta_id, medio) where anulado_at is null do nothing;
  end loop;
  if v_turno is null then
    insert into public.turno_eventos(empresa_id, turno_id, evento, detalle)
      values (new.empresa_id, null, 'cobro_sin_turno', jsonb_build_object('venta_id', new.id, 'total', new.total));
  end if;
  return new;
end $$;
commit;
