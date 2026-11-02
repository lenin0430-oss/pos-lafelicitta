-- MesaPOS · 07 — Cierre de acceso público a datos privados (RLS + permisos). PROPUESTA: NO APLICADA. Una sola transacción.
-- PRERREQUISITO OBLIGATORIO: el código de esta rama ya desplegado con NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1 y verificado
-- (login, caja, cocina, cierre, Point). Si se aplica antes, el navegador pierde acceso y el negocio NO opera.
--
-- Qué hace (por defecto TODO se cierra; solo se abre lo explícito):
--  1) Guarda el estado anterior (políticas, RLS, privilegios, ejecución de funciones) en permisos_respaldo_07 (solo la primera vez).
--  2) En TODAS las tablas de public: activa RLS, elimina TODAS las políticas existentes y retira los privilegios de anon, authenticated y PUBLIC.
--  3) Reabre solo la carta pública: productos (disponible = true), categorias y empresas (solo columnas no sensibles) para lectura.
--  4) usuarios: solo la propia fila para un usuario autenticado de Supabase Auth, sin la columna pin.
--  5) Funciones de public (verificar_pin_garzon, verificar_login_admin, …): solo service_role puede ejecutarlas (cierra la fuerza bruta de PIN con la llave pública).
--  6) Privilegios por defecto: las tablas nuevas ya no nacen abiertas a anon/authenticated.
-- service_role (llave de servidor) no se toca: ignora RLS y mantiene sus privilegios.
-- Reversión de emergencia (restaura el acceso anterior, que es INSEGURO): 07_permisos_REVERSION_EMERGENCIA.sql
begin;

create table if not exists permisos_respaldo_07 (id bigserial primary key, creado timestamptz not null default now(), tipo text not null, objeto text not null, detalle jsonb not null);
alter table permisos_respaldo_07 enable row level security;
revoke all on permisos_respaldo_07 from public, anon, authenticated;

do $$
declare privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  if exists (select 1 from permisos_respaldo_07) then return; end if;   -- el primer respaldo nunca se pisa
  insert into permisos_respaldo_07 (tipo, objeto, detalle)
  select 'tabla', c.relname, jsonb_build_object('rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
      'anon', coalesce((select jsonb_agg(p) from unnest(privs) p where has_table_privilege('anon', c.oid, p)), '[]'::jsonb),
      'authenticated', coalesce((select jsonb_agg(p) from unnest(privs) p where has_table_privilege('authenticated', c.oid, p)), '[]'::jsonb))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p') and c.relname <> 'permisos_respaldo_07';
  insert into permisos_respaldo_07 (tipo, objeto, detalle)
  select 'politica', tablename || '.' || policyname, to_jsonb(p) from pg_policies p where schemaname = 'public';
  insert into permisos_respaldo_07 (tipo, objeto, detalle)
  select 'funcion', f.oid::regprocedure::text,
         jsonb_build_object('anon', has_function_privilege('anon', f.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
                            'publico', (f.proacl is null or exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')))
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and f.prokind = 'f' and f.prorettype <> 'trigger'::regtype;
  insert into permisos_respaldo_07 (tipo, objeto, detalle)
  select 'secuencia', c.relname, jsonb_build_object('anon', has_sequence_privilege('anon', c.oid, 'USAGE'), 'authenticated', has_sequence_privilege('authenticated', c.oid, 'USAGE'))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S';
end $$;

-- 2) Cierre general (por defecto: nada abierto)
do $$
declare t record; p record; f record; s record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') and c.relname <> 'permisos_respaldo_07' loop
    execute format('alter table public.%I enable row level security', t.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.relname loop
      execute format('drop policy %I on public.%I', p.policyname, t.relname);
    end loop;
    execute format('revoke all on table public.%I from public, anon, authenticated', t.relname);
  end loop;
  for f in select fp.oid::regprocedure as firma from pg_proc fp join pg_namespace n on n.oid = fp.pronamespace
            where n.nspname = 'public' and fp.prokind = 'f' and fp.prorettype <> 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
  end loop;
  for s in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S' loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', s.relname);
  end loop;
end $$;

-- 3) Carta pública (lectura)
do $$
declare cols text;
begin
  if to_regclass('public.productos') is not null then
    create policy productos_lectura_publica on public.productos for select to anon, authenticated using (disponible is true);
    grant select on public.productos to anon, authenticated;
  end if;
  if to_regclass('public.categorias') is not null then
    create policy categorias_lectura_publica on public.categorias for select to anon, authenticated using (true);
    grant select on public.categorias to anon, authenticated;
  end if;
  if to_regclass('public.empresas') is not null then
    create policy empresas_lectura_publica on public.empresas for select to anon, authenticated using (true);
    select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
     where table_schema = 'public' and table_name = 'empresas' and column_name in ('id','nombre','slug','logo_url','color_primario','ciudad','activo');
    if cols is not null then execute format('grant select (%s) on public.empresas to anon, authenticated', cols); end if;
  end if;
  -- 4) usuarios: solo la propia fila (Supabase Auth), sin pin
  if to_regclass('public.usuarios') is not null then
    create policy usuarios_propia_fila on public.usuarios for select to authenticated using (id = auth.uid());
    select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
     where table_schema = 'public' and table_name = 'usuarios' and column_name in ('id','nombre','email','rol','empresa_id','activo');
    if cols is not null then execute format('grant select (%s) on public.usuarios to authenticated', cols); end if;
  end if;
end $$;

-- 6) Tablas, funciones y secuencias nuevas ya no nacen abiertas
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;
