-- 13 · Gastos pagados por un trabajador con su dinero y su devolución desde la caja.
-- gastos.pagado_por = nombre del trabajador que puso la plata (NULL = salió de la caja o de otro medio del negocio).
-- La deuda con cada trabajador = sus gastos − lo ya devuelto. Devolver = un retiro de caja (movimiento_registrar) + un registro aquí.
-- Los gastos NO se modifican al devolver (los de turnos cerrados no se pueden tocar).
begin;

alter table public.gastos add column if not exists pagado_por text;
create index if not exists gastos_pagado_por_idx on public.gastos (empresa_id, pagado_por) where pagado_por is not null;

create table if not exists public.reembolsos_trabajador (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  persona text not null,
  monto integer not null check (monto > 0),
  turno_id uuid,
  movimiento_id uuid,
  registrado_por text,
  created_at timestamptz not null default now()
);
alter table public.reembolsos_trabajador enable row level security;
create index if not exists reembolsos_trabajador_idx on public.reembolsos_trabajador (empresa_id, persona);

create or replace function public.reembolsos_pendientes(p_empresa uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with g as (select btrim(pagado_por) persona, sum(monto)::bigint total, count(*) n from public.gastos
             where empresa_id = p_empresa and coalesce(btrim(pagado_por), '') <> '' group by 1),
       r as (select persona, sum(monto)::bigint devuelto from public.reembolsos_trabajador where empresa_id = p_empresa group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('persona', g.persona, 'gastado', g.total, 'devuelto', coalesce(r.devuelto, 0),
                                               'pendiente', g.total - coalesce(r.devuelto, 0), 'gastos', g.n) order by g.persona), '[]'::jsonb)
  from g left join r on r.persona = g.persona
  where g.total - coalesce(r.devuelto, 0) > 0;
$$;

create or replace function public.reembolso_pagar(p_empresa uuid, p_persona text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_persona text := btrim(coalesce(p_persona, '')); v_pend bigint; v_turno uuid; r jsonb;
begin
  if v_persona = '' then return jsonb_build_object('ok', false, 'codigo', 'persona_requerida'); end if;
  perform pg_advisory_xact_lock(hashtext('reembolso:' || p_empresa::text || ':' || v_persona));
  select coalesce((select sum(monto) from public.gastos where empresa_id = p_empresa and btrim(pagado_por) = v_persona), 0)
       - coalesce((select sum(monto) from public.reembolsos_trabajador where empresa_id = p_empresa and persona = v_persona), 0)
    into v_pend;
  if v_pend <= 0 then return jsonb_build_object('ok', false, 'codigo', 'nada_pendiente'); end if;
  v_turno := public._turno_abierto(p_empresa);
  if v_turno is null then return jsonb_build_object('ok', false, 'codigo', 'sin_turno'); end if;
  r := public.movimiento_registrar(v_turno, v_pend::int, 'Devolución de gastos pagados por ' || v_persona, v_persona, p_por);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  insert into public.reembolsos_trabajador (empresa_id, persona, monto, turno_id, movimiento_id, registrado_por)
    values (p_empresa, v_persona, v_pend::int, v_turno, (r->>'movimiento_id')::uuid, p_por);
  return jsonb_build_object('ok', true, 'persona', v_persona, 'monto', v_pend);
end $$;

revoke all on function public.reembolsos_pendientes(uuid), public.reembolso_pagar(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reembolsos_pendientes(uuid), public.reembolso_pagar(uuid, text, text) to service_role;
revoke all on table public.reembolsos_trabajador from anon, authenticated;

commit;
