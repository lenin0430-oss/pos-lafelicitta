-- Reversión de 04b. No toca datos.
begin;
drop trigger if exists trg_pagos_point_valida_venta on pagos_point;
drop function if exists pagos_point_valida_venta();
commit;
