\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-4000-8000-00000000000a'''
\set B '''bbbbbbbb-0000-4000-8000-00000000000b'''
create temp table res(n text, ok boolean, det text);
create function pg_temp.chk(n text, cond boolean, det text default '') returns void language sql as $$ insert into res values (n, coalesce(cond,false), det) $$;
create function pg_temp.com(emp uuid, num int default null, clave uuid default null) returns jsonb language plpgsql as $$
declare v uuid := gen_random_uuid(); n int; begin
  insert into ventas(id,numero,mesa,total,empresa_id,clave_idempotencia) values (v, num, 'Mesa', 1000, emp, clave) returning numero into n;
  return jsonb_build_object('id', v, 'numero', n); end $$;
-- ===== 1. Históricos intactos =====
select pg_temp.chk('históricos: mismos id y número que antes de 09 (no se renumeró nada)', (select md5(string_agg(h.id::text||':'||coalesce(h.numero::text,''), ',' order by h.id)) from z_historico h) = (select md5(string_agg(v.id::text||':'||coalesce(v.numero::text,''), ',' order by v.id)) from ventas v where v.id in (select id from z_historico)));
select pg_temp.chk('históricos: duplicados reales se conservan (dos comandas #5) y sin folio', (select count(*) from ventas where empresa_id=:A::uuid and numero=5)=2 and (select count(*) from ventas where id in (select id from z_historico) and folio is not null)=0);
select pg_temp.chk('legacy: apertura antigua sin número de turno', (select numero_turno is null from aperturas_caja where id='11111111-0000-4000-8000-000000000001'));
-- ===== 2. Comandas: asignadas por la base =====
select pg_temp.chk('contador sembrado en el mayor número histórico (120)', (select ultimo from correlativos where empresa_id=:A::uuid and tipo='comanda')=120);
select pg_temp.com(:A::uuid, 5) c1 \gset
select pg_temp.com(:A::uuid, 999) c2 \gset
select pg_temp.chk('el número que manda el cliente se IGNORA: 121 y 122, sin chocar con el histórico', (:'c1'::jsonb->>'numero')::int=121 and (:'c2'::jsonb->>'numero')::int=122);
select pg_temp.chk('folio = número y único por negocio', (select count(*) from ventas where empresa_id=:A::uuid and folio is not null)=2 and (select min(folio)=121 and max(folio)=122 from ventas where empresa_id=:A::uuid and folio is not null));
select pg_temp.com(:B::uuid) cb \gset
select pg_temp.chk('otro negocio tiene su propia secuencia (continúa tras su histórico 7)', (:'cb'::jsonb->>'numero')::int=8);
insert into empresas values ('cccccccc-0000-4000-8000-00000000000c');
select pg_temp.com('cccccccc-0000-4000-8000-00000000000c'::uuid) cc \gset
select pg_temp.chk('negocio sin historia empieza en 1', (:'cc'::jsonb->>'numero')::int=1);
-- sin reinicio a medianoche (el número no depende de la fecha)
insert into ventas(mesa,total,empresa_id,created_at) values ('m',1,:A::uuid,'2026-11-03 23:59:30-03'),('m',1,:A::uuid,'2026-11-04 00:01:00-03'),('m',1,:A::uuid,'2026-11-04 00:02:00-03');
select pg_temp.chk('cruce de medianoche: 123,124,125 consecutivos', (select array_agg(folio order by folio) from ventas where empresa_id=:A::uuid and created_at between '2026-11-03 23:59-03' and '2026-11-04 00:03-03')=array[123,124,125]::bigint[]);
-- ===== 3. Reintento / doble clic con la misma clave =====
select gen_random_uuid() k \gset
select set_config('my.k', :'k', false);
select pg_temp.com(:A::uuid, null, :'k'::uuid) r1 \gset
do $$ begin
  begin perform pg_temp.com('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, null, current_setting('my.k')::uuid); perform pg_temp.chk('reintento con la misma clave se rechaza (23505)', false);
  exception when unique_violation then perform pg_temp.chk('reintento con la misma clave se rechaza (23505)', true); end;
end $$;
select pg_temp.chk('el reintento no creó otra comanda', (select count(*) from ventas where clave_idempotencia=:'k'::uuid)=1);
select pg_temp.com(:A::uuid) r2 \gset
select pg_temp.chk('el reintento no gastó número: la siguiente es consecutiva (sin hueco)', (:'r2'::jsonb->>'numero')::int=(:'r1'::jsonb->>'numero')::int+1);
select pg_temp.chk('la misma clave en OTRO negocio es otra comanda', (pg_temp.com(:B::uuid, null, :'k'::uuid)->>'numero')::int>0);
-- ===== 4. Editar, cobrar, anular =====
select (public.turno_abrir(:A::uuid, 0, 'Cajera ficticia')->>'turno_id') tt \gset
select (:'r1'::jsonb->>'id') v1, (:'r1'::jsonb->>'numero') n1 \gset
select set_config('my.v1', :'v1', false);
update ventas set total=2000, mesa='Mesa 9' where id=:'v1'::uuid;
select pg_temp.chk('editar conserva el número', (select numero::text from ventas where id=:'v1'::uuid)=:'n1');
update ventas set metodo_pago='Efectivo', estado_pago='pagado', pagado_at=now() where id=:'v1'::uuid;
select pg_temp.chk('cobrar conserva el número', (select numero::text from ventas where id=:'v1'::uuid)=:'n1');
update ventas set estado='entregado' where id=:'v1'::uuid;
select pg_temp.chk('entregar (cocina) conserva el número', (select numero::text from ventas where id=:'v1'::uuid)=:'n1');
do $$ begin
  begin update ventas set numero=1 where id=current_setting('my.v1')::uuid; perform pg_temp.chk('cambiar el número de una comanda se rechaza (P0414)', false);
  exception when sqlstate 'P0414' then perform pg_temp.chk('cambiar el número de una comanda se rechaza (P0414)', true); end;
  begin update ventas set folio=1 where id=current_setting('my.v1')::uuid; perform pg_temp.chk('cambiar el folio se rechaza (P0414)', false);
  exception when sqlstate 'P0414' then perform pg_temp.chk('cambiar el folio se rechaza (P0414)', true); end;
  begin update ventas set folio=9999 where id='a1000000-0000-4000-8000-000000000001'; perform pg_temp.chk('no se asigna folio retroactivo a una comanda histórica (P0414)', false);
  exception when sqlstate 'P0414' then perform pg_temp.chk('no se asigna folio retroactivo a una comanda histórica (P0414)', true); end;
end $$;
select max(folio) mx from ventas where empresa_id=:A::uuid \gset
delete from ventas where id=:'v1'::uuid;
select pg_temp.com(:A::uuid) r3 \gset
select pg_temp.chk('anular (borrar) NO reutiliza el número', (:'r3'::jsonb->>'numero')::int>:'mx'::int and not exists (select 1 from ventas where empresa_id=:A::uuid and numero=:'n1'::int and folio is not null));
-- ===== 5. Turnos y cierres: más de 50, consecutivos y únicos =====
select (public.turno_cerrar(:'tt'::uuid,'{"efectivo":0}'::jsonb,null,gen_random_uuid(),'c')->>'codigo') ctt \gset
select pg_temp.chk('turno A: cierre bloqueado por comandas sin entregar no gasta número de cierre', :'ctt'='bloqueado' and (select ultimo from correlativos where empresa_id=:A::uuid and tipo='cierre') is null);
update ventas set estado='entregado', estado_pago='pagado', metodo_pago='Efectivo' where empresa_id=:A::uuid and (estado<>'entregado' or estado_pago='pendiente');
select pg_temp.chk('turno A es el 1.º con folio de turno', (select numero_turno from aperturas_caja where id=:'tt'::uuid)=1);
select pg_temp.chk('ya_abierto no gasta número y devuelve el turno', (public.turno_abrir(:A::uuid,0,'x')->>'codigo')='ya_abierto' and (select ultimo from correlativos where empresa_id=:A::uuid and tipo='turno')=1);
select gen_random_uuid() ka \gset
select public.turno_cerrar(:'tt'::uuid,'{"efectivo":0}'::jsonb,null,:'ka'::uuid,'c') ca \gset
select pg_temp.chk('cierre 1 de A: número de cierre 1 y en la instantánea', (:'ca'::jsonb->>'numero_cierre')::int=1 and (:'ca'::jsonb->'resumen'->>'numero_cierre')::int=1 and (:'ca'::jsonb->'resumen'->'turno'->>'numero')::int=1, :'ca');
select pg_temp.chk('repetir el cierre con la misma clave devuelve el mismo número y no gasta otro', (public.turno_cerrar(:'tt'::uuid,'{"efectivo":0}'::jsonb,null,:'ka'::uuid,'c')->>'numero_cierre')::int=1 and (select ultimo from correlativos where empresa_id=:A::uuid and tipo='cierre')=1);
select pg_temp.chk('otro intento de cierre con otra clave → ya_cerrado sin gastar número', (public.turno_cerrar(:'tt'::uuid,'{"efectivo":0}'::jsonb,null,gen_random_uuid(),'c')->>'codigo')='ya_cerrado' and (select ultimo from correlativos where empresa_id=:A::uuid and tipo='cierre')=1);
-- (las comandas de prueba de B se archivan de cocina: no son parte de esta prueba de turnos)
update ventas set cocina_archivada_at=now() where empresa_id=:B::uuid and cocina_archivada_at is null and estado<>'entregado' or (empresa_id=:B::uuid and estado_pago='pendiente');
-- 60 turnos en el negocio B (turno/cierre) con reintentos de apertura
create temp table ab(i int, num int, rep boolean);
do $$ declare i int; k uuid; t jsonb; t2 jsonb; c jsonb; begin
  for i in 1..60 loop
    k := gen_random_uuid();
    t := public.turno_abrir('bbbbbbbb-0000-4000-8000-00000000000b'::uuid, 0, 'Cajera ficticia', k);
    t2 := public.turno_abrir('bbbbbbbb-0000-4000-8000-00000000000b'::uuid, 0, 'Cajera ficticia', k);       -- doble clic
    insert into ab values (i, (t->>'numero_turno')::int, (t2->>'repetido')::boolean and t2->>'turno_id' = t->>'turno_id');
    c := public.turno_cerrar((t->>'turno_id')::uuid, '{"efectivo":0}'::jsonb, null, gen_random_uuid(), 'c');
    if not (c->>'ok')::boolean then raise exception 'cierre %: %', i, c; end if;
    -- tras cerrar, el reintento tardío de la apertura devuelve el mismo turno (cerrado) y no abre otro
    t2 := public.turno_abrir('bbbbbbbb-0000-4000-8000-00000000000b'::uuid, 0, 'Cajera ficticia', k);
    if not ((t2->>'repetido')::boolean and t2->>'estado' = 'cerrada') then raise exception 'reintento tardío %: %', i, t2; end if;
  end loop;
end $$;
select pg_temp.chk('60 turnos: números 1..60 consecutivos y únicos', (select array_agg(num order by i) from ab)=(select array_agg(g::int) from generate_series(1,60) g) and (select count(distinct numero_turno) from aperturas_caja where empresa_id=:B::uuid and numero_turno is not null)=60);
select pg_temp.chk('el doble clic de apertura devolvió el mismo turno las 60 veces', (select bool_and(rep) from ab));
select pg_temp.chk('60 cierres: números 1..60 consecutivos y únicos (por negocio)', (select array_agg(numero_cierre::int order by numero_cierre) from cierres_turno where empresa_id=:B::uuid)=(select array_agg(g::int) from generate_series(1,60) g));
select pg_temp.chk('no quedó ningún turno abierto de más', (select count(*) from aperturas_caja where empresa_id=:B::uuid and estado='abierta')=0);
select pg_temp.chk('el número de turno y de cierre coinciden con el de la instantánea guardada', (select count(*) from cierres_turno c join aperturas_caja a on a.id=c.turno_id where c.empresa_id=:B::uuid and (c.resumen->'turno'->>'numero')::int=a.numero_turno and (c.resumen->>'numero_cierre')::int=c.numero_cierre)=60);
select pg_temp.chk('A y B tienen secuencias independientes (A sigue en 1 turno y 1 cierre)', (select count(*) from aperturas_caja where empresa_id=:A::uuid and numero_turno is not null)=1 and (select count(*) from cierres_turno where empresa_id=:A::uuid)=1);
-- ===== 6. Permisos =====
select has_function_privilege('anon','public.correlativo_siguiente(uuid,text)','execute') a, has_function_privilege('authenticated','public.correlativo_siguiente(uuid,text)','execute') b, has_function_privilege('service_role','public.correlativo_siguiente(uuid,text)','execute') c,
       has_table_privilege('anon','public.correlativos','select') d, has_table_privilege('authenticated','public.correlativos','update') e \gset
select pg_temp.chk('correlativos: anon/authenticated sin acceso; service_role sí', not :'a'::boolean and not :'b'::boolean and :'c'::boolean and not :'d'::boolean and not :'e'::boolean);
select pg_temp.chk('índices únicos de folio y claves presentes', (select count(*) from pg_indexes where indexname in ('ventas_folio_uq','ventas_clave_uq','aperturas_numero_turno_uq','aperturas_clave_uq','cierres_numero_uq'))=5);
select n, case when ok then 'OK ' else 'FALLA' end, det from res order by ok, n;
