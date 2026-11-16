-- Prueba de 12_consumo_personal.sql sobre PostgreSQL LOCAL con datos FICTICIOS (base.sql + 04 + 04b + 07c + 08 + 08c + 11 + 12). Ejecutar con psql; imprime una línea por comprobación.
\set ON_ERROR_STOP on
\set C '''cccccccc-0000-4000-8000-00000000000c'''
\set D '''dddddddd-0000-4000-8000-00000000000d'''
alter table ventas add column if not exists items jsonb default '[]';   -- la columna real existe en producción; base.sql no la trae
insert into empresas values (:C::uuid), (:D::uuid) on conflict do nothing;
create temp table res(n text, ok boolean, det text);
create function pg_temp.chk(n text, cond boolean, det text default '') returns void language sql as $$ insert into res values (n, coalesce(cond,false), det) $$;
create function pg_temp.venta(emp uuid, tot int) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
  insert into ventas(id,metodo_pago,total,empresa_id,estado_pago,estado,items,mesa) values (v,'',tot,emp,'pendiente','entregado','[]','M1'); return v; end $$;
create function pg_temp.cob(t uuid, m text) returns int language sql as $$
  select coalesce(sum(monto),0)::int from cobros_turno where turno_id=t and medio=m and anulado_at is null $$;

-- 0. Caso del dueño: perro caliente + lata = 2.300, sin turno abierto todavía (no entra dinero, no hace falta turno)
select pg_temp.venta(:C::uuid, 2300) v0 \gset
select public.registrar_consumo_personal(:C::uuid,:'v0'::uuid,'  Juan Pérez ','Caja') r0 \gset
select pg_temp.chk('registrar: ok, nombre limpio y monto = total de la venta', (:'r0'::jsonb->>'ok')='true' and (:'r0'::jsonb->>'trabajador')='Juan Pérez' and (:'r0'::jsonb->>'monto')='2300');
select pg_temp.chk('la venta queda consumo_personal / «Consumo personal», sin fecha de cobro', (select estado_pago||'/'||metodo_pago||'/'||coalesce(pagado_at::text,'null') from ventas where id=:'v0')='consumo_personal/Consumo personal/null');
select pg_temp.chk('el consumo queda pendiente de descuento', (select count(*) from consumos_personal where venta_id=:'v0' and descontado_at is null and anulado_at is null)=1);
select pg_temp.chk('NO escribe nada en cobros_turno (no es un cobro)', not exists (select 1 from cobros_turno where venta_id=:'v0'));

-- 1. Turno con una venta cobrada en efectivo: el consumo no cambia el arqueo
select (public.turno_abrir(:C::uuid, 1000, 'Cajera ficticia')->>'turno_id') t1 \gset
select pg_temp.venta(:C::uuid, 5000) v1 \gset
select public.cobrar_venta_manual(:C,:'v1','Efectivo') \gset
select pg_temp.venta(:C::uuid, 1500) v2 \gset
select public.registrar_consumo_personal(:C::uuid,:'v2'::uuid,'María','Caja') r2 \gset
select pg_temp.chk('consumo con turno abierto: ok y queda asociado al turno', (:'r2'::jsonb->>'ok')='true' and (select turno_id::text from consumos_personal where venta_id=:'v2')=:'t1');
select pg_temp.chk('turno_resumen: efectivo cobrado = 5.000 (los 3.800 de consumos NO suman)', ((public.turno_resumen(:'t1')->'cobros'->>'efectivo')::int)=5000);
select pg_temp.chk('efectivo esperado = fondo 1.000 + 5.000 (sin consumos)', ((public.turno_resumen(:'t1')->'esperado'->>'efectivo')::int)=6000);
select pg_temp.chk('débito, transferencia y QR siguen en 0', (select (c->>'debito')::int+(c->>'transferencia')::int+(c->>'qr')::int from (select public.turno_resumen(:'t1')->'cobros' c) x)=0);
select pg_temp.chk('un consumo personal NO bloquea el cierre de turno', not exists (select 1 from jsonb_array_elements(public.turno_bloqueos(:'t1')) e where e->>'venta_id' in (:'v0',:'v2')));
select pg_temp.chk('el evento queda en el historial del turno', exists (select 1 from turno_eventos where evento='consumo_personal' and detalle->>'trabajador'='María'));

-- 2. Protecciones
select pg_temp.chk('cobro normal sobre un consumo se rechaza (ya_cobrada)', public.cobrar_venta_manual(:C,:'v0','Efectivo')='ya_cobrada');
select pg_temp.chk('editar la comanda de un consumo se rechaza (ya_cobrada)', public.editar_comanda_venta(:C,:'v0',1000,'[{"nombre":"x","cantidad":1,"precio_unit":1000}]'::jsonb)='ya_cobrada');
select pg_temp.chk('registrar dos veces la misma venta se rechaza (ya_cobrada)', (public.registrar_consumo_personal(:C::uuid,:'v0'::uuid,'Otro','Caja')->>'codigo')='ya_cobrada');
select pg_temp.chk('una venta ya cobrada no puede pasar a consumo personal', (public.registrar_consumo_personal(:C::uuid,:'v1'::uuid,'Juan','Caja')->>'codigo')='ya_cobrada');
select pg_temp.chk('nombre vacío rechazado (trabajador_invalido)', (public.registrar_consumo_personal(:C::uuid,(select pg_temp.venta(:C::uuid, 900)),'   ','Caja')->>'codigo')='trabajador_invalido');
select pg_temp.chk('nombre de más de 60 caracteres rechazado', (public.registrar_consumo_personal(:C::uuid,(select pg_temp.venta(:C::uuid, 900)),repeat('x',61),'Caja')->>'codigo')='trabajador_invalido');
select pg_temp.chk('venta de OTRO negocio: no encontrada', (public.registrar_consumo_personal(:D::uuid,:'v1'::uuid,'Juan','Caja')->>'codigo')='venta_no_encontrada');
select pg_temp.venta(:C::uuid, 9000) v9 \gset
select public.registrar_abono(:C::uuid,:'v9'::uuid,3000,'efectivo','Ana','caja') \gset
select pg_temp.chk('abonos y consumo son excluyentes: una venta abonada no pasa a consumo', (public.registrar_consumo_personal(:C::uuid,:'v9'::uuid,'Juan','Caja')->>'codigo')='ya_cobrada' and (select estado_pago from ventas where id=:'v9')='abonada');
select pg_temp.chk('la restricción de estado_pago acepta consumo_personal (2 ventas en este estado)', (select count(*) from ventas where estado_pago='consumo_personal')=2);
do $$ begin begin update ventas set estado_pago='inventado' where false; update ventas set estado_pago='inventado' where id=(select id from ventas limit 1); exception when check_violation then insert into pg_temp.res values ('estado_pago inventado → check_violation', true, ''); end; end $$;

-- 3. Descontar del pago
select id::text c_juan from consumos_personal where venta_id=:'v0' \gset
select id::text c_maria from consumos_personal where venta_id=:'v2' \gset
select public.descontar_consumos_personal(:D::uuid, array[:'c_juan'::uuid], 'Lenin') r_otro \gset
select pg_temp.chk('otro negocio NO puede descontar mis consumos (nada_pendiente)', (:'r_otro'::jsonb->>'codigo')='nada_pendiente' and (select descontado_at is null from consumos_personal where id=:'c_juan'::uuid));
select public.descontar_consumos_personal(:C::uuid, array[:'c_juan'::uuid], 'Lenin') r3 \gset
select pg_temp.chk('descontar a Juan: 1 consumo por 2.300, con autor y fecha', (:'r3'::jsonb->>'ok')='true' and (:'r3'::jsonb->>'cantidad')='1' and (:'r3'::jsonb->>'monto')='2300'
  and (select descontado_por='Lenin' and descontado_at is not null from consumos_personal where id=:'c_juan'::uuid));
select pg_temp.chk('María sigue pendiente', (select descontado_at is null from consumos_personal where id=:'c_maria'::uuid));
select pg_temp.chk('descontar dos veces lo mismo se rechaza (nada_pendiente) y no cambia la fecha', (public.descontar_consumos_personal(:C::uuid, array[:'c_juan'::uuid], 'Otro')->>'codigo')='nada_pendiente'
  and (select descontado_por from consumos_personal where id=:'c_juan'::uuid)='Lenin');
select pg_temp.chk('ids vacíos rechazados (ids_invalidos)', (public.descontar_consumos_personal(:C::uuid, array[]::uuid[], 'Lenin')->>'codigo')='ids_invalidos');
select pg_temp.chk('descontar no toca la caja (efectivo 5.000 + el abono de 3.000 de la prueba anterior) ni la venta', ((public.turno_resumen(:'t1')->'cobros'->>'efectivo')::int)=8000 and (select estado_pago from ventas where id=:'v0')='consumo_personal');

-- 4. Borrar la venta anula su consumo (queda el historial)
delete from ventas where id=:'v2';
select pg_temp.chk('borrar la venta anula el consumo pero lo conserva', (select anulado_at is not null from consumos_personal where id=:'c_maria'::uuid));
select pg_temp.chk('un consumo anulado ya no se puede descontar', (public.descontar_consumos_personal(:C::uuid, array[:'c_maria'::uuid], 'Lenin')->>'codigo')='nada_pendiente');

-- 5. Seguridad: la tabla y las funciones no son accesibles para anon/authenticated
select pg_temp.chk('anon y authenticated no leen consumos_personal', not has_table_privilege('anon','public.consumos_personal','select') and not has_table_privilege('authenticated','public.consumos_personal','select'));
select pg_temp.chk('solo service_role ejecuta las funciones', has_function_privilege('service_role','public.registrar_consumo_personal(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.registrar_consumo_personal(uuid,uuid,text,text)','execute') and not has_function_privilege('authenticated','public.descontar_consumos_personal(uuid,uuid[],text)','execute'));

select case when ok then 'OK    ' else 'FALLA ' end || n || case when ok then '' else '  → ' || coalesce(det,'') end from res;
select 'RESULTADO: ' || count(*) filter (where ok) || ' OK, ' || count(*) filter (where not ok) || ' fallas' from res;
