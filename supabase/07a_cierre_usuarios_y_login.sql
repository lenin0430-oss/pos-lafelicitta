-- MesaPOS · 07a — ETAPA 1 (la más urgente y de menor riesgo): cierra `usuarios` (PIN/credenciales) y las funciones de login a la llave pública.
-- PROPUESTA: NO APLICADA. Una sola transacción. NO cierra ventas ni el resto (eso es 07, etapa 2, con el código en modo servidor).
-- PRERREQUISITO: desplegada la rama claude/permisos-2026-11-02 (PIN de admin verificado en el servidor, login ya por servidor con llave de servicio).
-- Efecto conocido: la pantalla /admin/nueva-empresa (alta de negocios) deja de funcionar hasta activar el modo servidor (etapa 2) y definir PLATAFORMA_EMPRESA_ID.
-- Qué hace: (1) respalda el estado anterior de usuarios y de las funciones; (2) usuarios: activa RLS, quita políticas y privilegios de anon/authenticated y deja
--   solo "la propia fila, sin pin" para usuarios de Supabase Auth; (3) funciones de public: solo service_role puede ejecutarlas.
-- Reversión de emergencia: 07a_cierre_usuarios_y_login_REVERSION_EMERGENCIA.sql (restaura el acceso anterior, INSEGURO).
begin;
create table if not exists permisos_respaldo_07a (id bigserial primary key, creado timestamptz not null default now(), tipo text not null, objeto text not null, detalle jsonb not null);
alter table permisos_respaldo_07a enable row level security;
revoke all on permisos_respaldo_07a from public, anon, authenticated;

do $$
declare privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  if exists (select 1 from permisos_respaldo_07a) then return; end if;
  insert into permisos_respaldo_07a (tipo, objeto, detalle)
  select 'tabla', c.relname, jsonb_build_object('rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
      'anon', coalesce((select jsonb_agg(p) from unnest(privs) p where has_table_privilege('anon', c.oid, p)), '[]'::jsonb),
      'authenticated', coalesce((select jsonb_agg(p) from unnest(privs) p where has_table_privilege('authenticated', c.oid, p)), '[]'::jsonb))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'usuarios';
  insert into permisos_respaldo_07a (tipo, objeto, detalle)
  select 'politica', tablename || '.' || policyname, to_jsonb(p) from pg_policies p where schemaname = 'public' and tablename = 'usuarios';
  insert into permisos_respaldo_07a (tipo, objeto, detalle)
  select 'funcion', f.oid::regprocedure::text,
         jsonb_build_object('anon', has_function_privilege('anon', f.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
                            'publico', (f.proacl is null or exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')))
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace where n.nspname = 'public' and f.prokind = 'f' and f.prorettype <> 'trigger'::regtype;
end $$;

do $$
declare pol record; fn record; cols text;
begin
  if to_regclass('public.usuarios') is not null then
    alter table public.usuarios enable row level security;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'usuarios' loop execute format('drop policy %I on public.usuarios', pol.policyname); end loop;
    revoke all on table public.usuarios from public, anon, authenticated;
    create policy usuarios_propia_fila on public.usuarios for select to authenticated using (id = auth.uid());
    select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
     where table_schema = 'public' and table_name = 'usuarios' and column_name in ('id','nombre','email','rol','empresa_id','activo');
    if cols is not null then execute format('grant select (%s) on public.usuarios to authenticated', cols); end if;
  end if;
  for fn in select fp.oid::regprocedure as firma from pg_proc fp join pg_namespace n on n.oid = fp.pronamespace
             where n.nspname = 'public' and fp.prokind = 'f' and fp.prorettype <> 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.firma);
    execute format('grant execute on function %s to service_role', fn.firma);
  end loop;
end $$;
commit;
