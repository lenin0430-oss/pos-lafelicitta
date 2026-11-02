-- MesaPOS · verificación SOLO LECTURA del flujo pedido → cocina → cobro → entrega → cierre. Para el proyecto de PRUEBAS.
-- Pega cada bloque en el editor SQL de Supabase (proyecto de pruebas) después de cada caso y compara con lo esperado de docs/PRUEBA_NAVEGADOR.md.

-- A) Últimas ventas: cocina y pago por separado
select numero, mesa, total, estado as cocina, estado_pago, metodo_pago, pagado_at, cocina_archivada_at, created_at
  from ventas order by created_at desc limit 15;

-- B) Intentos de cobro Point de las últimas ventas (un intento activo como máximo por venta)
select v.numero, p.estado, p.monto, p.mp_order_id, p.detalle, left(p.clave_idempotencia::text, 8) as clave, p.created_at
  from pagos_point p join ventas v on v.id::text = p.venta_id
 order by p.created_at desc limit 30;

-- C) Invariantes (todas deben devolver 0 filas)
-- C1: venta con más de un intento activo
select venta_id, count(*) from pagos_point where estado in ('reservado','created','at_terminal') group by 1 having count(*) > 1;
-- C2: venta pagada por Point sin ningún cobro 'processed'
select v.numero from ventas v where v.metodo_pago = 'Point' and v.estado_pago = 'pagado'
   and not exists (select 1 from pagos_point p where p.venta_id = v.id::text and p.estado = 'processed');
-- C3: cobro 'processed' cuya venta no quedó pagada
select v.numero from pagos_point p join ventas v on v.id::text = p.venta_id where p.estado = 'processed' and v.estado_pago <> 'pagado';
-- C4: cobro de un negocio sobre una venta de otro (aislamiento)
select p.id from pagos_point p left join ventas v on v.id::text = p.venta_id where v.id is null or v.empresa_id::text <> p.restaurante_id::text;
-- C5: ventas ya entregadas que siguen pendientes de pago (informativo; no es error: se cobra aparte)
select numero, estado, estado_pago from ventas where estado = 'entregado' and estado_pago = 'pendiente';

-- D) Cierre: cobros por método (solo ventas pagadas; el rechazo, cancelación o expiración NO suman)
select metodo_pago, count(*) as ventas, sum(total) as total from ventas where estado_pago = 'pagado' group by 1 order by 1;
