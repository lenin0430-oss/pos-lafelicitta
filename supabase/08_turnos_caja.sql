-- 08_turnos_caja.sql — Turnos de caja, cobros por medio, retiros y cierre auditable.
-- Aplicar SOLO en mesapos-pruebas-aislado hasta autorización expresa. Una sola transacción.
-- Reglas de negocio (confirmadas por el dueño):
--  * El turno empieza al abrir (hacia las 11:00) y termina SOLO con "Cerrar turno" (00:00–01:00 del día siguiente).
--  * A las 00:00 no se reinicia nada: no existe ninguna lógica por fecha/medianoche en estas funciones.
--  * El turno se identifica por fecha de apertura (hora de Chile) + hora real de apertura y de cierre.
--  * No se modifica ni se infiere ningún dato histórico: esta migración no hace UPDATE sobre filas existentes.
begin;

-- ───────── 0. Precondición: no puede haber dos turnos "abiertos" por negocio ─────────
alter table public.aperturas_caja
  add column if not exists modelo text not null default 'legacy',
  add column if not exists fecha_apertura date,
  add column if not exists cerrada_por text;
alter table public.aperturas_caja drop constraint if exists aperturas_caja_modelo_chk;
alter table public.aperturas_caja add constraint aperturas_caja_modelo_chk check (modelo in ('legacy','v2'));
create unique index if not exists aperturas_caja_un_turno_abierto_v2
  on public.aperturas_caja (empresa_id) where estado = 'abierta' and modelo = 'v2';

-- ───────── 1. Columnas de enlace al turno ─────────
alter table public.ventas   add column if not exists turno_id uuid references public.aperturas_caja(id);
alter table public.pagos_point add column if not exists medio_reportado text;  -- efectivo|debito|credito|qr (solo si Mercado Pago lo informó)
create index if not exists ventas_turno_idx on public.ventas (turno_id);
create index if not exists gastos_apertura_idx on public.gastos (apertura_id);
create index if not exists propinas_apertura_idx on public.propinas (apertura_id);

-- ───────── 2. Tablas nuevas (RLS cerrada, sin políticas: solo service_role) ─────────
create table if not exists public.cobros_turno (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  turno_id uuid references public.aperturas_caja(id),      -- NULL = cobro sin turno abierto (se informa, no se oculta)
  venta_id uuid not null references public.ventas(id),
  medio text not null check (medio in ('efectivo','debito','credito','transferencia','qr','por_conciliar','cortesia')),
  proveedor text not null default 'manual' check (proveedor in ('manual','point')),
  monto integer not null check (monto >= 0),
  referencia text,
  conciliado_por text,
  conciliado_at timestamptz,
  anulado_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (venta_id, medio)
);
create index if not exists cobros_turno_turno_idx on public.cobros_turno (turno_id);

create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  turno_id uuid not null references public.aperturas_caja(id),
  tipo text not null check (tipo in ('retiro')),            -- salida de efectivo que NO es gasto (entrega al dueño/Adriana, etc.)
  monto integer not null check (monto > 0),
  motivo text not null,
  entregado_a text,
  registrado_por text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists movimientos_caja_turno_idx on public.movimientos_caja (turno_id);

create table if not exists public.cierres_turno (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  turno_id uuid not null unique references public.aperturas_caja(id),
  clave_idempotencia uuid not null,
  fecha_apertura date not null,
  apertura_at timestamptz not null,
  cierre_at timestamptz not null,
  fondo_contado integer not null,
  cerrado_por text,
  notas text,
  con_pendientes boolean not null default false,
  resumen jsonb not null,                                  -- instantánea recalculada en el servidor al confirmar
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.cierres_turno_medios (
  cierre_id uuid not null references public.cierres_turno(id),
  medio text not null,
  esperado integer not null,
  contado integer,                                          -- NULL = no comprobado
  diferencia integer,                                       -- contado - esperado; NULL si no comprobado
  primary key (cierre_id, medio)
);
create table if not exists public.turno_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid,
  turno_id uuid,
  evento text not null,
  detalle jsonb not null default '{}'::jsonb,
  actor text,
  at timestamptz not null default clock_timestamp()
);

-- Historial inmutable: nadie actualiza ni borra cierres ni eventos.
create or replace function public.turno_solo_agregar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'REGISTRO_INMUTABLE' using errcode = 'P0410'; end $$;
drop trigger if exists cierres_turno_inmutable on public.cierres_turno;
create trigger cierres_turno_inmutable before update or delete on public.cierres_turno for each row execute function public.turno_solo_agregar();
drop trigger if exists cierres_turno_medios_inmutable on public.cierres_turno_medios;
create trigger cierres_turno_medios_inmutable before update or delete on public.cierres_turno_medios for each row execute function public.turno_solo_agregar();
drop trigger if exists turno_eventos_inmutable on public.turno_eventos;
create trigger turno_eventos_inmutable before update or delete on public.turno_eventos for each row execute function public.turno_solo_agregar();

alter table public.cobros_turno enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.cierres_turno enable row level security;
alter table public.cierres_turno_medios enable row level security;
alter table public.turno_eventos enable row level security;
revoke all on public.cobros_turno, public.movimientos_caja, public.cierres_turno, public.cierres_turno_medios, public.turno_eventos from public, anon, authenticated;
grant all on public.cobros_turno, public.movimientos_caja, public.cierres_turno, public.cierres_turno_medios, public.turno_eventos to service_role;
grant usage, select on sequence public.turno_eventos_id_seq to service_role;

-- ───────── 3. Interpretar metodo_pago → partes por medio ─────────
create or replace function public._partes_cobro(p_metodo text, p_total integer)
returns table (medio text, proveedor text, monto integer)
language plpgsql immutable set search_path = public, pg_temp as $$
declare m text := translate(lower(btrim(coalesce(p_metodo,''))), 'áéíóú', 'aeiou'); r record; suma integer := 0;
begin
  if m = 'efectivo' then return query select 'efectivo','manual',p_total; return; end if;
  if m = 'debito' then return query select 'debito','manual',p_total; return; end if;
  if m = 'credito' then return query select 'credito','manual',p_total; return; end if;
  if m = 'transferencia' then return query select 'transferencia','manual',p_total; return; end if;
  if m = 'qr' then return query select 'qr','manual',p_total; return; end if;
  if m = 'cortesia' then return query select 'cortesia','manual',p_total; return; end if;
  if m in ('point','mercado pago','mercadopago') then return query select 'por_conciliar','point',p_total; return; end if;
  if m like 'mixto%' then
    for r in select lower(translate(x[1],'áéíóú','aeiou')) as medio, regexp_replace(x[2],'[^0-9]','','g')::integer as monto
             from regexp_matches(p_metodo, '(Efectivo|D[eé]bito|Cr[eé]dito|Transferencia)\s*\$?\s*([0-9][0-9\.]*)', 'gi') as x loop
      return query select r.medio, 'manual', r.monto; suma := suma + r.monto;
    end loop;
    if suma <> p_total then return query select 'por_conciliar','manual',(p_total - suma); end if;  -- diferencia visible, nunca se asigna a efectivo
    return;
  end if;
  return query select 'por_conciliar','manual',p_total;   -- método desconocido: pendiente, no se adivina
end $$;

-- ───────── 4. Asignar cobros / gastos / propinas al turno abierto (serializado con el cierre) ─────────
create or replace function public._turno_abierto(p_empresa uuid) returns uuid
language sql set search_path = public, pg_temp as $$
  select id from public.aperturas_caja
   where empresa_id = p_empresa and estado = 'abierta' and modelo = 'v2'
   for share
$$;

create or replace function public.trg_cobro_a_turno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_turno uuid; v_medio_point text; p record; v_anulado boolean := false;
begin
  if new.empresa_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.estado_pago = 'pagado' and new.estado_pago is distinct from 'pagado' then
    update public.cobros_turno set anulado_at = clock_timestamp() where venta_id = new.id and anulado_at is null;
    insert into public.turno_eventos(empresa_id, turno_id, evento, detalle)
      values (new.empresa_id, new.turno_id, 'cobro_anulado', jsonb_build_object('venta_id', new.id, 'nuevo_estado_pago', new.estado_pago));
    return new;
  end if;
  if new.estado_pago not in ('pagado','cortesia') then return new; end if;
  if tg_op = 'UPDATE' and old.estado_pago in ('pagado','cortesia') then return new; end if;   -- ya registrado
  v_turno := public._turno_abierto(new.empresa_id);
  new.turno_id := v_turno;
  select medio_reportado into v_medio_point from public.pagos_point
    where venta_id = new.id::text and estado = 'processed' and medio_reportado is not null order by updated_at desc limit 1;
  for p in select * from public._partes_cobro(new.metodo_pago, new.total) loop
    insert into public.cobros_turno (empresa_id, turno_id, venta_id, medio, proveedor, monto)
    values (new.empresa_id, v_turno,
            new.id,
            case when p.proveedor = 'point' and v_medio_point is not null then v_medio_point else p.medio end,
            p.proveedor, p.monto)
    on conflict (venta_id, medio) do nothing;
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

create or replace function public.trg_gasto_propina_a_turno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.apertura_id is null and new.empresa_id is not null then
    new.apertura_id := public._turno_abierto(new.empresa_id);
  end if;
  return new;
end $$;
drop trigger if exists gastos_a_turno on public.gastos;
create trigger gastos_a_turno before insert on public.gastos for each row execute function public.trg_gasto_propina_a_turno();
drop trigger if exists propinas_a_turno on public.propinas;
create trigger propinas_a_turno before insert on public.propinas for each row execute function public.trg_gasto_propina_a_turno();

-- ───────── 5. Funciones de turno ─────────
create or replace function public.turno_abrir(p_empresa uuid, p_fondo integer, p_cajero text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_exist uuid;
begin
  if p_fondo is null or p_fondo < 0 then return jsonb_build_object('ok', false, 'codigo', 'fondo_invalido'); end if;
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
  g_caja int; g_otros int; ret int; prop int; n_pc int; n_pend int;
begin
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2';
  if not found then return null; end if;
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
  select count(*) into n_pend from public.ventas
    where empresa_id = t.empresa_id and estado_pago in ('pendiente','sin_identificar') and created_at >= t.created_at and created_at <= fin;
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
    'pendientes', jsonb_build_object('cobros_por_conciliar', n_pc, 'monto_por_conciliar', c_pc, 'ventas_sin_cobrar', n_pend)
  );
end $$;

create or replace function public.movimiento_registrar(p_turno uuid, p_monto integer, p_motivo text, p_entregado_a text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare t public.aperturas_caja; v_id uuid;
begin
  select * into t from public.aperturas_caja where id = p_turno and modelo = 'v2' for share;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'turno_no_encontrado'); end if;
  if t.estado <> 'abierta' then return jsonb_build_object('ok', false, 'codigo', 'turno_cerrado'); end if;
  if p_monto is null or p_monto <= 0 then return jsonb_build_object('ok', false, 'codigo', 'monto_invalido'); end if;
  if coalesce(btrim(p_motivo),'') = '' then return jsonb_build_object('ok', false, 'codigo', 'motivo_requerido'); end if;
  insert into public.movimientos_caja (empresa_id, turno_id, tipo, monto, motivo, entregado_a, registrado_por)
    values (t.empresa_id, p_turno, 'retiro', p_monto, p_motivo, p_entregado_a, p_por) returning id into v_id;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (t.empresa_id, p_turno, 'retiro', jsonb_build_object('monto', p_monto, 'motivo', p_motivo, 'entregado_a', p_entregado_a), p_por);
  return jsonb_build_object('ok', true, 'movimiento_id', v_id);
end $$;

-- Conciliar un cobro "por conciliar" (Point sin medio informado) con el medio real del comprobante.
create or replace function public.cobro_conciliar(p_cobro uuid, p_medio text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare c public.cobros_turno; t public.aperturas_caja;
begin
  if p_medio not in ('efectivo','debito','credito','qr','transferencia') then return jsonb_build_object('ok', false, 'codigo', 'medio_invalido'); end if;
  select * into c from public.cobros_turno where id = p_cobro for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); end if;
  if c.medio <> 'por_conciliar' then return jsonb_build_object('ok', false, 'codigo', 'ya_conciliado'); end if;
  select * into t from public.aperturas_caja where id = c.turno_id for share;
  if t.id is null or t.estado <> 'abierta' then return jsonb_build_object('ok', false, 'codigo', 'turno_cerrado'); end if;
  if exists (select 1 from public.cobros_turno where venta_id = c.venta_id and medio = p_medio and id <> c.id) then
    return jsonb_build_object('ok', false, 'codigo', 'medio_duplicado_en_venta');
  end if;
  update public.cobros_turno set medio = p_medio, conciliado_por = p_por, conciliado_at = clock_timestamp() where id = c.id;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (c.empresa_id, c.turno_id, 'cobro_conciliado', jsonb_build_object('cobro_id', c.id, 'venta_id', c.venta_id, 'monto', c.monto, 'medio', p_medio), p_por);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.turno_cerrar(p_turno uuid, p_contados jsonb, p_notas text, p_clave uuid, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare t public.aperturas_caja; r jsonb; ex jsonb; cie uuid; k text; esp int; con int; pend boolean; prev public.cierres_turno;
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
  if p_contados is null or (p_contados->>'efectivo') is null or (p_contados->>'efectivo')::int < 0 then
    return jsonb_build_object('ok', false, 'codigo', 'falta_efectivo_contado');
  end if;
  r := public.turno_resumen(p_turno);        -- recalculado aquí, con lo que hay guardado; nada viene del navegador
  ex := r->'esperado';
  pend := (r->'pendientes'->>'cobros_por_conciliar')::int > 0 or (r->'pendientes'->>'ventas_sin_cobrar')::int > 0;
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

revoke all on function public._partes_cobro(text,integer), public._turno_abierto(uuid), public.turno_abrir(uuid,integer,text),
  public.turno_resumen(uuid), public.movimiento_registrar(uuid,integer,text,text,text), public.cobro_conciliar(uuid,text,text),
  public.turno_cerrar(uuid,jsonb,text,uuid,text) from public, anon, authenticated;
grant execute on function public._partes_cobro(text,integer), public._turno_abierto(uuid), public.turno_abrir(uuid,integer,text),
  public.turno_resumen(uuid), public.movimiento_registrar(uuid,integer,text,text,text), public.cobro_conciliar(uuid,text,text),
  public.turno_cerrar(uuid,jsonb,text,uuid,text) to service_role;

commit;
