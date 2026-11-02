-- MesaPOS · 07b — Tablas y funciones de SEGURIDAD que usa el código de la rama claude/permisos-2026-11-02:
--   (1) aprobaciones_operacion: aprobación de administrador, de UN SOLO USO, ligada a negocio, empleado, importe y operación (gastos grandes);
--   (2) intentos_login: contador PERSISTENTE de fallos de login (por IP y por cuenta), compartido entre instancias del servidor;
--   (3) eventos_seguridad: bitácora sin PIN ni datos personales (hash de IP, tipo, negocio, resultado);
--   (4) usuarios.pin_hash: columna NUEVA y VACÍA para el hash del PIN (NO cambia ni lee ningún PIN real).
-- PROPUESTA: NO APLICADA. Solo agrega objetos nuevos (no modifica datos existentes). Orden de aplicación: 07b → 07a → 07.
-- Todo queda cerrado a anon/authenticated: solo service_role (llave de servidor) puede usarlo.
begin;

create table if not exists public.aprobaciones_operacion (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,          -- sha256 del token; el token en claro solo lo ve quien aprobó
  empresa_id  text not null,
  tipo        text not null,                 -- p. ej. 'gasto'
  actor       text not null,                 -- empleado que pidió la operación (de la sesión del servidor)
  aprobador   text not null,                 -- administrador que ingresó su PIN
  monto       bigint not null check (monto > 0),
  huella      text not null,                 -- sha256 de categoría+descripción: la aprobación solo vale para ESTA operación
  creada_en   timestamptz not null default now(),
  expira_en   timestamptz not null,
  usada_en    timestamptz
);
create table if not exists public.intentos_login (
  clave            text primary key,         -- 'ip:<hash>' | 'cuenta:<hash>' | 'pin-admin:<empresa>:<empleado>'
  n                integer not null default 0,
  ventana_inicio   timestamptz not null default now(),
  bloqueado_hasta  timestamptz,
  bloqueos         integer not null default 0,
  actualizado      timestamptz not null default now()
);
create table if not exists public.eventos_seguridad (
  id          bigserial primary key,
  creado_en   timestamptz not null default now(),
  tipo        text not null,
  resultado   text not null,
  empresa_id  text,
  actor       text,
  ip_hash     text
);
create index if not exists eventos_seguridad_creado_idx on public.eventos_seguridad (creado_en);
create index if not exists aprobaciones_operacion_exp_idx on public.aprobaciones_operacion (expira_en);

do $$ begin
  if to_regclass('public.usuarios') is not null then
    alter table public.usuarios add column if not exists pin_hash text;
  end if;
end $$;

alter table public.aprobaciones_operacion enable row level security;
alter table public.intentos_login enable row level security;
alter table public.eventos_seguridad enable row level security;
revoke all on public.aprobaciones_operacion, public.intentos_login, public.eventos_seguridad from public, anon, authenticated;
revoke all on sequence public.eventos_seguridad_id_seq from public, anon, authenticated;
grant all on public.aprobaciones_operacion, public.intentos_login, public.eventos_seguridad to service_role;
grant all on sequence public.eventos_seguridad_id_seq to service_role;

-- Cuenta un FALLO y devuelve hasta cuándo está bloqueada la clave (null = no bloqueada). Atómico (una sentencia).
-- Bloqueo progresivo: cada bloqueo sucesivo dura el doble (tope 24 h). La ventana de conteo se reinicia sola.
create or replace function public.registrar_fallo_login(p_clave text, p_max integer, p_ventana_s integer, p_bloqueo_s integer)
returns timestamptz language plpgsql security invoker set search_path = public, pg_temp as $$
declare r public.intentos_login;
begin
  if p_clave is null or length(p_clave) > 200 or p_max < 1 or p_ventana_s < 1 or p_bloqueo_s < 1 then raise exception 'parametros invalidos'; end if;
  insert into public.intentos_login as t (clave, n, ventana_inicio, actualizado) values (p_clave, 1, now(), now())
  on conflict (clave) do update set
    n = case when t.ventana_inicio < now() - make_interval(secs => p_ventana_s) and (t.bloqueado_hasta is null or t.bloqueado_hasta < now()) then 1 else t.n + 1 end,
    ventana_inicio = case when t.ventana_inicio < now() - make_interval(secs => p_ventana_s) and (t.bloqueado_hasta is null or t.bloqueado_hasta < now()) then now() else t.ventana_inicio end,
    actualizado = now()
  returning * into r;
  if r.n >= p_max and (r.bloqueado_hasta is null or r.bloqueado_hasta < now()) then
    update public.intentos_login set bloqueos = bloqueos + 1, n = 0, ventana_inicio = now(),
      bloqueado_hasta = now() + make_interval(secs => least(p_bloqueo_s * (2 ^ least(bloqueos, 8))::integer, 86400))
    where clave = p_clave returning * into r;
  end if;
  delete from public.intentos_login where actualizado < now() - interval '3 days' and (bloqueado_hasta is null or bloqueado_hasta < now());
  return case when r.bloqueado_hasta > now() then r.bloqueado_hasta else null end;
end $$;

create or replace function public.login_bloqueado_hasta(p_clave text)
returns timestamptz language sql stable security invoker set search_path = public, pg_temp as $$
  select bloqueado_hasta from public.intentos_login where clave = p_clave and bloqueado_hasta > now()
$$;

-- Éxito: borra el contador de la CUENTA (no el de la IP, para que quien tenga una cuenta válida no reinicie el límite por IP).
create or replace function public.limpiar_intentos_login(p_clave text)
returns void language sql security invoker set search_path = public, pg_temp as $$
  delete from public.intentos_login where clave = p_clave
$$;

-- Consume una aprobación: solo si coincide token, negocio, tipo, empleado, importe y operación, no venció y no se usó. Atómico y de un solo uso.
create or replace function public.consumir_aprobacion(p_token_hash text, p_empresa text, p_tipo text, p_actor text, p_monto bigint, p_huella text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare n integer;
begin
  update public.aprobaciones_operacion set usada_en = now()
   where token_hash = p_token_hash and empresa_id = p_empresa and tipo = p_tipo and actor = p_actor and monto = p_monto and huella = p_huella
     and usada_en is null and expira_en > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.registrar_fallo_login(text, integer, integer, integer), public.login_bloqueado_hasta(text), public.limpiar_intentos_login(text),
  public.consumir_aprobacion(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.registrar_fallo_login(text, integer, integer, integer), public.login_bloqueado_hasta(text), public.limpiar_intentos_login(text),
  public.consumir_aprobacion(text, text, text, text, bigint, text) to service_role;
commit;
