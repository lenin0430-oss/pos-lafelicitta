-- Reversión de 04. Antes: desplegar código anterior. Las filas existentes no se borran.
-- Si hubiera filas 'reservado' sin mp_order_id, revisar a mano antes de revertir (podrían tener una orden viva en MP).
begin;
drop index if exists pagos_point_un_intento_activo;
alter table pagos_point drop column if exists detalle;
alter table pagos_point drop column if exists referencia_externa;
alter table pagos_point drop column if exists clave_idempotencia;
commit;
