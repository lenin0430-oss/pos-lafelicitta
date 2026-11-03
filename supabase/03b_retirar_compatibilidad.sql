-- Ejecutar SOLO cuando el código anterior (que cobra con estado='listo') ya no esté desplegado en ningún lado.
drop trigger if exists trg_ventas_compat_estado_pago on ventas;
drop function if exists ventas_compat_estado_pago();
