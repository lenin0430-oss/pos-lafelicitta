-- MesaPOS · 06 — Archivo de cocina del histórico. PROPUESTA, NO APLICADA. Requiere 03.
-- NO cambia ventas.estado: no afirma que las comandas fueron entregadas; solo las saca de la pantalla de cocina.
-- Archiva únicamente comandas en 'listo' (nunca 'pendiente' ni 'en_proceso') creadas antes del inicio del día actual en Chile.
-- Las comandas del día en curso y cualquier pendiente/en proceso siguen visibles. Ajustar el corte (fecha) antes de aplicar si hace falta.
begin;
update ventas set cocina_archivada_at = now()
where estado = 'listo' and cocina_archivada_at is null
  and created_at < date_trunc('day', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
commit;
