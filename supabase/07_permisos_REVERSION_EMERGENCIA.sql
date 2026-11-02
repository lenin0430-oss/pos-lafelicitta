-- MesaPOS · 07 REVERSIÓN DE EMERGENCIA — RESTAURA EL ACCESO PÚBLICO ANTERIOR, QUE ES INSEGURO.
-- Úsala solo si el cierre dejó al negocio sin operar y no hay otra salida; después hay que volver a cerrar (07) cuanto antes.
-- Restaura desde permisos_respaldo_07 (políticas, RLS, privilegios, funciones, secuencias). No toca datos. Una sola transacción.
begin;
do $$
declare r record; p record; q text; priv text; rol text;
begin
  if not exists (select 1 from permisos_respaldo_07) then raise exception 'No hay respaldo en permisos_respaldo_07: no se puede revertir'; end if;
  for r in select objeto from permisos_respaldo_07 where tipo = 'tabla' and to_regclass('public.' || quote_ident(objeto)) is not null loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = r.objeto loop execute format('drop policy %I on public.%I', p.policyname, r.objeto); end loop;
  end loop;
  for r in select objeto, detalle from permisos_respaldo_07 where tipo = 'tabla' and to_regclass('public.' || quote_ident(objeto)) is not null loop
    execute format('alter table public.%I %s row level security', r.objeto, case when (r.detalle->>'rls')::boolean then 'enable' else 'disable' end);
    execute format('alter table public.%I %s row level security', r.objeto, case when (r.detalle->>'force')::boolean then 'force' else 'no force' end);
    execute format('revoke all on table public.%I from anon, authenticated', r.objeto);
    for rol in select unnest(array['anon','authenticated']) loop
      for priv in select jsonb_array_elements_text(r.detalle->rol) loop
        execute format('grant %s on table public.%I to %I', priv, r.objeto, rol);
      end loop;
    end loop;
  end loop;
  for r in select detalle from permisos_respaldo_07 where tipo = 'politica' and to_regclass('public.' || quote_ident(detalle->>'tablename')) is not null loop
    q := format('create policy %I on public.%I as %s for %s to %s', r.detalle->>'policyname', r.detalle->>'tablename', r.detalle->>'permissive', r.detalle->>'cmd',
           (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from jsonb_array_elements_text(r.detalle->'roles') x));
    if r.detalle->>'qual' is not null then q := q || ' using (' || (r.detalle->>'qual') || ')'; end if;
    if r.detalle->>'with_check' is not null then q := q || ' with check (' || (r.detalle->>'with_check') || ')'; end if;
    execute q;
  end loop;
  for r in select objeto, detalle from permisos_respaldo_07 where tipo = 'funcion' loop
    begin
      if (r.detalle->>'publico')::boolean then execute format('grant execute on function %s to public', r.objeto); end if;
      if (r.detalle->>'anon')::boolean then execute format('grant execute on function %s to anon', r.objeto); end if;
      if (r.detalle->>'authenticated')::boolean then execute format('grant execute on function %s to authenticated', r.objeto); end if;
    exception when undefined_function then null; end;
  end loop;
  for r in select objeto, detalle from permisos_respaldo_07 where tipo = 'secuencia' and to_regclass('public.' || quote_ident(objeto)) is not null loop
    if (r.detalle->>'anon')::boolean then execute format('grant usage, select on sequence public.%I to anon', r.objeto); end if;
    if (r.detalle->>'authenticated')::boolean then execute format('grant usage, select on sequence public.%I to authenticated', r.objeto); end if;
  end loop;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
commit;
