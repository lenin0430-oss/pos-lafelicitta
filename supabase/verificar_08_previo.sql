-- MesaPOS · PRE-VUELO de la publicación de caja/turnos. SOLO LECTURA (un único SELECT, no escribe nada).
-- Ejecutar en el proyecto que se va a publicar (producción: solo con aprobación del dueño, antes de cualquier migración).
-- Cada fila: comprobación | valor | qué se espera. Compartir el resultado completo con Codex.
with
cols as (select table_name t, column_name c from information_schema.columns where table_schema='public'),
trg as (select c.relname t, g.tgname n from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and not g.tgisinternal),
fn as (select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'),
tbl as (select table_name t from information_schema.tables where table_schema='public'),
rls as (select c.relname t, c.relrowsecurity r from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r')
select * from (
 select 1 o, '03 estados separados: ventas.estado_pago y pagado_at' k, (exists(select 1 from cols where t='ventas' and c='estado_pago') and exists(select 1 from cols where t='ventas' and c='pagado_at'))::text v, 'true antes de 08' e
 union all select 2, '04 reserva Point: pagos_point.clave_idempotencia / referencia_externa / detalle', (select count(*) from cols where t='pagos_point' and c in ('clave_idempotencia','referencia_externa','detalle'))::text, '3'
 union all select 3, '04b aislamiento: triggers en pagos_point (≥2)', (select count(*) from trg where t='pagos_point')::text, '≥ 2 (04b) + pagos_point_bloquea_venta (07c)'
 union all select 4, '07b: aprobaciones_operacion, intentos_login, eventos_seguridad', (select count(*) from tbl where t in ('aprobaciones_operacion','intentos_login','eventos_seguridad'))::text, '3'
 union all select 5, '07b: usuarios.pin_hash', exists(select 1 from cols where t='usuarios' and c='pin_hash')::text, 'true'
 union all select 6, '07c: cobrar_venta_manual y editar_comanda_venta', (select count(*) from fn where n in ('cobrar_venta_manual','editar_comanda_venta'))::text, '2'
 union all select 7, '07c: trigger pagos_point_bloquea_venta', exists(select 1 from trg where n='pagos_point_bloquea_venta')::text, 'true'
 union all select 8, '08 ya aplicada? (tablas turnos)', (select count(*) from tbl where t in ('cobros_turno','movimientos_caja','cierres_turno','cierres_turno_medios','turno_eventos'))::text, '0 antes de aplicar 08; 5 después'
 union all select 9, '08: columnas nuevas ya presentes', (select count(*) from cols where (t='aperturas_caja' and c in ('modelo','fecha_apertura','cerrada_por')) or (t='ventas' and c='turno_id') or (t='pagos_point' and c='medio_reportado'))::text, '0 antes; 5 después'
 union all select 10, 'RLS cerrada (07/07a) en ventas / usuarios', coalesce((select r::text from rls where t='ventas'),'?')||' / '||coalesce((select r::text from rls where t='usuarios'),'?'), 'false / false si 07 NO está aplicada (Fase A); true / true tras 07a y 07'
 union all select 11, 'aperturas_caja ABIERTAS (turnos antiguos a cerrar con el flujo actual antes de publicar)', (select count(*) from public.aperturas_caja where estado='abierta')::text, '0 en la ventana de publicación'
 union all select 12, 'aperturas_caja abiertas sin empresa_id', (select count(*) from public.aperturas_caja where estado='abierta' and empresa_id is null)::text, '0'
 union all select 13, 'ventas sin cobrar (estado_pago pendiente o sin_identificar)', (select count(*) from public.ventas where estado_pago in ('pendiente','sin_identificar'))::text, 'anotar; 0 de hoy en la ventana'
 union all select 14, 'cobros Point ACTIVOS (reservado, created, at_terminal)', (select count(*) from public.pagos_point where estado in ('reservado','created','at_terminal'))::text, '0 en la ventana de publicación'
 union all select 15, 'ventas pagadas como "Point" (histórico; no se reclasifica)', (select count(*) from public.ventas where metodo_pago='Point' and estado_pago='pagado')::text, 'anotar'
 union all select 16, 'default de ventas.metodo_pago', coalesce((select column_default from information_schema.columns where table_schema='public' and table_name='ventas' and column_name='metodo_pago'),'(sin default)'), 'anotar: en pruebas es ''Débito''; el POS envía '''' al crear'
 union all select 17, 'ventas sin empresa_id', (select count(*) from public.ventas where empresa_id is null)::text, '0'
 union all select 18, 'negocios (empresas)', (select count(*) from public.empresas)::text, 'anotar'
 union all select 19, 'cierres_caja existentes (histórico, no se modifica)', (select count(*) from public.cierres_caja)::text, 'anotar; debe ser idéntico después'
) q order by o;
