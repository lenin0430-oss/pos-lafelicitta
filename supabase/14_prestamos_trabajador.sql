-- 14 · Préstamos de trabajadores que el administrador descuenta de su pago diario.
-- Ejemplo: un trabajador debe a un prestamista; el dueño le descuenta una cuota diaria del sueldo y lleva el control aquí.
-- NO mueve la caja: el sueldo se sigue registrando como gasto, como siempre. Esto solo lleva la cuenta de lo descontado.
begin;

create table if not exists public.prestamos_trabajador (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  trabajador text not null,
  acreedor text,
  monto_total integer not null check (monto_total > 0),
  cuota_diaria integer not null check (cuota_diaria > 0),
  fecha_inicio date not null,
  estado text not null default 'activo' check (estado in ('activo','pagado','anulado')),
  notas text,
  created_at timestamptz not null default now()
);
create table if not exists public.prestamo_descuentos (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references public.prestamos_trabajador(id) on delete cascade,
  fecha date not null,
  monto integer not null check (monto > 0),
  registrado_por text,
  created_at timestamptz not null default now(),
  unique (prestamo_id, fecha)
);
alter table public.prestamos_trabajador enable row level security;
alter table public.prestamo_descuentos enable row level security;

create or replace view public.prestamos_saldo with (security_invoker = true) as
select p.*, coalesce(sum(d.monto),0)::int as pagado, (p.monto_total - coalesce(sum(d.monto),0))::int as saldo, count(d.id)::int as cuotas_pagadas
from public.prestamos_trabajador p left join public.prestamo_descuentos d on d.prestamo_id = p.id
group by p.id;

-- Crear préstamo (solo admin, lo valida el servidor).
create or replace function public.prestamo_crear(p_empresa uuid, p_trabajador text, p_acreedor text, p_total integer, p_cuota integer, p_inicio date, p_notas text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_trabajador),'') = '' then return jsonb_build_object('ok', false, 'codigo', 'trabajador_invalido'); end if;
  if p_total is null or p_total <= 0 or p_cuota is null or p_cuota <= 0 or p_cuota > p_total then return jsonb_build_object('ok', false, 'codigo', 'montos_invalidos'); end if;
  insert into public.prestamos_trabajador (empresa_id, trabajador, acreedor, monto_total, cuota_diaria, fecha_inicio, notas)
    values (p_empresa, btrim(p_trabajador), nullif(btrim(p_acreedor),''), p_total, p_cuota, coalesce(p_inicio, (now() at time zone 'America/Santiago')::date), nullif(btrim(p_notas),''))
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Descontar una cuota en una fecha. Nunca más que el saldo; una sola por día; al llegar a 0 queda «pagado».
create or replace function public.prestamo_descontar(p_empresa uuid, p_prestamo uuid, p_fecha date, p_monto integer, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare p public.prestamos_trabajador; v_pagado int; v_saldo int; v_monto int; v_f date;
begin
  select * into p from public.prestamos_trabajador where id = p_prestamo and empresa_id = p_empresa for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); end if;
  if p.estado <> 'activo' then return jsonb_build_object('ok', false, 'codigo', 'no_activo'); end if;
  v_f := coalesce(p_fecha, (now() at time zone 'America/Santiago')::date);
  if exists (select 1 from public.prestamo_descuentos where prestamo_id = p_prestamo and fecha = v_f) then
    return jsonb_build_object('ok', false, 'codigo', 'ya_descontado_hoy');
  end if;
  select coalesce(sum(monto),0) into v_pagado from public.prestamo_descuentos where prestamo_id = p_prestamo;
  v_saldo := p.monto_total - v_pagado;
  v_monto := least(coalesce(nullif(p_monto,0), p.cuota_diaria), v_saldo);
  if v_monto <= 0 then return jsonb_build_object('ok', false, 'codigo', 'sin_saldo'); end if;
  insert into public.prestamo_descuentos (prestamo_id, fecha, monto, registrado_por) values (p_prestamo, v_f, v_monto, p_por);
  v_saldo := v_saldo - v_monto;
  if v_saldo = 0 then update public.prestamos_trabajador set estado = 'pagado' where id = p_prestamo; end if;
  return jsonb_build_object('ok', true, 'monto', v_monto, 'saldo', v_saldo, 'fecha', v_f);
end $$;

-- Deshacer un descuento anotado por error (reabre el préstamo si estaba pagado).
create or replace function public.prestamo_deshacer(p_empresa uuid, p_descuento uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_p uuid;
begin
  delete from public.prestamo_descuentos d using public.prestamos_trabajador p
   where d.id = p_descuento and p.id = d.prestamo_id and p.empresa_id = p_empresa returning d.prestamo_id into v_p;
  if v_p is null then return jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); end if;
  update public.prestamos_trabajador set estado = 'activo' where id = v_p and estado = 'pagado';
  return jsonb_build_object('ok', true);
end $$;

-- Préstamos activos con su saldo, sus descuentos y los DÍAS POR DESCONTAR (lunes a sábado, sin domingos):
-- desde el día siguiente al último descuento (o desde el inicio si no hay ninguno) hasta hoy, sin pasarse de las cuotas que faltan.
-- Así el aviso no deja pasar un día: si ayer no se descontó, hoy aparecen dos.
create or replace function public.prestamos_estado(p_empresa uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with hoy as (select (now() at time zone 'America/Santiago')::date d),
  s as (select ps.*, (select max(fecha) from public.prestamo_descuentos x where x.prestamo_id = ps.id) ultimo
          from public.prestamos_saldo ps where ps.empresa_id = p_empresa and ps.estado in ('activo','pagado')),
  pend as (
    select s.id, coalesce(jsonb_agg(to_char(g.d, 'YYYY-MM-DD') order by g.d) filter (where g.d is not null), '[]'::jsonb) dias
      from s cross join hoy
      left join lateral (
        select gs::date d from generate_series(greatest(coalesce(s.ultimo + 1, s.fecha_inicio), s.fecha_inicio), hoy.d, interval '1 day') gs
         where extract(isodow from gs) <> 7 and s.estado = 'activo'
         order by gs limit greatest(ceil(s.saldo::numeric / s.cuota_diaria)::int, 0)
      ) g on true
     group by s.id)
  select jsonb_build_object('ok', true, 'hoy', (select to_char(d,'YYYY-MM-DD') from hoy), 'prestamos', coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'trabajador', s.trabajador, 'acreedor', s.acreedor, 'monto_total', s.monto_total, 'cuota_diaria', s.cuota_diaria,
      'fecha_inicio', s.fecha_inicio, 'estado', s.estado, 'notas', s.notas, 'pagado', s.pagado, 'saldo', s.saldo, 'cuotas_pagadas', s.cuotas_pagadas,
      'dias_pendientes', pend.dias,
      'descuentos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'fecha', d.fecha, 'monto', d.monto) order by d.fecha desc), '[]'::jsonb)
                       from public.prestamo_descuentos d where d.prestamo_id = s.id)
    ) order by (s.estado = 'pagado'), s.trabajador), '[]'::jsonb))
  from s join pend on pend.id = s.id
$$;

revoke all on function public.prestamo_crear(uuid, text, text, integer, integer, date, text),
  public.prestamo_descontar(uuid, uuid, date, integer, text), public.prestamo_deshacer(uuid, uuid), public.prestamos_estado(uuid) from public, anon, authenticated;
grant execute on function public.prestamo_crear(uuid, text, text, integer, integer, date, text),
  public.prestamo_descontar(uuid, uuid, date, integer, text), public.prestamo_deshacer(uuid, uuid), public.prestamos_estado(uuid) to service_role;
revoke all on table public.prestamos_trabajador, public.prestamo_descuentos, public.prestamos_saldo from anon, authenticated;

commit;
