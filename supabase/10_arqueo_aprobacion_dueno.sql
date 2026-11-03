-- Después de 09. Preparación: NO ejecutar en producción sin ensayar.
begin;
create table public.arqueos_turno (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 turno_id uuid not null references public.aperturas_caja(id), clave uuid not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','devuelto','aprobado')),
 contado jsonb not null, resumen jsonb not null, huella text not null, notas text,
 presentado_por text not null, presentado_at timestamptz not null default clock_timestamp(),
 revisado_por text, revisado_at timestamptz, motivo_devolucion text, cierre_id uuid,
 unique(empresa_id,clave)
);
create unique index arqueo_pendiente_turno on public.arqueos_turno(turno_id) where estado='pendiente';
alter table public.arqueos_turno enable row level security;
revoke all on public.arqueos_turno from public,anon,authenticated;
grant select,insert,update on public.arqueos_turno to service_role;

-- La aprobación comprueba movimientos completos, no solo que el saldo final coincida.
create function public.arqueo_huella(p_turno uuid) returns text language sql stable set search_path=public,pg_temp as $$
 select md5(jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cobros_turno x where turno_id=p_turno),
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.gastos x where apertura_id=p_turno),
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.propinas x where apertura_id=p_turno),
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.movimientos_caja x where turno_id=p_turno),
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.ventas x where turno_id=p_turno)
 )::text)
$$;

create function public.turno_presentar_arqueo(p_empresa uuid,p_turno uuid,p_clave uuid,p_contados jsonb,p_notas text,p_por text,p_esperado_visto jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare t public.aperturas_caja; a public.arqueos_turno; r jsonb; bl jsonb; k text;
begin
 select * into t from public.aperturas_caja where id=p_turno and empresa_id=p_empresa and modelo='v2' for update;
 if not found then return jsonb_build_object('ok',false,'codigo','turno_no_encontrado'); end if;
 if p_clave is null then return jsonb_build_object('ok',false,'codigo','falta_clave'); end if;
 select * into a from public.arqueos_turno where empresa_id=p_empresa and clave=p_clave;
 if found then
  if a.turno_id<>p_turno or a.contado is distinct from p_contados or a.notas is distinct from p_notas or a.presentado_por is distinct from p_por then
   return jsonb_build_object('ok',false,'codigo','clave_reutilizada'); end if;
  return jsonb_build_object('ok',true,'repetido',true,'arqueo',to_jsonb(a));
 end if;
 if t.estado<>'abierta' then return jsonb_build_object('ok',false,'codigo','turno_cerrado'); end if;
 if exists(select 1 from public.arqueos_turno where turno_id=p_turno and estado='pendiente') then
  return jsonb_build_object('ok',false,'codigo','arqueo_pendiente'); end if;
 if jsonb_typeof(p_contados) is distinct from 'object' or not p_contados ? 'efectivo' then
  return jsonb_build_object('ok',false,'codigo','falta_efectivo_contado'); end if;
 for k in select jsonb_object_keys(p_contados) loop
  if k not in ('efectivo','debito','credito','transferencia','qr','por_conciliar') or jsonb_typeof(p_contados->k)<>'number'
     or (p_contados->>k)!~'^[0-9]+$' or (p_contados->>k)::numeric>100000000 then
   return jsonb_build_object('ok',false,'codigo','monto_invalido'); end if;
 end loop;
 bl:=public.turno_bloqueos(p_turno);
 if jsonb_array_length(bl)>0 then return jsonb_build_object('ok',false,'codigo','bloqueado','bloqueos',bl); end if;
 r:=public.turno_resumen(p_turno);
 if p_esperado_visto is not null and p_esperado_visto is distinct from r->'esperado' then
  return jsonb_build_object('ok',false,'codigo','resumen_cambio','resumen',r); end if;
 insert into public.arqueos_turno(empresa_id,turno_id,clave,contado,resumen,huella,notas,presentado_por)
  values(p_empresa,p_turno,p_clave,p_contados,r,public.arqueo_huella(p_turno),p_notas,p_por) returning * into a;
 insert into public.turno_eventos(empresa_id,turno_id,evento,detalle,actor)
  values(p_empresa,p_turno,'arqueo_presentado',jsonb_build_object('arqueo_id',a.id,'contado',p_contados),p_por);
 return jsonb_build_object('ok',true,'arqueo',to_jsonb(a));
end $$;

-- Solo se invoca desde el servidor después de comprobar rol admin en sesión firmada.
-- Recibe el id del arqueo, NUNCA cifras editables para reemplazar las de la cajera.
create function public.turno_revisar_arqueo(p_empresa uuid,p_turno uuid,p_arqueo uuid,p_aprobar boolean,p_motivo text,p_por text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare t public.aperturas_caja; a public.arqueos_turno; r jsonb;
begin
 select * into t from public.aperturas_caja where id=p_turno and empresa_id=p_empresa and modelo='v2' for update;
 if not found then return jsonb_build_object('ok',false,'codigo','turno_no_encontrado'); end if;
 select * into a from public.arqueos_turno where id=p_arqueo and turno_id=p_turno and empresa_id=p_empresa for update;
 if not found then return jsonb_build_object('ok',false,'codigo','arqueo_no_encontrado'); end if;
 if a.estado='aprobado' and p_aprobar then
  return public.turno_cerrar(p_turno,a.contado,a.notas,a.clave,a.revisado_por,a.resumen->'esperado'); end if;
 if a.estado<>'pendiente' then return jsonb_build_object('ok',false,'codigo','arqueo_resuelto'); end if;
 if t.estado<>'abierta' then return jsonb_build_object('ok',false,'codigo','turno_cerrado'); end if;
 if not p_aprobar then
  if nullif(trim(p_motivo),'') is null then return jsonb_build_object('ok',false,'codigo','motivo_requerido'); end if;
  update public.arqueos_turno set estado='devuelto',revisado_por=p_por,revisado_at=clock_timestamp(),motivo_devolucion=left(trim(p_motivo),500) where id=a.id;
  insert into public.turno_eventos(empresa_id,turno_id,evento,detalle,actor)
   values(p_empresa,p_turno,'arqueo_devuelto',jsonb_build_object('arqueo_id',a.id,'motivo',left(trim(p_motivo),500)),p_por);
  return jsonb_build_object('ok',true,'devuelto',true);
 end if;
 if a.huella is distinct from public.arqueo_huella(p_turno) then
  return jsonb_build_object('ok',false,'codigo','arqueo_cambio'); end if;
 r:=public.turno_cerrar(p_turno,a.contado,a.notas,a.clave,p_por,a.resumen->'esperado');
 if coalesce((r->>'ok')::boolean,false) then
  update public.arqueos_turno set estado='aprobado',revisado_por=p_por,revisado_at=clock_timestamp(),cierre_id=(r->>'cierre_id')::uuid where id=a.id;
  insert into public.turno_eventos(empresa_id,turno_id,evento,detalle,actor)
   values(p_empresa,p_turno,'arqueo_aprobado',jsonb_build_object('arqueo_id',a.id,'cierre_id',r->>'cierre_id'),p_por);
 end if;
 return r;
end $$;
revoke all on function public.arqueo_huella(uuid),public.turno_presentar_arqueo(uuid,uuid,uuid,jsonb,text,text,jsonb),public.turno_revisar_arqueo(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.arqueo_huella(uuid),public.turno_presentar_arqueo(uuid,uuid,uuid,jsonb,text,text,jsonb),public.turno_revisar_arqueo(uuid,uuid,uuid,boolean,text,text) to service_role;
commit;
