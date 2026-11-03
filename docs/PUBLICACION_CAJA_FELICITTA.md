# Publicación de la candidata con Caja/Turnos para La Felicitta (PROCEDIMIENTO — NADA EJECUTADO)

Candidata: rama `claude/candidata-permisos-point-2026-11-02` (caja incluida). Producción hoy: `origin/main` 4bcd30e, despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y`, Supabase `xlzbqgvmwbskpfajehgi`.
Este documento **no autoriza** nada: cada paso con ★ requiere visto bueno explícito del dueño y coordinación con Codex. Complementa `PLAN_PUBLICACION.md` y `CANDIDATA_PERMISOS_POINT.md` (no los reemplaza).

## 0. Bloqueantes pendientes (no publicar mientras estén abiertos)
1. **Estado real de producción sin verificar**: ¿están aplicadas 03/04/04b/07b/07c? Ejecutar (solo lectura, ★) `supabase/verificar_08_previo.sql` (19 comprobaciones) y `verificar_03_04.sql`, `verificar_04b.sql`. Si 03/04/04b no están, 08 no se aplica antes de ellas.
2. **Variables de entorno en Vercel** (nombres, sin valores): `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (el cron pasó a `/api/reporte-semanal` y pierde el token fijo), `PIN_*`, `BOT_URL`/`BOT_SECRET`/`BOT_EMPRESA_ID`, `MP_*`. Comprobar presencia; no leer valores.
3. **Respaldo**: confirmar en Supabase si el plan tiene copias automáticas/PITR; si no, exportar CSV de `ventas`, `gastos`, `propinas`, `aperturas_caja`, `cierres_caja`, `pagos_point` **y** ejecutar `supabase/respaldo_previo_08.sql` (crea esquema `respaldo_pre08`; aborta si ya existe).
4. **Turno actual (modelo antiguo) abierto**: hay que cerrarlo con el flujo antiguo **antes** de publicar (ver §3). El cierre real incorrecto del turno anterior (sobrante $140.400) **no se toca**; la referencia −$9.090 sigue PROVISIONAL.
5. **Menú y bot**: confirmar que no usan `pedidos`, `pedido_items`, `mesas`, `configuracion_empresa` ni columnas de `empresas` con la llave pública antes de 07a/07 (Fase B). Hasta confirmarlo, solo Fase A.
6. **Medios reales de Point** (`payment_method.type`): valores no confirmados; lo no reconocido queda «por conciliar» (diferencia PROVISIONAL, conciliación manual). Verificar tras la primera venta real.
7. **Decisión del dueño**: cobro sin turno abierto (bloquear vs. permitir con evento `cobro_sin_turno`); propina en efectivo sacada del cajón = retiro.
8. **Build Windows** del commit final y prueba del preview sobre ese commit (Codex).
9. Aviso WhatsApp ampliado: **fuera de esta entrega** (ver §6).

## 1. Orden — Fase A (código nuevo con bandera 0, sin cerrar `usuarios`)
| # | Paso | Detalle |
|---|---|---|
| A0 | ★ Lectura y respaldo | `verificar_08_previo.sql`, `respaldo_previo_08.sql`, CSV. Guardar salidas. |
| A1 | ★ SQL previos si faltan | `03` → `04` → `04b` → `07b` → `07c` (cada uno con verificación). |
| A2 | Variables en Vercel | §0.2. `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=0`, `PIN_MODO=legacy`. |
| A3 | ★ Ventana de baja actividad: **cerrar el turno antiguo** | Pantalla antigua «Cierre»; anotar cifras y guardar. Si hubiera aperturas antiguas colgadas: `transicion_turnos_antiguos_PROPUESTA.sql` (lista; el UPDATE viene comentado y exige ids explícitos aprobados). |
| A4 | ★ Aplicar **solo** `08_turnos_caja.sql` (final, SHA-256 `9956c5ed…`; NO aplicar 08b: ya incluida) | Inmediatamente antes del despliegue. |
| A5 | ★ Desplegar candidata | Sin tocar precios ni diseño. |
| A6 | ★ Abrir el turno nuevo desde «Cierre» (fondo real) | Hacerlo ya: sin turno v2, los cobros generan eventos `cobro_sin_turno`. |
| A7 | Comprobaciones (§4) | |

## 2. Fase B (separada, otra ventana)
`07a` → bandera `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1` y redeploy → verificar (§4 + negativos con llave pública) → `07`. Solo tras §0.5 y rotación del secreto del bot según `ROTACION_SECRETO_BOT.md`. El turno v2 no depende de la Fase B (usa `/api/turno` con la sesión firmada).

## 3. Transición del turno actual
- La jornada va de ~11:00 hasta «Cerrar turno» (00:00–01:00 del día siguiente); nada se reinicia a medianoche. Elegir un momento **después de cerrar** el turno del día (no a mitad de jornada).
- Si no es posible esperar: cerrar el antiguo, aplicar 08, desplegar y abrir el nuevo con el fondo físico contado; lo vendido entre medio queda fuera de cualquier turno v2 (no se reasigna por inferencia).
- Histórico: no se reescribe. Los cierres antiguos siguen en `cierres_caja` y el nuevo cierre inserta además una fila de compatibilidad.
- Aperturas antiguas abiertas: no se cierran solas; revisión y aprobación del dueño con el script de transición.

## 4. Comprobaciones tras publicar (en este orden)
1. **Menú público** carga y muestra precios vigentes (Pollo broaster $5.500, Pollo al horno $5.000); diseño sin cambios.
2. **Bot**: mensaje de prueba; sin errores 401/403; si el secreto rotó, ver fases.
3. **POS**: login admin y garzón; venta de prueba **marcada y anulable** (efectivo) → aparece en «Lo registrado» del turno; anularla.
4. **Point** (si hay terminal): una venta pequeña real; verificar `pagos_point.medio_reportado` y que el cobro quede «ya confirmado» con el medio correcto; si queda «por conciliar», conciliar a mano y anotar el valor real del proveedor.
5. **Cierre**: simulación con retiro y gasto; imprimir ticket 58 mm (prueba física de impresora); **Reimprimir cierre** desde historial con cifras originales; PROVISIONAL visible con Point por conciliar.
6. **Aviso** (si bot configurado): que falle no impide guardar el cierre y se muestra «NO enviado».
7. Reporte semanal (`CRON_SECRET`) responde 401 sin token y 200 con token.
8. Logs de Vercel/Supabase sin errores nuevos durante 30 min.

## 5. Reversión
Criterio: revertir ante cobros que no se registran, cierre imposible o errores 5xx sostenidos.
1. Código: promover/rollback al despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y` (4bcd30e). Válido solo si 07a/07 **no** se aplicaron (si lo están, antes hay que revertirlas con las de emergencia, que reabren el acceso inseguro: solo si el negocio no puede operar).
2. Base: `supabase/08_turnos_caja_REVERSION.sql` — copia las tablas a `respaldo_turnos`, elimina triggers/funciones/tablas v2 y las columnas `ventas.turno_id` y `pagos_point.medio_reportado`; **conserva** las columnas añadidas a `aperturas_caja`. Orden: código anterior primero, luego reversión SQL.
3. Se pierde para la operación (queda en `respaldo_turnos`): los turnos v2, cobros por medio, retiros, cierres v2 y eventos creados desde la publicación. Los cierres de compatibilidad en `cierres_caja` permanecen.
4. Reversión previa de 07x/04x/03 según `CANDIDATA_PERMISOS_POINT.md` (orden inverso).
5. Si se revierte, cerrar el turno a mano con cifras de papel y reabrir con el flujo antiguo.

## 6. Pendiente separado: aviso al dueño por WhatsApp
Hoy lo dispara el navegador y el payload permitido no lleva pendientes, retiros, fecha/n.º de turno, propinas ni detalle de gastos; `notas` no está en la lista permitida; no se envía con diferencia PROVISIONAL. Entrega aparte: mover el envío al servidor tras guardar el cierre, con reintento y estado persistido. Mientras tanto un fallo no bloquea el cierre ni aparenta envío.

## 7. Evidencia disponible
PG16 55/55 + carrera 4/4 (PG17 por Codex en la revisión anterior), TS 154/154, `tsc` limpio, dos recorridos en navegador sobre el proyecto aislado (`docs/evidencia/CAJA_navegador_2026-11-03.md`). Falta: navegador sobre el commit final (reimpresión, PROVISIONAL, aviso fallido), build Windows, impresora física.
