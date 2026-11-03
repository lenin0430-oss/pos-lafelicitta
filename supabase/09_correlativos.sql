-- MesaPOS · 09 — FOLIOS INTERNOS por negocio: comandas, turnos y cierres. NO aplicada en ningún proyecto.
-- Requiere 08 (y, en pruebas, 08b/08c). Una sola transacción. Son folios INTERNOS: no son numeración tributaria del SII.
--  · Los asigna la base, atómicamente (tabla `correlativos`, una fila por negocio y tipo, bloqueada hasta el fin de la transacción):
--    nunca el navegador, nunca localStorage, nunca contando filas. Únicos por negocio, sin reinicio a medianoche, sin reutilizar jamás
--    (borrar o anular una comanda no devuelve su número; una transacción fallida no deja huecos porque el contador revierte con ella).
--  · Comandas: `ventas.folio` (y `numero` = folio) lo fija un trigger al insertar e IGNORA cualquier número que mande el cliente.
--    `ventas.clave_idempotencia` (única por negocio): un reintento o doble clic con la misma clave NO crea otra comanda (23505).
--    Folio y número no se pueden cambiar después (editar, cobrar y reimprimir conservan el número).
--  · Turnos: `aperturas_caja.numero_turno`; `turno_abrir(.., p_clave)` es idempotente. Cierres: `cierres_turno.numero_cierre`, asignado
--    solo cuando el cierre se guarda (no al bloquearse); el cierre ya era idempotente por su clave.
--  · Históricos: NO se renumeran. Las comandas, turnos y cierres anteriores conservan su `numero`/identificador y quedan con folio NULL.
--    El contador de comandas arranca en el mayor `numero` histórico de cada negocio (los nuevos continúan después, sin chocar).
-- Reversión: 09_correlativos_REVERSION.sql (respalda los folios en `respaldo_correlativos`; los `numero` ya asignados a comandas quedan).
begin;

create table if not exists public.correlativos (
  empresa_id uuid not null,
  tipo text not null check (tipo in ('comanda','turno','cierre')),
  ultimo bigint not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (empresa_id, tipo)
);
alter table public.correlativos enable row level security;
revoke all on public.correlativos from public, anon, authenticated;
grant all on public.correlativos to service_role;

alter table public.ventas        add column if not exists folio bigint;
alter table public.ventas        add column if not exists clave_idempotencia uuid;
alter table public.aperturas_caja add column if not exists numero_turno bigint;
alter table public.aperturas_caja add column if not exists clave_apertura uuid;
alter table public.cierres_turno add column if not exists numero_cierre bigint;
create unique index if not exists ventas_folio_uq          on public.ventas (empresa_id, folio) where folio is not null;
create unique index if not exists ventas_clave_uq          on public.ventas (empresa_id, clave_idempotencia) where clave_idempotencia is not null;
create unique index if not exists aperturas_numero_turno_uq on public.aperturas_caja (empresa_id, numero_turno) where numero_turno is not null;
create unique index if not exists aperturas_clave_uq       on public.aperturas_caja (empresa_id, clave_apertura) where clave_apertura is not null;
create unique index if not exists cierres_numero_uq        on public.cierres_turno (empresa_id, numero_cierre) where numero_cierre is not null;
create index if not exists ventas_empresa_numero_idx       on public.ventas (empresa_id, numero);

-- Re-aplicación tras una reversión: si existe el esquema `respaldo_correlativos` (lo crea 09_correlativos_REVERSION.sql), se RESTAURAN
-- los folios, las claves y los contadores; así la numeración continúa (p. ej. en 61 tras 60 turnos) y nada se reutiliza.
-- (Mientras exista ese respaldo no renombrarlo: es lo que esta re-aplicación lee.) No se renumera ninguna fila.
do $$
begin
  if to_regclass('respaldo_correlativos.correlativos') is not null then
    perform set_config('app.turno_fn', '1', true);
    update public.ventas v set folio = b.folio, clave_idempotencia = b.clave_idempotencia
      from respaldo_correlativos.ventas b where v.id = b.id and v.folio is null and v.clave_idempotencia is null;
    update public.aperturas_caja t set numero_turno = b.numero_turno, clave_apertura = b.clave_apertura
      from respaldo_correlativos.aperturas_caja b where t.id = b.id and t.numero_turno is null and t.clave_apertura is null;
    -- cierres_turno es de solo-agregar: se suspende ese guardián solo durante esta restauración y se reactiva en la misma transacción.
    alter table public.cierres_turno disable trigger cierres_turno_inmutable;
    update public.cierres_turno c set numero_cierre = b.numero_cierre
      from respaldo_correlativos.cierres_turno b where c.id = b.id and c.numero_cierre is null;
    alter table public.cierres_turno enable trigger cierres_turno_inmutable;
    insert into public.correlativos (empresa_id, tipo, ultimo, updated_at)
      select empresa_id, tipo, ultimo, clock_timestamp() from respaldo_correlativos.correlativos
      on conflict (empresa_id, tipo) do update set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);
  end if;
end $$;

-- Siembra (nunca retrocede un contador): comandas continúan después del mayor número existente de cada negocio; turnos y cierres, después del mayor ya asignado.
insert into public.correlativos (empresa_id, tipo, ultimo)
  select empresa_id, 'comanda', max(numero) from public.ventas where empresa_id is not null and numero is not null group by empresa_id
  on conflict (empresa_id, tipo) do update set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);
insert into public.correlativos (empresa_id, tipo, ultimo)
  select empresa_id, 'turno', max(numero_turno) from public.aperturas_caja where empresa_id is not null and numero_turno is not null group by empresa_id
  on conflict (empresa_id, tipo) do update set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);
insert into public.correlativos (empresa_id, tipo, ultimo)
  select empresa_id, 'cierre', max(numero_cierre) from public.cierres_turno where empresa_id is not null and numero_cierre is not null group by empresa_id
  on conflict (empresa_id, tipo) do update set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);

-- Siguiente folio. SECURITY DEFINER para que el trigger funcione sea cual sea el rol que inserta; solo service_role puede llamarla directamente.
create or replace function public.correlativo_siguiente(p_empresa uuid, p_tipo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare n bigint;
begin
  if p_empresa is null then raise exception 'EMPRESA_REQUERIDA' using errcode = 'P0414'; end if;
  insert into public.correlativos (empresa_id, tipo, ultimo)
    values (p_empresa, p_tipo,
            case when p_tipo = 'comanda' then coalesce((select max(v.numero) from public.ventas v where v.empresa_id = p_empresa), 0) + 1 else 1 end)
    on conflict (empresa_id, tipo) do update set ultimo = public.correlativos.ultimo + 1, updated_at = clock_timestamp()
    returning ultimo into n;
  return n;
end $$;
revoke all on function public.correlativo_siguiente(uuid, text) from public, anon, authenticated;
grant execute on function public.correlativo_siguiente(uuid, text) to service_role;

create or replace function public.trg_venta_folio() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.empresa_id is null then return new; end if;
    new.folio := public.correlativo_siguiente(new.empresa_id, 'comanda');   -- lo que mande el cliente en numero/folio se ignora
    new.numero := new.folio;
    return new;
  end if;
  if new.folio is distinct from old.folio or (old.folio is not null and new.numero is distinct from old.numero) then
    raise exception 'FOLIO_INMUTABLE' using errcode = 'P0414', hint = 'El número de comanda no se puede cambiar';
  end if;
  return new;
end $$;
drop trigger if exists ventas_folio on public.ventas;
create trigger ventas_folio before insert or update of numero, folio on public.ventas
  for each row execute function public.trg_venta_folio();

drop function if exists public.turno_abrir(uuid, integer, text);
create or replace function public.turno_abrir(p_empresa uuid, p_fondo integer, p_cajero text, p_clave uuid default null)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_exist uuid; v_prev public.aperturas_caja; v_num bigint;
begin
  if p_fondo is null or p_fondo < 0 then return jsonb_build_object('ok', false, 'codigo', 'fondo_invalido'); end if;
  perform set_config('app.turno_fn', '1', true);
  perform pg_advisory_xact_lock(hashtextextended('turno_abrir:' || p_empresa::text, 0));
  -- Reintento / doble clic con la misma clave: devuelve ESE turno (sin crear otro ni gastar un número).
  if p_clave is not null then
    select * into v_prev from public.aperturas_caja where empresa_id = p_empresa and clave_apertura = p_clave;
    if found then
      return jsonb_build_object('ok', true, 'repetido', true, 'turno_id', v_prev.id, 'numero_turno', v_prev.numero_turno, 'estado', v_prev.estado);
    end if;
  end if;
  select id into v_exist from public.aperturas_caja where empresa_id = p_empresa and estado = 'abierta' and modelo = 'v2';
  if v_exist is not null then
    return jsonb_build_object('ok', false, 'codigo', 'ya_abierto', 'turno_id', v_exist,
                              'numero_turno', (select numero_turno from public.aperturas_caja where id = v_exist));
  end if;
  v_num := public.correlativo_siguiente(p_empresa, 'turno');   -- en la misma transacción: si algo falla, el número no se gasta
  insert into public.aperturas_caja (empresa_id, monto_inicial, cajero, estado, modelo, created_at, fecha, fecha_apertura, numero_turno, clave_apertura)
  values (p_empresa, p_fondo, coalesce(p_cajero,'Caja'), 'abierta', 'v2', clock_timestamp(),
          (clock_timestamp() at time zone 'America/Santiago')::date, (clock_timestamp() at time zone 'America/Santiago')::date, v_num, p_clave)
  returning id into v_id;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (p_empresa, v_id, 'turno_abierto', jsonb_build_object('fondo_contado', p_fondo, 'numero_turno', v_num), p_cajero);
  return jsonb_build_object('ok', true, 'repetido', false, 'turno_id', v_id, 'numero_turno', v_num);
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
        'apertura_at', t.created_at, 'cierre_at', t.cerrada_at, 'cajero', t.cajero, 'numero', t.numero_turno,
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
declare t public.aperturas_caja; r jsonb; ex jsonb; cie uuid; k text; esp int; con int; pend boolean; prev public.cierres_turno; bl jsonb; v_num bigint;
begin
  if p_clave is null then return jsonb_build_object('ok', false, 'codigo', 'falta_clave'); end if;
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2' for update;   -- serializa con cobros (FOR SHARE) y otros cierres
  if not found then return jsonb_build_object('ok', false, 'codigo', 'turno_no_encontrado'); end if;
  if t.estado <> 'abierta' then
    select * into prev from public.cierres_turno where turno_id = p_turno;
    if prev.id is not null and prev.clave_idempotencia = p_clave then
      return jsonb_build_object('ok', true, 'repetido', true, 'cierre_id', prev.id, 'numero_cierre', prev.numero_cierre, 'resumen', prev.resumen);
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
  v_num := public.correlativo_siguiente(t.empresa_id, 'cierre');   -- solo cuando el cierre realmente se guarda (un cierre bloqueado no gasta número)
  r := r || jsonb_build_object('numero_cierre', v_num);
  for k in select jsonb_object_keys(ex) loop
    if nullif(p_contados->>k, '') is null and (ex->>k)::int <> 0 then pend := true; end if;
  end loop;
  insert into public.cierres_turno (empresa_id, turno_id, clave_idempotencia, fecha_apertura, apertura_at, cierre_at, fondo_contado,
                                    cerrado_por, notas, con_pendientes, resumen, numero_cierre)
    values (t.empresa_id, p_turno, p_clave, t.fecha_apertura, t.created_at, t.cerrada_at, t.monto_inicial, p_por, p_notas, pend, r, v_num)
    returning id into cie;
  for k in select jsonb_object_keys(ex) loop
    esp := (ex->>k)::int;
    con := nullif(p_contados->>k, '')::int;
    insert into public.cierres_turno_medios (cierre_id, medio, esperado, contado, diferencia)
      values (cie, k, esp, con, case when con is null then null else con - esp end);
  end loop;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (t.empresa_id, p_turno, 'turno_cerrado', jsonb_build_object('cierre_id', cie, 'numero_cierre', v_num, 'con_pendientes', pend), p_por);
  -- Compatibilidad con reportes existentes (cierres_caja). Los cobros por conciliar NO se agrupan en QR.
  insert into public.cierres_caja (empresa_id, apertura_id, fecha, ventas_total, ventas_efectivo, ventas_debito, ventas_qr, ventas_transferencia,
                                   efectivo_fisico, diferencia, notas)
    values (t.empresa_id, p_turno, t.fecha_apertura,
            (r->'cobros'->>'efectivo')::int + (r->'cobros'->>'debito')::int + (r->'cobros'->>'credito')::int + (r->'cobros'->>'transferencia')::int
              + (r->'cobros'->>'qr')::int + (r->'cobros'->>'por_conciliar')::int,
            (r->'cobros'->>'efectivo')::int, (r->'cobros'->>'debito')::int + (r->'cobros'->>'credito')::int, (r->'cobros'->>'qr')::int,
            (r->'cobros'->>'transferencia')::int, (p_contados->>'efectivo')::int, (p_contados->>'efectivo')::int - (ex->>'efectivo')::int,
            coalesce(p_notas,''));
  return jsonb_build_object('ok', true, 'repetido', false, 'cierre_id', cie, 'numero_cierre', v_num, 'con_pendientes', pend, 'resumen', r);
end $$;

revoke all on function public.turno_abrir(uuid,integer,text,uuid), public.turno_resumen(uuid), public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.turno_abrir(uuid,integer,text,uuid), public.turno_resumen(uuid), public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb)
  to service_role;

commit;
