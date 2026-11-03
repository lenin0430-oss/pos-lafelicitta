-- Reversión de 09_correlativos.sql. Respalda los folios en `respaldo_correlativos` antes de quitar nada.
-- Las comandas conservan el `numero` que ya recibieron (ya impreso); solo se retiran los mecanismos y las columnas de folio/claves.
begin;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'respaldo_correlativos') then
    raise exception 'respaldo_correlativos ya existe: renombrarlo (alter schema respaldo_correlativos rename to respaldo_correlativos_AAAAMMDD) antes de revertir.';
  end if;
end $$;
create schema respaldo_correlativos;
revoke all on schema respaldo_correlativos from public, anon, authenticated;
create table respaldo_correlativos.correlativos as select * from public.correlativos;
create table respaldo_correlativos.ventas as select id, empresa_id, numero, folio, clave_idempotencia from public.ventas where folio is not null or clave_idempotencia is not null;
create table respaldo_correlativos.aperturas_caja as select id, empresa_id, numero_turno, clave_apertura from public.aperturas_caja where numero_turno is not null or clave_apertura is not null;
create table respaldo_correlativos.cierres_turno as select id, empresa_id, turno_id, numero_cierre from public.cierres_turno where numero_cierre is not null;
revoke all on all tables in schema respaldo_correlativos from public, anon, authenticated;
drop trigger if exists ventas_folio on public.ventas;
drop function if exists public.trg_venta_folio();
drop function if exists public.turno_abrir(uuid, integer, text, uuid);
create or replace function public.turno_abrir(p_empresa uuid, p_fondo integer, p_cajero text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_exist uuid;
begin
  if p_fondo is null or p_fondo < 0 then return jsonb_build_object('ok', false, 'codigo', 'fondo_invalido'); end if;
  perform set_config('app.turno_fn', '1', true);
  perform pg_advisory_xact_lock(hashtextextended('turno_abrir:' || p_empresa::text, 0));
  select id into v_exist from public.aperturas_caja where empresa_id = p_empresa and estado = 'abierta' and modelo = 'v2';
  if v_exist is not null then return jsonb_build_object('ok', false, 'codigo', 'ya_abierto', 'turno_id', v_exist); end if;
  insert into public.aperturas_caja (empresa_id, monto_inicial, cajero, estado, modelo, created_at, fecha, fecha_apertura)
  values (p_empresa, p_fondo, coalesce(p_cajero,'Caja'), 'abierta', 'v2', clock_timestamp(),
          (clock_timestamp() at time zone 'America/Santiago')::date, (clock_timestamp() at time zone 'America/Santiago')::date)
  returning id into v_id;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, v_id, 'turno_abierto', jsonb_build_object('fondo_contado', p_fondo), p_cajero);
  return jsonb_build_object('ok', true, 'turno_id', v_id);
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
drop function if exists public.correlativo_siguiente(uuid, text);
drop index if exists public.ventas_folio_uq, public.ventas_clave_uq, public.aperturas_numero_turno_uq, public.aperturas_clave_uq, public.cierres_numero_uq, public.ventas_empresa_numero_idx;
alter table public.ventas drop column if exists folio, drop column if exists clave_idempotencia;
alter table public.aperturas_caja drop column if exists numero_turno, drop column if exists clave_apertura;
alter table public.cierres_turno drop column if exists numero_cierre;
drop table if exists public.correlativos;
revoke all on function public.turno_abrir(uuid,integer,text), public.turno_resumen(uuid), public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.turno_abrir(uuid,integer,text), public.turno_resumen(uuid), public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb) to service_role;
commit;
