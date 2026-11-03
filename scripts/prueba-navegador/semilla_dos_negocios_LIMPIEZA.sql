-- Elimina SOLO lo sembrado por semilla_dos_negocios_FICTICIA.sql (uuid e2e…) y lo generado en esas empresas. Proyecto de pruebas únicamente.
-- Es destructivo: requiere confirmación de la herramienta. Respaldo previo del proyecto en el esquema respaldo_e2e.
begin;
delete from pagos_point where restaurante_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from propinas  where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from gastos    where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from cierres_caja where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from ventas    where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from aperturas_caja where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from mp_cuentas where restaurante_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from mesas     where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from productos where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from categorias where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from usuarios  where empresa_id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
delete from empresas  where id in ('e2e00000-0000-4000-8000-00000000000a','e2e00000-0000-4000-8000-00000000000b');
commit;
