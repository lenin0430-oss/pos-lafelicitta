-- MesaPOS · 08c — reglas de cierre del dueño (INCREMENTAL sobre 08 + 08b ya aplicadas, p. ej. en mesapos-pruebas-aislado).
-- EN PRODUCCIÓN NO SE USA: allí se aplica solo 08_turnos_caja.sql (versión final, que ya contiene todo esto).
--  · «Cerrar turno» se bloquea en el servidor (dentro de turno_cerrar) por comandas sin entregar, ventas sin cobrar, pagos Point en proceso y
--    cobros con medio por confirmar; la lista (n.º, mesa, monto, motivo) viaja en el resumen y en la respuesta del cierre.
--  · No se cobra sin turno abierto (P0413 SIN_TURNO_ABIERTO), también al reservar un cobro Point; excepción: pago ya confirmado por el proveedor.
--  · Comandas nuevas y reservas Point se serializan con el cierre (FOR SHARE del turno). Borrar una venta anula sus cobros (sin FK) y lo registra.
-- Una sola transacción. Reversión: volver a aplicar 08_turnos_caja_REVERSION.sql (retira todo lo de 08).
begin;
alter table public.cobros_turno drop constraint if exists cobros_turno_venta_id_fkey;
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
drop trigger if exists ventas_cobro_a_turno on public.ventas;
create trigger ventas_cobro_a_turno before insert or update of estado_pago on public.ventas
  for each row execute function public.trg_cobro_a_turno();

-- Una comanda nueva toma FOR SHARE el turno abierto: el cierre (FOR UPDATE) espera a que termine de guardarse y la ve; si el cierre llegó antes,
-- la comanda queda fuera del turno cerrado (y no se podrá cobrar hasta abrir otro turno).
create or replace function public.trg_venta_serializa_cierre() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.empresa_id is not null then perform public._turno_abierto(new.empresa_id); end if;
  return new;
end $$;
drop trigger if exists ventas_serializa_cierre on public.ventas;
create trigger ventas_serializa_cierre before insert on public.ventas
  for each row execute function public.trg_venta_serializa_cierre();

-- Borrar una venta (Reportes, solo admin) anula sus cobros activos y lo deja registrado; si el turno ya estaba cerrado, su cierre NO cambia.
create or replace function public.trg_venta_eliminada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform 1 from public.aperturas_caja a join public.cobros_turno c on c.turno_id = a.id
    where c.venta_id = old.id and c.anulado_at is null order by a.id for share of a;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle)
    select old.empresa_id, c.turno_id,
           case when a.estado = 'cerrada' then 'anulacion_posterior_al_cierre' else 'cobro_anulado' end,
           jsonb_build_object('venta_id', old.id, 'numero', old.numero, 'mesa', old.mesa, 'cobro_id', c.id, 'medio', c.medio, 'monto', c.monto, 'venta_eliminada', true)
      from public.cobros_turno c left join public.aperturas_caja a on a.id = c.turno_id
     where c.venta_id = old.id and c.anulado_at is null;
  update public.cobros_turno set anulado_at = clock_timestamp() where venta_id = old.id and anulado_at is null;
  return old;
end $$;
drop trigger if exists ventas_eliminada_anula_cobros on public.ventas;
create trigger ventas_eliminada_anula_cobros before delete on public.ventas
  for each row execute function public.trg_venta_eliminada();

-- Reservar un cobro Point (nuevo cobro) exige turno abierto y lo serializa con el cierre. Se llama DESPUÉS de pagos_point_bloquea_venta (07c)
-- por orden alfabético: primero se bloquea la venta y luego el turno (mismo orden que el cobro manual: sin interbloqueos).
create or replace function public.trg_pagos_point_requiere_turno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_emp uuid;
begin
  if new.estado not in ('reservado','created','at_terminal') then return new; end if;
  select empresa_id into v_emp from public.ventas where id::text = new.venta_id;
  if v_emp is null then return new; end if;   -- la pertenencia de la venta la valida 04b
  if public._turno_abierto(v_emp) is null then
    raise exception 'SIN_TURNO_ABIERTO' using errcode = 'P0413', hint = 'Abre el turno antes de cobrar';
  end if;
  return new;
end $$;
drop trigger if exists pagos_point_turno_abierto on public.pagos_point;
create trigger pagos_point_turno_abierto before insert on public.pagos_point
  for each row execute function public.trg_pagos_point_requiere_turno();

-- Qué impide cerrar el turno (lista para mostrar y para validar en el servidor). Sin ocultar nada: solo se excluyen las comandas ARCHIVADAS de cocina
-- (marca de 06, histórico aprobado). Comandas/ventas sin cobrar de días anteriores SÍ cuentan: son pendientes reales.
create or replace function public.turno_bloqueos(p_turno uuid)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare t public.aperturas_caja; r jsonb;
begin
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2';
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x->>'numero')::int nulls last, x->>'tipo'), '[]'::jsonb) into r from (
    select * from (
      select jsonb_build_object('tipo', 'comanda_sin_entregar', 'venta_id', v.id, 'numero', v.numero, 'mesa', v.mesa, 'monto', v.total,
               'estado', v.estado, 'motivo', 'Comanda sin entregar (' || v.estado || ')', 'ir', 'cocina') x
        from public.ventas v
       where v.empresa_id = t.empresa_id and v.cocina_archivada_at is null and v.estado in ('pendiente','en_proceso','listo')
      union all
      select jsonb_build_object('tipo', 'venta_sin_cobrar', 'venta_id', v.id, 'numero', v.numero, 'mesa', v.mesa, 'monto', v.total,
               'estado', v.estado, 'motivo', 'Venta sin cobrar', 'ir', 'caja')
        from public.ventas v
       where v.empresa_id = t.empresa_id and v.cocina_archivada_at is null and v.estado_pago = 'pendiente'
      union all
      select jsonb_build_object('tipo', 'cobro_medio_sin_confirmar', 'venta_id', v.id, 'cobro_id', c.id, 'numero', v.numero, 'mesa', v.mesa, 'monto', c.monto,
               'motivo', 'Cobro con medio por confirmar (Point sin medio informado)', 'ir', 'cierre')
        from public.cobros_turno c join public.ventas v on v.id = c.venta_id
       where c.turno_id = p_turno and c.medio = 'por_conciliar' and c.anulado_at is null
      union all
      select jsonb_build_object('tipo', 'cobro_medio_sin_confirmar', 'venta_id', v.id, 'numero', v.numero, 'mesa', v.mesa, 'monto', v.total,
               'motivo', 'Cobro con medio sin identificar', 'ir', 'caja')
        from public.ventas v
       where v.empresa_id = t.empresa_id and v.cocina_archivada_at is null and v.estado_pago = 'sin_identificar' and v.created_at >= t.created_at
      union all
      select jsonb_build_object('tipo', 'point_en_proceso', 'venta_id', v.id, 'numero', v.numero, 'mesa', v.mesa, 'monto', p.monto,
               'estado', p.estado, 'motivo', 'Pago Point en proceso (' || p.estado || ')', 'ir', 'caja')
        from public.pagos_point p join public.ventas v on v.id::text = p.venta_id
       where v.empresa_id = t.empresa_id and p.estado in ('reservado','created','at_terminal')
    ) u limit 200
  ) q;
  return r;
end $$;

create or replace function public.turno_resumen(p_turno uuid)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare t public.aperturas_caja; v jsonb; fin timestamptz;
  c_ef int; c_de int; c_cr int; c_tr int; c_qr int; c_pc int; c_co int;
  g_caja int; g_otros int; ret int; prop int; n_pc int; n_pend int; bl jsonb;
begin
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2';
  if not found then return null; end if;
  if t.estado = 'cerrada' then
    select resumen into v from public.cierres_turno where turno_id = p_turno;
    if v is not null then return v; end if;   -- un turno cerrado siempre muestra lo que se confirmó
  end if;
  fin := coalesce(t.cerrada_at, clock_timestamp());
  select coalesce(sum(monto) filter (where medio='efectivo'),0), coalesce(sum(monto) filter (where medio='debito'),0),
         coalesce(sum(monto) filter (where medio='credito'),0), coalesce(sum(monto) filter (where medio='transferencia'),0),
         coalesce(sum(monto) filter (where medio='qr'),0), coalesce(sum(monto) filter (where medio='por_conciliar'),0),
         coalesce(sum(monto) filter (where medio='cortesia'),0), count(*) filter (where medio='por_conciliar')
    into c_ef, c_de, c_cr, c_tr, c_qr, c_pc, c_co, n_pc
    from public.cobros_turno where turno_id = p_turno and anulado_at is null;
  select coalesce(sum(monto) filter (where afecto_caja),0), coalesce(sum(monto) filter (where not afecto_caja),0)
    into g_caja, g_otros from public.gastos where apertura_id = p_turno;
  select coalesce(sum(monto),0) into ret from public.movimientos_caja where turno_id = p_turno;
  select coalesce(sum(monto),0) into prop from public.propinas where apertura_id = p_turno;
  bl := public.turno_bloqueos(p_turno);
  select count(*) into n_pend from jsonb_array_elements(bl) e where e->>'tipo' = 'venta_sin_cobrar';
  return jsonb_build_object(
    'turno', jsonb_build_object('id', t.id, 'estado', t.estado, 'fecha_apertura', t.fecha_apertura,
        'apertura_at', t.created_at, 'cierre_at', t.cerrada_at, 'cajero', t.cajero,
        'horas_abiertas', round((extract(epoch from (fin - t.created_at)) / 3600.0)::numeric, 2)),
    'fondo', t.monto_inicial,
    'cobros', jsonb_build_object('efectivo', c_ef, 'debito', c_de, 'credito', c_cr, 'transferencia', c_tr, 'qr', c_qr,
                                 'por_conciliar', c_pc, 'cortesia', c_co),
    'gastos_caja', g_caja, 'gastos_otros_medios', g_otros, 'retiros', ret, 'propinas_registradas', prop,
    'esperado', jsonb_build_object('efectivo', t.monto_inicial + c_ef - g_caja - ret, 'debito', c_de, 'credito', c_cr,
                                   'transferencia', c_tr, 'qr', c_qr, 'por_conciliar', c_pc),
    'pendientes', jsonb_build_object('cobros_por_conciliar', n_pc, 'monto_por_conciliar', c_pc, 'ventas_sin_cobrar', n_pend, 'bloqueos_total', jsonb_array_length(bl)),
    'bloqueos', bl
  );
end $$;

create or replace function public.turno_cerrar(p_turno uuid, p_contados jsonb, p_notas text, p_clave uuid, p_por text, p_esperado_visto jsonb default null)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare t public.aperturas_caja; r jsonb; ex jsonb; cie uuid; k text; esp int; con int; pend boolean; prev public.cierres_turno; bl jsonb;
begin
  if p_clave is null then return jsonb_build_object('ok', false, 'codigo', 'falta_clave'); end if;
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2' for update;   -- serializa con cobros (FOR SHARE) y otros cierres
  if not found then return jsonb_build_object('ok', false, 'codigo', 'turno_no_encontrado'); end if;
  if t.estado <> 'abierta' then
    select * into prev from public.cierres_turno where turno_id = p_turno;
    if prev.id is not null and prev.clave_idempotencia = p_clave then
      return jsonb_build_object('ok', true, 'repetido', true, 'cierre_id', prev.id, 'resumen', prev.resumen);
    end if;
    return jsonb_build_object('ok', false, 'codigo', 'ya_cerrado');
  end if;
  -- Con el turno ya bloqueado (FOR UPDATE): nada de lo que bloquea el cierre puede entrar o cambiar sin que lo vea esta misma transacción.
  bl := public.turno_bloqueos(p_turno);
  if jsonb_array_length(bl) > 0 then
    insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
      values (t.empresa_id, p_turno, 'cierre_bloqueado', jsonb_build_object('total', jsonb_array_length(bl),
              'tipos', (select jsonb_agg(distinct e->>'tipo') from jsonb_array_elements(bl) e)), p_por);
    return jsonb_build_object('ok', false, 'codigo', 'bloqueado', 'bloqueos', bl);
  end if;
  if p_contados is null or (p_contados->>'efectivo') is null or (p_contados->>'efectivo')::int < 0 then
    return jsonb_build_object('ok', false, 'codigo', 'falta_efectivo_contado');
  end if;
  r := public.turno_resumen(p_turno);        -- recalculado aquí, con lo que hay guardado; nada viene del navegador
  ex := r->'esperado';
  -- Si entre lo que vio la cajera y este momento entró o cambió algo (otro equipo), NO se cierra: se devuelve el resumen nuevo.
  if p_esperado_visto is not null and exists (select 1 from jsonb_object_keys(ex) as kk(medio_k) where (p_esperado_visto->>medio_k) is distinct from (ex->>medio_k)) then
    return jsonb_build_object('ok', false, 'codigo', 'resumen_cambio', 'resumen', r);
  end if;
  pend := (r->'pendientes'->>'cobros_por_conciliar')::int > 0 or (r->'pendientes'->>'ventas_sin_cobrar')::int > 0;
  perform set_config('app.turno_fn', '1', true);
  update public.aperturas_caja set estado = 'cerrada', cerrada_at = clock_timestamp(), cerrada_por = p_por where id = p_turno
    returning * into t;
  r := jsonb_set(r, '{turno,estado}', '"cerrada"') || jsonb_build_object('turno_cierre_at', t.cerrada_at);
  r := jsonb_set(r, '{turno,cierre_at}', to_jsonb(t.cerrada_at));
  for k in select jsonb_object_keys(ex) loop
    if nullif(p_contados->>k, '') is null and (ex->>k)::int <> 0 then pend := true; end if;
  end loop;
  insert into public.cierres_turno (empresa_id, turno_id, clave_idempotencia, fecha_apertura, apertura_at, cierre_at, fondo_contado,
                                    cerrado_por, notas, con_pendientes, resumen)
    values (t.empresa_id, p_turno, p_clave, t.fecha_apertura, t.created_at, t.cerrada_at, t.monto_inicial, p_por, p_notas, pend, r)
    returning id into cie;
  for k in select jsonb_object_keys(ex) loop
    esp := (ex->>k)::int;
    con := nullif(p_contados->>k, '')::int;
    insert into public.cierres_turno_medios (cierre_id, medio, esperado, contado, diferencia)
      values (cie, k, esp, con, case when con is null then null else con - esp end);
  end loop;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (t.empresa_id, p_turno, 'turno_cerrado', jsonb_build_object('cierre_id', cie, 'con_pendientes', pend), p_por);
  -- Compatibilidad con reportes existentes (cierres_caja). Los cobros por conciliar NO se agrupan en QR.
  insert into public.cierres_caja (empresa_id, apertura_id, fecha, ventas_total, ventas_efectivo, ventas_debito, ventas_qr, ventas_transferencia,
                                   efectivo_fisico, diferencia, notas)
    values (t.empresa_id, p_turno, t.fecha_apertura,
            (r->'cobros'->>'efectivo')::int + (r->'cobros'->>'debito')::int + (r->'cobros'->>'credito')::int + (r->'cobros'->>'transferencia')::int
              + (r->'cobros'->>'qr')::int + (r->'cobros'->>'por_conciliar')::int,
            (r->'cobros'->>'efectivo')::int, (r->'cobros'->>'debito')::int + (r->'cobros'->>'credito')::int, (r->'cobros'->>'qr')::int,
            (r->'cobros'->>'transferencia')::int, (p_contados->>'efectivo')::int, (p_contados->>'efectivo')::int - (ex->>'efectivo')::int,
            coalesce(p_notas,''));
  return jsonb_build_object('ok', true, 'repetido', false, 'cierre_id', cie, 'con_pendientes', pend, 'resumen', r);
end $$;


revoke all on function public.turno_bloqueos(uuid) from public, anon, authenticated;
grant execute on function public.turno_bloqueos(uuid) to service_role;
commit;
