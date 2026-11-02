-- Reversión de 04b. No toca datos. Una sola transacción.
begin;
drop trigger if exists trg_ventas_protege_pagos_point on ventas;
drop function if exists ventas_protege_pagos_point();
drop trigger if exists trg_pagos_point_valida_venta on pagos_point;
drop function if exists pagos_point_valida_venta();
commit;
