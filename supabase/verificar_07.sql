-- MesaPOS · verificación SOLO LECTURA del cierre de acceso (07). Después de aplicarlo, los bloques B, C y D deben salir vacíos.
-- A) Estado por tabla de public
select c.relname as tabla, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
       has_table_privilege('anon', c.oid, 'select') as anon_select, has_table_privilege('anon', c.oid, 'insert') as anon_insert,
       has_table_privilege('anon', c.oid, 'update') as anon_update, has_table_privilege('anon', c.oid, 'delete') as anon_delete,
       has_table_privilege('authenticated', c.oid, 'insert') as auth_insert, has_table_privilege('authenticated', c.oid, 'update') as auth_update
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') order by 1;
-- B) Tablas privadas con escritura abierta a anon/authenticated (debe salir vacío)
select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p')
   and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'));
-- C) Lectura abierta a anon fuera de la carta pública (debe salir vacío)
select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and has_table_privilege('anon', c.oid, 'select') and c.relname not in ('productos','categorias','empresas');
-- D) Políticas públicas de escritura o de lectura total sobre tablas privadas, y funciones ejecutables por anon (debe salir vacío)
select 'politica' as tipo, tablename || '.' || policyname as objeto from pg_policies
 where schemaname = 'public' and (roles::text ~ '(public|anon)') and (cmd <> 'SELECT' or tablename not in ('productos','categorias','empresas'))
union all
select 'funcion', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'EXECUTE');
