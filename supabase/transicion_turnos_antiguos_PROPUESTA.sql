-- MesaPOS · TRANSICIÓN del turno actual (PROPUESTA — NO EJECUTAR sin aprobación expresa del dueño).
-- Contexto: un turno "antiguo" abierto (modelo legacy) no puede cerrarse con la pantalla nueva, y el POS del garzón considera la caja
-- abierta mientras exista cualquier apertura abierta. Lo correcto es cerrarlo con el flujo ACTUAL (pantalla de cierre vigente) ANTES de publicar.
-- Este script solo cubre el caso residual (aperturas abandonadas que quedaron abiertas). No cambia ventas, gastos ni cierres.

-- PASO 1 (solo lectura): ¿qué aperturas abiertas hay?
select id, empresa_id, fecha, monto_inicial, cajero, created_at, created_at at time zone 'America/Santiago' as apertura_chile
  from public.aperturas_caja where estado = 'abierta' order by created_at;

-- PASO 2 (ESCRIBE; descomentar y ejecutar solo con aprobación, indicando los ids revisados en el paso 1):
-- begin;
-- update public.aperturas_caja set estado = 'cerrada', cerrada_at = now()
--  where estado = 'abierta' and modelo = 'legacy' and id in ('<id revisado 1>', '<id revisado 2>');
-- -- esperado: exactamente la cantidad de ids indicados
-- commit;
-- Nota: no crea fila en cierres_caja; el cierre real del turno sigue siendo el que hizo el cajero con la pantalla vigente.
