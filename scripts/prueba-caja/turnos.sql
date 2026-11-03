\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-4000-8000-00000000000a'''
\set B '''bbbbbbbb-0000-4000-8000-00000000000b'''
create temp table res(n text, ok boolean, det text);
create function pg_temp.chk(n text, cond boolean, det text default '') returns void language sql as $$ insert into res values (n, coalesce(cond,false), det) $$;
create function pg_temp.venta(emp uuid, metodo text, tot int, pagar boolean default true) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
 insert into ventas(id,metodo_pago,total,empresa_id,estado_pago) values (v, case when pagar then metodo else '' end, tot, emp, 'pendiente');
 if pagar then update ventas set estado_pago='pagado', metodo_pago=metodo, pagado_at=now() where id=v; end if; return v; end $$;
create temp table ctx(k text primary key, v text);
-- ===== 1. Turno real reproducido (Point conciliado), cruza medianoche =====
select (public.turno_abrir(:A::uuid, 1000, 'Cajera ficticia')->>'turno_id') t1 \gset
insert into ctx values ('t1', :'t1');
-- apertura martes 11:00 Chile (UTC-3 en noviembre → 14:00Z)
set app.turno_fn='1';
update aperturas_caja set created_at='2026-10-27 14:00:00+00', fecha_apertura='2026-10-27', fecha='2026-10-27' where id=:'t1';
reset app.turno_fn;
select pg_temp.venta(:A::uuid,'Point',149490) v_pe \gset
select pg_temp.venta(:A::uuid,'Point',61500) v_pd \gset
select pg_temp.venta(:A::uuid,'Point',3000) v_pq \gset
select pg_temp.venta(:A::uuid,'Débito',3000) \gset
select pg_temp.venta(:A::uuid,'Transferencia',16400) \gset
select pg_temp.chk('Point sin medio informado queda por_conciliar (no QR)', (select sum(monto) from cobros_turno where turno_id=:'t1' and medio='por_conciliar')=213990);
select pg_temp.chk('Point no suma a efectivo ni qr antes de conciliar', (select coalesce(sum(monto),0) from cobros_turno where turno_id=:'t1' and medio in ('efectivo','qr'))=0);
-- cobros de madrugada (miércoles 00:20 Chile = 03:20Z) y gastos/retiro
update cobros_turno set created_at='2026-10-28 03:20+00' where venta_id=:'v_pq';
insert into gastos(categoria,descripcion,monto,empresa_id,afecto_caja) values ('Proveedor','Gastos caja',121400,:A::uuid,true);
insert into gastos(categoria,descripcion,monto,empresa_id,afecto_caja) values ('Banco','Pagado desde cuenta',50000,:A::uuid,false);
select public.movimiento_registrar(:'t1', 10000, 'Entrega al dueño', 'Adriana', 'Cajera ficticia') mv \gset
select pg_temp.chk('retiro registrado', (:'mv'::jsonb->>'ok')::boolean);
select pg_temp.chk('gasto no-caja no resta', (public.turno_resumen(:'t1')->>'gastos_otros_medios')::int=50000 and (public.turno_resumen(:'t1')->>'gastos_caja')::int=121400);
select pg_temp.chk('cierra con pendientes: aviso por conciliar', (public.turno_resumen(:'t1')->'pendientes'->>'cobros_por_conciliar')::int=3);
select public.cobro_conciliar(c.id,'efectivo','Cajera ficticia') from cobros_turno c where venta_id=:'v_pe';
select public.cobro_conciliar(c.id,'debito','Cajera ficticia') from cobros_turno c where venta_id=:'v_pd';
select public.cobro_conciliar(c.id,'qr','Cajera ficticia') from cobros_turno c where venta_id=:'v_pq';
select pg_temp.chk('conciliar por segunda vez falla', (select (public.cobro_conciliar(id,'qr','x')->>'codigo')='ya_conciliado' from cobros_turno where venta_id=:'v_pe'));
select public.turno_resumen(:'t1') r1 \gset
select pg_temp.chk('efectivo esperado turno real = 19.090', (:'r1'::jsonb->'esperado'->>'efectivo')::int=19090);
select pg_temp.chk('débito esperado = 64.500', (:'r1'::jsonb->'esperado'->>'debito')::int=64500);
select pg_temp.chk('transferencia 16.400 y qr 3.000', (:'r1'::jsonb->'esperado'->>'transferencia')::int=16400 and (:'r1'::jsonb->'esperado'->>'qr')::int=3000);
select pg_temp.chk('sin nuevo turno a medianoche: abrir de nuevo → ya_abierto', (public.turno_abrir(:A::uuid,1000,'x')->>'codigo')='ya_abierto');
select pg_temp.chk('cierre sin efectivo contado se rechaza', (public.turno_cerrar(:'t1','{}'::jsonb,null,gen_random_uuid(),'x')->>'codigo')='falta_efectivo_contado');
select gen_random_uuid() clave \gset
select public.turno_cerrar(:'t1','{"efectivo":10000,"debito":64500,"transferencia":16400,"qr":3000}'::jsonb,'cierre real reproducido',:'clave'::uuid,'Cajera ficticia') c1 \gset
select pg_temp.chk('cierre ok', (:'c1'::jsonb->>'ok')::boolean);
select pg_temp.chk('diferencia efectivo = -9.090', (select diferencia from cierres_turno_medios m join cierres_turno c on c.id=m.cierre_id where c.turno_id=:'t1' and medio='efectivo')=-9090);
select pg_temp.chk('electrónicos sin diferencia', (select bool_and(diferencia=0) from cierres_turno_medios m join cierres_turno c on c.id=m.cierre_id where c.turno_id=:'t1' and medio in ('debito','transferencia','qr')));
select pg_temp.chk('crédito/por_conciliar en 0 sin diferencia', (select count(*) from cierres_turno_medios m join cierres_turno c on c.id=m.cierre_id where c.turno_id=:'t1' and medio in ('credito','por_conciliar') and esperado=0 and diferencia is null)=2);
select pg_temp.chk('turno guarda fecha apertura martes y cierre real', (select fecha_apertura='2026-10-27' and cierre_at>apertura_at from cierres_turno where turno_id=:'t1'));
select pg_temp.chk('legacy cierres_caja recibe fila compatible', (select efectivo_fisico=10000 and diferencia=-9090 and ventas_efectivo=149490 and ventas_qr=3000 from cierres_caja where apertura_id=:'t1'));
select pg_temp.chk('con_pendientes=false (nada pendiente)', not (select con_pendientes from cierres_turno where turno_id=:'t1'));
-- reintentos / doble cierre
select pg_temp.chk('reintento misma clave devuelve el mismo cierre, sin duplicar', (select (public.turno_cerrar(:'t1','{"efectivo":1}'::jsonb,null,:'clave'::uuid,'x')->>'repetido')='true') and (select count(*) from cierres_turno where turno_id=:'t1')=1 and (select count(*) from cierres_caja where apertura_id=:'t1')=1);
select pg_temp.chk('segundo cierre con otra clave → ya_cerrado', (public.turno_cerrar(:'t1','{"efectivo":1}'::jsonb,null,gen_random_uuid(),'x')->>'codigo')='ya_cerrado');
select pg_temp.chk('retiro en turno cerrado se rechaza', (public.movimiento_registrar(:'t1',1,'x',null,'x')->>'codigo')='turno_cerrado');
-- historial inmutable
do $$ begin begin update cierres_turno set notas='x'; perform pg_temp.chk('cierre inmutable (update)', false); exception when sqlstate 'P0410' then perform pg_temp.chk('cierre inmutable (update)', true); end;
 begin delete from turno_eventos; perform pg_temp.chk('eventos inmutables (delete)', false); exception when sqlstate 'P0410' then perform pg_temp.chk('eventos inmutables (delete)', true); end; end $$;
-- ===== 2. Segundo turno el miércoles, mismo negocio =====
select (public.turno_abrir(:A::uuid, 2000, 'Cajera ficticia')->>'turno_id') t2 \gset
select pg_temp.venta(:A::uuid,'Efectivo',5000) \gset
select pg_temp.venta(:A::uuid,'Mixto: Efectivo $4.000 + Débito $6.000',10000) vm \gset
select pg_temp.venta(:A::uuid,'Mixto: Efectivo $4.000 + Débito $5.000',10000) vm2 \gset
select pg_temp.venta(:A::uuid,'Cortesia',7000) \gset
select public.turno_resumen(:'t2') r2 \gset
select pg_temp.chk('segundo turno independiente del primero', (:'r2'::jsonb->'cobros'->>'efectivo')::int=13000 and (:'r2'::jsonb->'cobros'->>'debito')::int=11000);
select pg_temp.chk('mixto que no suma deja diferencia por conciliar, no en efectivo', (select monto from cobros_turno where venta_id=:'vm2' and medio='por_conciliar')=1000);
select pg_temp.chk('cortesía no suma a medios de pago', (:'r2'::jsonb->'cobros'->>'cortesia')::int=7000 and (:'r2'::jsonb->'esperado'->>'efectivo')::int=2000+13000);
-- doble actualización de la misma venta no duplica cobros
update ventas set estado_pago='pagado' where id=:'vm';
select pg_temp.chk('cobro no se duplica al repetir estado', (select count(*) from cobros_turno where venta_id=:'vm')=2);
-- anulación
update ventas set estado_pago='pendiente' where id=:'vm2';
select pg_temp.chk('cobro anulado sale del resumen', (public.turno_resumen(:'t2')->'cobros'->>'debito')::int=6000);
insert into ctx values ('t2', :'t2');
-- ===== 3. Aislamiento entre negocios =====
select (public.turno_abrir(:B::uuid, 500, 'Cajero B')->>'turno_id') tb \gset
select pg_temp.venta(:B::uuid,'Efectivo',9999) \gset
select pg_temp.chk('negocio B no ve cobros de A', (public.turno_resumen(:'tb')->'cobros'->>'efectivo')::int=9999 and (public.turno_resumen(:'t2')->'cobros'->>'efectivo')::int=9000);
select pg_temp.chk('dos negocios con turno abierto simultáneo', (select count(*) from aperturas_caja where estado='abierta' and modelo='v2')=2);
-- ===== 4. Cobro simultáneo con el cierre (carrera) =====
-- ===== 5. Históricos intactos =====
select pg_temp.chk('histórico: apertura legacy sigue abierta y sin cambios', (select estado='abierta' and modelo='legacy' and monto_inicial=5000 from aperturas_caja where id='11111111-0000-4000-8000-000000000001'));
select pg_temp.chk('histórico: venta antigua sin turno ni cobros nuevos', (select turno_id is null from ventas where id='22222222-0000-4000-8000-000000000001') and not exists (select 1 from cobros_turno where venta_id='22222222-0000-4000-8000-000000000001'));

-- ===== 6. Reproducciones de la revisión de Codex =====
-- 6.1 gasto con apertura_id explícito de un turno YA CERRADO
do $$ declare t1 uuid := (select v::uuid from ctx where k='t1'); begin
  begin insert into gastos(categoria,descripcion,monto,empresa_id,apertura_id,afecto_caja) values ('x','tardío',1000,'aaaaaaaa-0000-4000-8000-00000000000a',t1,true);
    perform pg_temp.chk('gasto tardío en turno cerrado se rechaza', false);
  exception when sqlstate 'P0411' then perform pg_temp.chk('gasto tardío en turno cerrado se rechaza', true); end;
  begin insert into propinas(empresa_id,empleado,monto,apertura_id) values ('aaaaaaaa-0000-4000-8000-00000000000a','x',500,t1);
    perform pg_temp.chk('propina tardía en turno cerrado se rechaza', false);
  exception when sqlstate 'P0411' then perform pg_temp.chk('propina tardía en turno cerrado se rechaza', true); end;
  begin update gastos set monto=1 where apertura_id=t1 and monto=121400; perform pg_temp.chk('gasto de turno cerrado no se modifica', false);
  exception when sqlstate 'P0411' then perform pg_temp.chk('gasto de turno cerrado no se modifica', true); end;
  begin delete from gastos where apertura_id=t1; perform pg_temp.chk('gasto de turno cerrado no se borra', false);
  exception when sqlstate 'P0411' then perform pg_temp.chk('gasto de turno cerrado no se borra', true); end;
  begin insert into gastos(categoria,descripcion,monto,empresa_id,apertura_id) values ('x','otro negocio',1,'bbbbbbbb-0000-4000-8000-00000000000b',(select v::uuid from ctx where k='t1'));
    perform pg_temp.chk('gasto no entra a turno de otro negocio', false);
  exception when sqlstate 'P0411' then perform pg_temp.chk('gasto no entra a turno de otro negocio', true); end;
end $$;
select pg_temp.chk('resumen posterior de turno cerrado = instantánea (gastos 121.400)', (public.turno_resumen(:'t1')->>'gastos_caja')::int=121400);
-- gasto sin apertura va al turno abierto (no al cerrado)
insert into gastos(categoria,descripcion,monto,empresa_id) values ('x','nuevo',700,:A::uuid);
select pg_temp.chk('gasto sin turno explícito entra al turno abierto', (select apertura_id from gastos where descripcion='nuevo')=:'t2'::uuid);
delete from gastos where descripcion='nuevo';
select pg_temp.chk('borrar gasto de turno abierto queda en eventos', exists (select 1 from turno_eventos where evento='gastos_eliminado'));
-- 6.2 anular y volver a cobrar el mismo medio
select pg_temp.venta(:A::uuid,'Efectivo',3000) vr \gset
update ventas set estado_pago='pendiente' where id=:'vr';
update ventas set estado_pago='pagado', metodo_pago='Efectivo' where id=:'vr';
select pg_temp.chk('anular y recobrar mismo medio deja 1 cobro activo y 1 anulado', (select count(*) filter (where anulado_at is null) from cobros_turno where venta_id=:'vr')=1 and (select count(*) filter (where anulado_at is not null) from cobros_turno where venta_id=:'vr')=1);
-- anulación posterior al cierre del turno: el cierre no cambia; se registra; se puede volver a cobrar
update ventas set estado_pago='pendiente' where id=:'v_pe';
select pg_temp.chk('anulación tras el cierre queda registrada y el cierre no cambia', exists (select 1 from turno_eventos where evento='anulacion_posterior_al_cierre' and detalle->>'venta_id'=:'v_pe') and (public.turno_resumen(:'t1')->'esperado'->>'efectivo')::int=19090);
update ventas set estado_pago='pagado', metodo_pago='Efectivo' where id=:'v_pe';
select pg_temp.chk('recobro tras anulación posterior queda activo en el turno abierto', (select turno_id from cobros_turno where venta_id=:'v_pe' and anulado_at is null)=:'t2'::uuid);
-- 6.3 caminos antiguos: no se puede saltar el cierre v2
do $$ declare t2 uuid := (select v::uuid from ctx where k='t2'); declare t1 uuid := (select v::uuid from ctx where k='t1'); begin
  begin update aperturas_caja set estado='cerrada', cerrada_at=now() where id=t2; perform pg_temp.chk('cerrar turno v2 por UPDATE directo se rechaza', false);
  exception when sqlstate 'P0412' then perform pg_temp.chk('cerrar turno v2 por UPDATE directo se rechaza', true); end;
  begin update aperturas_caja set estado='abierta' where id=t1; perform pg_temp.chk('reabrir turno v2 por UPDATE directo se rechaza', false);
  exception when sqlstate 'P0412' then perform pg_temp.chk('reabrir turno v2 por UPDATE directo se rechaza', true); end;
  begin insert into aperturas_caja(empresa_id,modelo,estado) values ('aaaaaaaa-0000-4000-8000-00000000000a','v2','abierta'); perform pg_temp.chk('abrir turno v2 por INSERT directo se rechaza', false);
  exception when sqlstate 'P0412' then perform pg_temp.chk('abrir turno v2 por INSERT directo se rechaza', true); end;
  begin insert into cierres_caja(empresa_id,apertura_id,ventas_total,efectivo_fisico) values ('aaaaaaaa-0000-4000-8000-00000000000a',t2,1,1); perform pg_temp.chk('cierre manual contra turno v2 se rechaza', false);
  exception when sqlstate 'P0412' then perform pg_temp.chk('cierre manual contra turno v2 se rechaza', true); end;
end $$;
update aperturas_caja set estado='cerrada' where id='11111111-0000-4000-8000-000000000001';
select pg_temp.chk('turno legacy sigue pudiendo cerrarse con el flujo antiguo', (select estado from aperturas_caja where id='11111111-0000-4000-8000-000000000001')='cerrada');
-- 6.4 cierre con cifras que la cajera ya no tenía: se rechaza y se devuelve el resumen nuevo
select public.turno_resumen(:'tb')->'esperado' vistob \gset
select pg_temp.venta(:B::uuid,'Débito',1234) \gset
select public.turno_cerrar(:'tb','{"efectivo":10499}'::jsonb,null,gen_random_uuid(),'x',:'vistob'::jsonb) cb \gset
select pg_temp.chk('cobro de otro equipo antes de confirmar → resumen_cambio, turno sigue abierto', (:'cb'::jsonb->>'codigo')='resumen_cambio' and (select estado from aperturas_caja where id=:'tb')='abierta' and (:'cb'::jsonb->'resumen'->'esperado'->>'debito')::int=1234);
select public.turno_cerrar(:'tb','{"efectivo":10499,"debito":1234}'::jsonb,null,gen_random_uuid(),'x',(public.turno_resumen(:'tb')->'esperado')) cb2 \gset
select pg_temp.chk('con el resumen actualizado el cierre procede', (:'cb2'::jsonb->>'ok')::boolean);

-- 6.5 efectivo esperado negativo (gastos > efectivo registrado) y contado 0
insert into empresas values ('cccccccc-0000-4000-8000-00000000000c');
select (public.turno_abrir('cccccccc-0000-4000-8000-00000000000c'::uuid, 0, 'c')->>'turno_id') tc \gset
insert into gastos(categoria,descripcion,monto,empresa_id) values ('x','mayor al efectivo',1000,'cccccccc-0000-4000-8000-00000000000c');
select public.turno_cerrar(:'tc','{"efectivo":0}'::jsonb,null,gen_random_uuid(),'c',(public.turno_resumen(:'tc')->'esperado')) cn \gset
select pg_temp.chk('esperado negativo −1000 con contado 0 cierra; diferencia +1000', (:'cn'::jsonb->>'ok')::boolean and (select diferencia from cierres_turno_medios m join cierres_turno c on c.id=m.cierre_id where c.turno_id=:'tc' and medio='efectivo')=1000 and (:'cn'::jsonb->'resumen'->'esperado'->>'efectivo')::int=-1000);

-- permisos
select has_function_privilege('anon','public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb)','execute') a, has_function_privilege('authenticated','public.turno_abrir(uuid,integer,text)','execute') b, has_function_privilege('service_role','public.turno_cerrar(uuid,jsonb,text,uuid,text,jsonb)','execute') c \gset
select pg_temp.chk('anon/authenticated sin acceso a funciones; service_role sí', not :'a'::boolean and not :'b'::boolean and :'c'::boolean);
select pg_temp.chk('anon sin acceso a tablas nuevas', not has_table_privilege('anon','public.cobros_turno','select') and not has_table_privilege('authenticated','public.cierres_turno','select'));
select n, case when ok then 'OK ' else 'FALLA' end, det from res order by ok, n;
