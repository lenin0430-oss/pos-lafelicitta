-- Prueba de 11_abonos.sql sobre PostgreSQL LOCAL con datos FICTICIOS (base.sql + 04 + 04b + 07c + 08 + 11). Ejecutar con psql; imprime una línea por comprobación.
\set ON_ERROR_STOP on
\set C '''cccccccc-0000-4000-8000-00000000000c'''
\set D '''dddddddd-0000-4000-8000-00000000000d'''
insert into empresas values (:C::uuid), (:D::uuid) on conflict do nothing;
create temp table res(n text, ok boolean, det text);
create function pg_temp.chk(n text, cond boolean, det text default '') returns void language sql as $$ insert into res values (n, coalesce(cond,false), det) $$;
create function pg_temp.venta(emp uuid, tot int) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
  insert into ventas(id,metodo_pago,total,empresa_id,estado_pago,estado,items,mesa) values (v,'',tot,emp,'pendiente','entregado','[]','M1'); return v; end $$;
create function pg_temp.cob(t uuid, m text) returns int language sql as $$
  select coalesce(sum(monto),0)::int from cobros_turno where turno_id=t and medio=m and anulado_at is null $$;

-- 0. Sin turno abierto no se registra un abono
select pg_temp.venta(:C::uuid, 12000) v0 \gset
select pg_temp.chk('sin turno abierto: abono rechazado (sin_turno) y la venta sigue pendiente',
  (public.registrar_abono(:C::uuid,:'v0'::uuid,6000,'efectivo','Ana','caja')->>'codigo')='sin_turno'
  and (select estado_pago from ventas where id=:'v0')='pendiente' and not exists (select 1 from abonos where venta_id=:'v0'));

select (public.turno_abrir(:C::uuid, 1000, 'Cajera ficticia')->>'turno_id') t1 \gset

-- 1. Caso del dueño: pan de jamón 12.000, abonan 6.000 en efectivo
select public.registrar_abono(:C::uuid,:'v0'::uuid,6000,'efectivo','Ana','caja') r1 \gset
select pg_temp.chk('abono 6.000/12.000: ok, saldo 6.000', (:'r1'::jsonb->>'ok')='true' and (:'r1'::jsonb->>'saldo')='6000');
select pg_temp.chk('la venta queda «abonada» sin medio de pago', (select estado_pago||'/'||coalesce(metodo_pago,'') from ventas where id=:'v0')='abonada/');
select pg_temp.chk('el turno cuenta SOLO los 6.000 cobrados (no 12.000)', pg_temp.cob(:'t1','efectivo')=6000);
select pg_temp.chk('turno_resumen.cobros.efectivo = 6.000', ((public.turno_resumen(:'t1')->'cobros'->>'efectivo')::int)=6000);
select pg_temp.chk('una venta abonada NO bloquea el cierre de turno', not exists (select 1 from jsonb_array_elements(public.turno_bloqueos(:'t1')) e where e->>'venta_id'=:'v0'));
select pg_temp.chk('cobro normal sobre venta abonada se rechaza (ya_cobrada)', public.cobrar_venta_manual(:C,:'v0','Efectivo')='ya_cobrada');
select pg_temp.chk('editar la comanda abonada se rechaza (ya_cobrada)', public.editar_comanda_venta(:C,:'v0',1000,'[{"nombre":"x","cantidad":1,"precio_unit":1000}]'::jsonb)='ya_cobrada');
create function pg_temp.point(v uuid, emp uuid, monto int) returns text language plpgsql as $$
begin insert into pagos_point(venta_id, restaurante_id, estado, monto) values (v::text, emp::text, 'reservado', monto); return 'aceptado'; exception when others then return sqlerrm; end $$;
select pg_temp.chk('Point no puede reservar el total de una venta abonada (VENTA_YA_COBRADA)', pg_temp.point(:'v0'::uuid,:C::uuid,12000) like 'VENTA_YA_COBRADA%', pg_temp.point(:'v0'::uuid,:C::uuid,12000));
select pg_temp.chk('abono que cubre todo el saldo → abono_cubre_todo (usar cobrar_saldo)', (public.registrar_abono(:C::uuid,:'v0'::uuid,6000,'efectivo','Ana','caja')->>'codigo')='abono_cubre_todo');
select pg_temp.chk('abono mayor al total → abono_cubre_todo', (public.registrar_abono(:C::uuid,:'v0'::uuid,99000,'efectivo','Ana','caja')->>'codigo')='abono_cubre_todo');
select pg_temp.chk('medio inválido (point/cortesía/mixto) se rechaza', (public.registrar_abono(:C::uuid,:'v0'::uuid,100,'point','x','caja')->>'codigo')='medio_invalido'
  and (public.registrar_abono(:C::uuid,:'v0'::uuid,100,'cortesia','x','caja')->>'codigo')='medio_invalido');
select pg_temp.chk('monto 0 o negativo se rechaza', (public.registrar_abono(:C::uuid,:'v0'::uuid,0,'efectivo','x','caja')->>'codigo')='monto_invalido' and (public.registrar_abono(:C::uuid,:'v0'::uuid,-5,'efectivo','x','caja')->>'codigo')='monto_invalido');
select pg_temp.chk('otro negocio no ve ni abona la venta', (public.registrar_abono(:D::uuid,:'v0'::uuid,100,'efectivo','x','caja')->>'codigo')='venta_no_encontrada'
  and (public.cobrar_saldo(:D::uuid,:'v0'::uuid,'efectivo','caja')->>'codigo')='venta_no_encontrada');

-- 2. Se cobra el saldo con el MISMO medio (efectivo + efectivo)
select public.cobrar_saldo(:C::uuid,:'v0'::uuid,'efectivo','caja') r2 \gset
select pg_temp.chk('saldo cobrado: 6.000, método «Efectivo»', (:'r2'::jsonb->>'saldo_cobrado')='6000' and (:'r2'::jsonb->>'metodo_pago')='Efectivo');
select pg_temp.chk('venta pagada por el total con pagado_at', (select estado_pago||'/'||metodo_pago||'/'||(pagado_at is not null)::text from ventas where id=:'v0')='pagado/Efectivo/true');
select pg_temp.chk('el turno cuenta 12.000 en efectivo, sin duplicar ni perder el saldo', pg_temp.cob(:'t1','efectivo')=12000 and (select count(*) from cobros_turno where venta_id=:'v0' and anulado_at is null)=2);
select pg_temp.chk('cobrar_saldo repetido se rechaza (no_abonada) y no duplica', (public.cobrar_saldo(:C::uuid,:'v0'::uuid,'efectivo','caja')->>'codigo')='no_abonada' and pg_temp.cob(:'t1','efectivo')=12000);
select pg_temp.chk('el libro de abonos suma el total', (select sum(monto) from abonos where venta_id=:'v0' and anulado_at is null)=12000);

-- 3. Medios distintos → «Mixto: …» con la suma exacta
select pg_temp.venta(:C::uuid, 20000) v2 \gset
select public.registrar_abono(:C::uuid,:'v2'::uuid,5000,'transferencia','Luis 0412','caja') \gset
select public.cobrar_saldo(:C::uuid,:'v2'::uuid,'efectivo','caja') r3 \gset
select pg_temp.chk('método final «Mixto: Efectivo $15.000 + Transferencia $5.000»', (:'r3'::jsonb->>'metodo_pago')='Mixto: Efectivo $15.000 + Transferencia $5.000', :'r3');
select pg_temp.chk('cobros del turno por medio: efectivo +15.000, transferencia +5.000', pg_temp.cob(:'t1','efectivo')=27000 and pg_temp.cob(:'t1','transferencia')=5000);

-- 4. Varios abonos y reparto en tres medios
select pg_temp.venta(:C::uuid, 30000) v3 \gset
select public.registrar_abono(:C::uuid,:'v3'::uuid,5000,'efectivo',null,'caja') \gset
select public.registrar_abono(:C::uuid,:'v3'::uuid,5000,'efectivo',null,'caja') \gset
select public.registrar_abono(:C::uuid,:'v3'::uuid,10000,'debito',null,'caja') \gset
select public.cobrar_saldo(:C::uuid,:'v3'::uuid,'transferencia','caja') r4 \gset
select pg_temp.chk('3 medios: Efectivo $10.000 + Débito $10.000 + Transferencia $10.000', (:'r4'::jsonb->>'metodo_pago')='Mixto: Efectivo $10.000 + Débito $10.000 + Transferencia $10.000', :'r4');
select pg_temp.chk('lo que parsea cierre.ts (dígitos por parte) suma el total de la venta',
  (select sum(regexp_replace(x,'[^0-9]','','g')::int) from unnest(string_to_array(substr((select metodo_pago from ventas where id=:'v3'),8),' + ')) x)=30000);

-- 5. Abono en un turno, saldo en OTRO turno: cada día cuenta lo que entró ese día
select pg_temp.venta(:C::uuid, 10000) v4 \gset
select public.registrar_abono(:C::uuid,:'v4'::uuid,4000,'efectivo','Rosa','caja') \gset
select public.turno_cerrar(:'t1','{"efectivo":99999,"debito":10000,"transferencia":15000}'::jsonb,'prueba',gen_random_uuid(),'x') c1 \gset
select pg_temp.chk('el turno 1 cierra con una venta abonada pendiente (no la trata como bloqueo)', (:'c1'::jsonb->>'ok')='true' or (:'c1'::jsonb->>'codigo')<>'bloqueado', :'c1');
select pg_temp.chk('sin turno abierto no se cobra el saldo (sin_turno)', (public.cobrar_saldo(:C::uuid,:'v4'::uuid,'efectivo','caja')->>'codigo')='sin_turno' and (select estado_pago from ventas where id=:'v4')='abonada');
select (public.turno_abrir(:C::uuid, 0, 'Cajera ficticia')->>'turno_id') t2 \gset
select public.cobrar_saldo(:C::uuid,:'v4'::uuid,'transferencia','caja') r5 \gset
select pg_temp.chk('turno 1 conserva su abono (4.000 efectivo) y el turno 2 cuenta solo el saldo (6.000 transferencia)',
  (select sum(monto) from cobros_turno where turno_id=:'t1' and venta_id=:'v4')=4000 and pg_temp.cob(:'t2','transferencia')=6000 and pg_temp.cob(:'t2','efectivo')=0);
select pg_temp.chk('método final «Mixto: Efectivo $4.000 + Transferencia $6.000»', (:'r5'::jsonb->>'metodo_pago')='Mixto: Efectivo $4.000 + Transferencia $6.000', :'r5');

-- 6. Borrar una venta abonada anula sus abonos y sus cobros
select pg_temp.venta(:C::uuid, 8000) v5 \gset
select public.registrar_abono(:C::uuid,:'v5'::uuid,3000,'efectivo',null,'caja') \gset
delete from ventas where id=:'v5';
select pg_temp.chk('borrar la venta anula abonos y cobros activos', not exists (select 1 from abonos where venta_id=:'v5' and anulado_at is null) and not exists (select 1 from cobros_turno where venta_id=:'v5' and anulado_at is null));

-- 7. Regresión: el cobro normal (sin abonos) sigue repartiendo como antes
select pg_temp.venta(:C::uuid, 9000) v6 \gset
select public.cobrar_venta_manual(:C,:'v6','Mixto: Efectivo $4.000 + Débito $5.000') \gset
select pg_temp.chk('cobro normal Mixto sigue funcionando (efectivo 4.000 + débito 5.000 en el turno 2)', pg_temp.cob(:'t2','efectivo')=4000 and pg_temp.cob(:'t2','debito')=5000);
select pg_temp.chk('regresión: dos cobros distintos de una misma venta con el mismo medio siguen sin duplicarse', (select count(*) from cobros_turno where venta_id=:'v6' and medio='efectivo' and anulado_at is null)=1);

select case when ok then 'OK    ' else 'FALLA ' end || n || case when ok then '' else '  → ' || coalesce(det,'') end from res;
select 'RESULTADO: ' || count(*) filter (where ok) || ' OK, ' || count(*) filter (where not ok) || ' fallas' from res;
