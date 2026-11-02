-- Reversión de 06: vuelve a mostrar en cocina lo archivado. No toca ventas.estado.
update ventas set cocina_archivada_at = null where cocina_archivada_at is not null;
