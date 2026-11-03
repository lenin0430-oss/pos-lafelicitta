-- SOLO LECTURA. Ejecutar despues de 08, antes de 09. No referencia objetos de 09.
select o, qué, valor, esperado from (
 select 1 o, '08: tablas de turno (aperturas_caja v2 + cobros_turno, movimientos_caja, cierres_turno, cierres_turno_medios, turno_eventos)' qué,
   (select count(*) from information_schema.tables where table_schema='public' and table_name in ('cobros_turno','movimientos_caja','cierres_turno','cierres_turno_medios','turno_eventos'))::text valor, '5' esperado
 union all select 2, '08: turno_bloqueos y funciones de turno', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('turno_bloqueos','turno_abrir','turno_resumen','turno_cerrar'))::text, '4'
 union all select 3, '08: triggers de caja', (select count(*) from pg_trigger where not tgisinternal and tgname in ('ventas_serializa_cierre','ventas_eliminada_anula_cobros','pagos_point_turno_abierto','ventas_cobro_a_turno','gastos_a_turno','propinas_a_turno','aperturas_v2_guard'))::text, '7'
 union all select 4, '08: cierre revisa bloqueos en el servidor', coalesce((select (pg_get_functiondef(p.oid) like '%turno_bloqueos%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='turno_cerrar'),'falta'), 'true'
 union all select 12, 'turnos abiertos ahora (debe ser 0 antes de la ventana; 0 al terminar la ventana)', (select count(*) from public.aperturas_caja where estado='abierta')::text, '0'
) q order by o;
