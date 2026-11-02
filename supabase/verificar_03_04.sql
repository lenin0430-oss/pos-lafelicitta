-- SOLO LECTURA. Ejecutar antes y después de cada migración y comparar. No modifica nada.
-- 1) Invariantes de importes (deben ser idénticos antes y después de 03):
select count(*) as ventas, coalesce(sum(total),0) as suma_total from ventas;
-- 2) Después de 03: distribución por estado de pago.
select estado_pago, count(*) n, coalesce(sum(total),0) total from ventas group by 1 order by 1;
-- 3) Ninguna venta pagada sin método, ninguna cortesía con método distinto, ningún sin_identificar con método:
select count(*) as pagadas_sin_metodo        from ventas where estado_pago='pagado'          and btrim(coalesce(metodo_pago,''))='';
select count(*) as sin_identificar_con_metodo from ventas where estado_pago='sin_identificar' and btrim(coalesce(metodo_pago,''))<>'';
-- 4) Nada pasó a pagado sin haber estado 'listo' (estado_legacy conserva el original; las 'listo' recientes siguen 'listo'):
select count(*) as pagadas_sin_listo from ventas where estado_pago='pagado' and coalesce(estado_legacy,estado) <> 'listo';
-- 5) Cocina tras 03: comandas visibles (pendiente/en_proceso/listo) — debe ser pequeño:
select estado, count(*) from ventas where estado in ('pendiente','en_proceso','listo') group by 1;
-- 6) Pruebas del esquema de 04:
select count(*) as reservados_huerfanos from pagos_point where estado = 'reservado' and created_at < now() - interval '10 minutes';
select indexname from pg_indexes where tablename='pagos_point' order by 1;
-- 7) El esquema real: restricciones sobre ventas (confirmar que 'entregado' y los 4 estados de pago son válidos)
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='ventas'::regclass;
