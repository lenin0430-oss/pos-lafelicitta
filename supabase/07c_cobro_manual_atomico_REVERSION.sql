-- Reversión de 07c: quita el trigger y las funciones. No toca datos.
begin;
drop trigger if exists pagos_point_bloquea_venta on public.pagos_point;
drop function if exists public.pagos_point_bloquea_venta();
drop function if exists public.cobrar_venta_manual(text, text, text, integer);
drop function if exists public.editar_comanda_venta(text, text, integer, jsonb, text, text, integer);
commit;
