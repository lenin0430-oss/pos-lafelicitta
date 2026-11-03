# Publicación de la candidata con Caja/Turnos para La Felicitta (PROCEDIMIENTO — NADA EJECUTADO)

Candidata: rama `claude/candidata-permisos-point-2026-11-02` (caja incluida). Producción hoy: `origin/main` 4bcd30e, despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y`, Supabase `xlzbqgvmwbskpfajehgi`.
Este documento **no autoriza** nada: cada paso con ★ requiere visto bueno explícito del dueño y coordinación con Codex. Revisión 3 (03/11): reglas del dueño (cierre bloqueado, sin cobros sin turno), Fase A con servidor=1, miércoles sin jornada. Complementa `PLAN_PUBLICACION.md` y `CANDIDATA_PERMISOS_POINT.md`.

## 0. Reglas decididas por el dueño (ya implementadas y probadas en la candidata)
1. **Bot/WhatsApp después.** Sin configurar: el cierre muestra «NO enviado»; POS y cierre siguen funcionando.
2. **«Cerrar turno» se bloquea** si quedan: comandas activas sin entregar, ventas sin cobrar, pagos Point en proceso o cobros con medio por confirmar. Se muestra cuáles (n.º, mesa, monto, motivo) con enlace para ir a resolverlas. **Reemplaza** la antigua opción de cerrar «con pendientes».
3. **Se valida en el servidor, dentro de la transacción de cierre** (`turno_cerrar` toma el turno `FOR UPDATE` y revisa `turno_bloqueos`). Deshabilitar el botón es solo cortesía. Una comanda o un pago que entra mientras se cierra queda serializado (comandas y reservas Point toman el turno `FOR SHARE`).
4. **Nada se cancela, entrega ni cobra solo.** Las comandas archivadas de cocina (marca de `06`) no cuentan; las pendientes reales de días anteriores **sí** cuentan.
5. **No se cobra sin turno abierto** (P0413 `SIN_TURNO_ABIERTO`: cobro manual, cortesía, venta creada ya pagada y reserva Point; el POS ofrece «Abrir turno»). Se pueden seguir tomando comandas. Única excepción: un pago que el proveedor ya confirmó (`processed`) no se pierde; queda registrado como `cobro_sin_turno`.

## 1. Estado comprobado por Codex en producción (solo lectura, 03/11/2026)
- **Faltan 03, 04, 04b, 07b, 07c y 08.** Hay un **turno real abierto** (modelo antiguo).
- Vercel: `SESSION_SECRET`, llave de servicio de Supabase y variables `MP_*` presentes. **No aparecen `CRON_SECRET` ni las variables del bot.**
- 08 **depende de 03** (`ventas.estado_pago`, `cocina_archivada_at`). `verificar_08_previo.sql` funciona sin 03 (`n/a`).

## 2. Bloqueantes antes de fijar fecha
1. ★ Aprobación del criterio de `docs/conversion-historica-estado-pago.md` (lo ejecuta 03).
2. ★ **`06` (archivar cocina histórica) pasa a ser OBLIGATORIO con corte aprobado**: en producción hay miles de comandas `listo` sin archivar; sin 06 ningún turno podría cerrarse (se listarían como «sin entregar»). Fila 20–22 de `verificar_08_previo.sql` mide lo que bloquearía; las comandas/ventas sin cobrar **antiguas reales** las decide el dueño (entregar/cobrar o archivar con corte), no se ocultan por inferencia.
3. **Operación diaria**: toda comanda debe terminar en «Entregado» (Cocina) y toda venta cobrada; si no, el cierre se bloquea cada noche. El dueño confirma que el equipo lo hará.
4. **Fase A usa `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`**: exige 07b y 07c aplicadas. 07a/07 (Fase B) siguen separadas.
5. Vercel (valores solo por el dueño): `CRON_SECRET` (el cron semanal), `PIN_MODO=legacy`. Bot/WhatsApp: no se configura en esta entrega (decisión 1).
6. **Respaldo**: confirmar copias/PITR del plan; además CSV y `respaldo_previo_08.sql`.
7. Medios reales de Point sin confirmar: lo no reconocido queda «por conciliar» y **bloquea el cierre hasta que la cajera lo confirme** (esa pantalla ya existe). Propina en efectivo sacada del cajón = retiro.
8. Impresora térmica 58 mm: prueba física. Fase B (menú/bot frente a 07): no bloquea Fase A.

## 3. Ventana concreta (propuesta; la fecha la fija el dueño)
Jornada: ~11:00 hasta «Cerrar turno» (00:00–01:00 siguiente); **el miércoles no hay jornada**. Propuesta: **miércoles 04-11 desde las 10:00**. **La caja real queda SIN turno abierto hasta el jueves** (el dueño abre el turno real el jueves antes de vender).

**Antes (martes noche)**: el turno real actual se cierra con el flujo ANTIGUO. Nada se publica antes. Anotar cifras.

| Hora | Paso | Quién | Verificación / si falla |
|---|---|---|---|
| 10:00 | **V0** `verificar_08_previo.sql` + `verificar_03_04.sql` + `verificar_04b.sql` (solo lectura). Esperado: fila 11 = 0 abiertas, 14 = 0; anotar 13 y 20–23. | Codex/dueño ★ | Turno abierto o Point activo: no seguir. |
| 10:10 | **R** CSV (`ventas, gastos, propinas, aperturas_caja, cierres_caja, pagos_point, usuarios`) + `respaldo_previo_08.sql`; anotar conteos y suma. | ★ | Si existe `respaldo_pre08`: detenerse. |
| 10:25 | Variables Vercel (§2.5) y flag `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`; **sin desplegar aún**. | dueño | |
| 10:35 | SQL, cada uno una transacción y verificado antes del siguiente: `03` → `04` → `verificar_04b` → `04b` → `07b` → `07c` → `06` (corte aprobado). | ★ | Fallo: `*_REVERSION.sql` de ese paso y detenerse. |
| 11:15 | **V1** repetir `verificar_08_previo.sql`: filas 20–22 = 0 (o lista aprobada por el dueño). | ★ | Si no es 0: resolver/archivar antes de 08. |
| 11:20 | Aplicar **solo** `08_turnos_caja.sql` (final, SHA-256 `6f126848…`; **no** 08b ni 08c: ya incluidos). Verificar fila 8 = 5 y 9 = 5. | ★ | `08_turnos_caja_REVERSION.sql`. |
| 11:25 | **Desplegar** la candidata (flag=1). | ★ | Ver §6 (rollback con 08). |
| 11:30 | **Comprobaciones §5** (sin turno: cobro bloqueado; menú; login; prueba identificada). | Codex+dueño | |
| 12:15 | Revisar logs 30 min; decidir «queda» o reversión. **Confirmar que no queda turno abierto.** | | |

Fase B (07a → flag ya en 1 → 07) en otra ventana, tras confirmar menú/bot y la rotación del secreto.
Proyecto de pruebas (`mesapos-pruebas-aislado`): tiene 08 + 08b; para tener las reglas nuevas se aplica **`08c_bloqueos_cierre_sin_turno.sql`** (incremental, una transacción; verificado idéntico a 08 final: mismas funciones, triggers, restricciones y permisos). Nunca 08c en producción.

## 4. Pruebas de miércoles: siempre identificadas como PRUEBA
- Ninguna comprobación deja una caja real abierta ni cifras reales alteradas. Dinero real: **ninguno** (no se prueba Point real; la primera venta Point real del jueves se vigila: medio informado o confirmación manual).
- Sin turno abierto (estado natural tras publicar): en el POS, intentar cobrar una comanda de la mesa «PRUEBA» → mensaje «No hay turno abierto» con «Abrir turno»; el cobro no se registra (no escribe datos).
- Si hay que probar apertura/cierre: abrir turno con fondo $0, notas «PRUEBA — no real», una venta de la mesa «PRUEBA» de $1.000 en efectivo, comprobar «Lo registrado», **borrar la venta desde Reportes** (anula el cobro, queda en el historial de eventos), dejar la comanda «Entregado» y **cerrar** con contado $0. Queda un cierre «PRUEBA» en $0 identificable por sus notas; el turno queda cerrado.
- Al terminar: `select count(*) from aperturas_caja where estado='abierta'` = 0.

## 5. Comprobaciones tras publicar
0. Con flag=1 el navegador solo llama a `/api/datos` (pestaña Red: ninguna llamada directa a Supabase).
1. **Menú público** carga con precios vigentes (Pollo broaster $5.500, Pollo al horno $5.000); diseño sin cambios.
2. **POS**: login admin y garzón; garzón ≥ $30.000 exige aprobación; sin turno el garzón ve «CAJA CERRADA» y el admin la franja «Sin turno abierto» con «Abrir turno».
3. **Cierre bloqueado**: con una comanda de PRUEBA sin entregar, «Cerrar turno» muestra «No se puede cerrar todavía» con n.º, mesa, monto y motivo y no cierra aunque se fuerce desde la red.
4. **Bot**: no se configura aquí: el cierre debe decir «Aviso al dueño: NO enviado… El cierre sí quedó guardado».
5. **Reimprimir cierre** desde el historial con cifras originales.
6. Reporte semanal (`CRON_SECRET`): 401 sin token, 200 con token.
7. Logs de Vercel/Supabase sin errores nuevos durante 30 min.
8. Jueves, primera venta Point real: revisar `pagos_point.medio_reportado` y, si queda «por confirmar», la cajera la confirma antes de cerrar.

## 6. Reversión
Criterio: cobros que no se registran, cierre imposible o errores 5xx sostenidos. La reversión de código no revierte la base.
1. **Código antiguo + 08 juntos**: con la regla «no cobrar sin turno», el POS antiguo (4bcd30e) no puede cobrar mientras no haya turno v2 abierto y tampoco cierra uno v2 (P0412). Por eso el rollback de código a `dpl_AMbvJb44WNSnrK41ui1thQzZ8y` va **acompañado de `08_turnos_caja_REVERSION.sql`** (guarda todo en `respaldo_turnos`; si ya existe, aborta y pide renombrarlo; quita triggers, funciones, tablas y las columnas `ventas.turno_id` y `pagos_point.medio_reportado`; conserva las columnas añadidas a `aperturas_caja`). Los cierres de compatibilidad en `cierres_caja` permanecen.
2. Luego cerrar a mano con cifras de papel y operar con el flujo antiguo.
3. `07c/07b` solo se revierten después de volver al código antiguo y con bandera 0.
4. Orden inverso completo: código → 08 → 07c → 07b → 04b → 04 → 06 → 03 (cada uno con su `*_REVERSION*.sql`; 03 pierde `pagado_at` y la distinción cortesía/sin identificar/pagado de ventas nuevas). Las reversiones de emergencia de 07a/07 reabren el acceso inseguro: solo si el negocio no puede operar.
5. Restauración total (último recurso): desde `respaldo_pre08` y los CSV, con aprobación del dueño.

## 7. Evidencia (03/11/2026, candidata con reglas del dueño)
- PostgreSQL 16 real: `scripts/prueba-caja/turnos.sql` **81/81** (incluye: comanda histórica sin archivar bloquea; archivada no; pagada pero sin entregar sigue bloqueando y no se entrega sola; Point en proceso y cobro por confirmar bloquean; días anteriores no se ocultan; otro negocio no cuenta; cierre bloqueado no cambia nada y deja evento; cobro/cortesía/venta pagada/reserva Point sin turno → P0413; Point ya confirmado se registra sin turno; borrar venta anula cobros sin error de FK).
- Carreras con dos conexiones reales: `carrera.sh` 4/4 (gastos) y **`carrera2.sh` 8/8**: comanda nueva, venta pagada, reserva Point y cobro manual contra el cierre, en **ambos órdenes** (si la operación llega primero, el cierre la ve; si el cierre llega primero, la operación queda fuera del turno cerrado o se rechaza P0413 sin dejar rastro).
- 08c sobre 08+08b ≡ 08 final (comparación de funciones, triggers, restricciones, índices y permisos); reversión y re-aplicación probadas.
- TypeScript: 159 pruebas, `tsc` limpio. Pendiente: build Windows del commit final (Codex), navegador sobre el proyecto de pruebas con 08c, impresora física, Point real.
