# Publicación de la candidata con Caja/Turnos para La Felicitta (PROCEDIMIENTO — NADA EJECUTADO)

Candidata: rama `claude/candidata-permisos-point-2026-11-02` (caja incluida). Producción hoy: `origin/main` 4bcd30e, despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y`, Supabase `xlzbqgvmwbskpfajehgi`.
Este documento **no autoriza** nada: cada paso con ★ requiere visto bueno explícito del dueño y coordinación con Codex. Revisión 2 (03/11): Fase A con servidor=1; estado real de producción según Codex. Complementa `PLAN_PUBLICACION.md` y `CANDIDATA_PERMISOS_POINT.md`.

## 0. Estado comprobado por Codex en producción (solo lectura, 03/11/2026)
- **Faltan 03, 04, 04b, 07b, 07c y 08.** Hay un **turno real abierto** (modelo antiguo).
- Vercel: `SESSION_SECRET`, llave de servicio de Supabase y variables `MP_*` presentes. **No aparecen `CRON_SECRET` ni las variables del bot** (`BOT_URL`, `BOT_SECRET`, `BOT_EMPRESA_ID`).
- Consecuencia: 08 **depende de 03** (usa `ventas.estado_pago`); no se puede aplicar sola. `verificar_08_previo.sql` ya no falla sin 03 (muestra `n/a`; probado en una base sin `estado_pago`).

## 1. Decisiones/bloqueantes que faltan antes de fijar fecha
1. ★ Aprobación del dueño del criterio de `docs/conversion-historica-estado-pago.md` (lo ejecuta 03). `06` (archivar cocina histórica) es opcional: solo con corte aprobado.
2. **Fase A usa `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`** (corrección de Codex): con 0 el cobro manual escribe directo y se salta la operación atómica 07c. Por eso Fase A **exige 07b y 07c aplicadas** y las variables de servidor presentes. 07a y 07 (cierre de permisos) siguen separadas (Fase B).
3. Crear en Vercel (valores solo por el dueño; no se leen ni se pegan en el chat): `CRON_SECRET` (Vercel lo envía solo como `Authorization: Bearer` al cron `/api/reporte-semanal`; sin él el reporte semanal queda en 401/503), `PIN_MODO=legacy`.
4. **Bot / aviso al dueño**: sin `BOT_URL`/`BOT_SECRET`/`BOT_EMPRESA_ID` el aviso saldrá "NO enviado" (verificado en navegador: el cierre se guarda igual). Decisión del dueño: (a) publicar así y avisar a mano, o (b) rotación previa según `ROTACION_SECRETO_BOT.md` (fase A del bot: acepta ambos secretos → crear variables → fase C). El cierre no depende de esto.
5. **Respaldo**: confirmar si el plan de Supabase tiene copias/PITR; además CSV y `respaldo_previo_08.sql` (§2, paso R).
6. Dueño: ¿cobro sin turno abierto bloquea o se permite? Propina en efectivo sacada del cajón = retiro. Medios reales de Point sin confirmar (lo no reconocido queda "por conciliar" → diferencia PROVISIONAL).
7. Prueba física de impresora térmica 58 mm.
8. Menú/bot frente a Fase B (tablas que cierra 07) — solo antes de 07a/07, no bloquea Fase A.

## 2. Ventana concreta (propuesta; fecha la fija el dueño)
Jornada normal: ~11:00 hasta «Cerrar turno» (00:00–01:00 del día siguiente); **el miércoles no se abre jornada**. Propuesta: **miércoles 04-11, desde las 10:00** (sin ventas), con el turno del martes ya cerrado.

**Antes (martes noche): el turno real actual se cierra con el flujo ANTIGUO, como siempre** (nada se publica antes). Anotar cifras y guardar el cierre. Sin cobros Point activos ni ventas sin cobrar.

| Hora | Paso | Quién | Verificación / si falla |
|---|---|---|---|
| 10:00 | **V0** `verificar_08_previo.sql` + `verificar_03_04.sql` + `verificar_04b.sql` (solo lectura). Esperado: fila 11 = 0 abiertas, 14 = 0, 13 anotada. | Codex/dueño ★ | Si hay turno abierto o Point activo: no seguir. |
| 10:10 | **R** Respaldo: exportar CSV (`ventas, gastos, propinas, aperturas_caja, cierres_caja, pagos_point, usuarios`) y ejecutar `respaldo_previo_08.sql`; anotar conteos y suma. | ★ | Si ya existe `respaldo_pre08`: detenerse. |
| 10:25 | Variables Vercel (§1.3) y flag `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`; **aún sin desplegar**. | dueño | |
| 10:35 | SQL en este orden, **cada uno una transacción y verificado antes del siguiente**: `03` → `04` → `verificar_04b` → `04b` → `07b` → `07c` (+ `06` solo si aprobado). Con el código actual (4bcd30e) la app sigue operando tras 03/04/04b (compatibles); probar con una venta de la mesa PRUEBA. | ★ | Fallo: reversión de ese paso (`*_REVERSION.sql`) y detenerse. |
| 11:15 | Aplicar **solo** `08_turnos_caja.sql` (final, SHA-256 `9956c5ed…`; **no** 08b). Verificar fila 8 = 5 y fila 9 = 5 de `verificar_08_previo.sql`. | ★ | `08_…_REVERSION.sql`. |
| 11:20 | **Desplegar** la candidata (flag=1). Esperar a "Ready". | ★ | Rollback a `dpl_AMbvJb44WNSnrK41ui1thQzZ8y`. |
| 11:25 | Abrir el turno nuevo (fondo real contado). Sin turno v2 los cobros generan eventos `cobro_sin_turno`. | dueño | |
| 11:30 | Comprobaciones §4 (menú, bot, POS, Point, cierre de prueba). El turno de prueba **no** se usa como real: cerrarlo y abrir el real con el fondo físico. | Codex+dueño | |
| 12:30 | Revisión de logs 30 min; decidir "queda" o reversión. | | |

Duración estimada: 2 h; la operación comercial del jueves ya corre sobre el nuevo flujo. Fase B (07a → flag ya en 1 → 07) en otra ventana, tras confirmar menú/bot y la rotación del secreto.

## 4. Comprobaciones tras publicar (en este orden)
0. Con flag=1 el navegador solo llama a `/api/datos` (revisar la pestaña Red: ninguna llamada directa a Supabase).
1. **Menú público** carga y muestra precios vigentes (Pollo broaster $5.500, Pollo al horno $5.000); diseño sin cambios.
2. **Bot**: mensaje de prueba; sin errores 401/403; si el secreto rotó, ver fases.
3. **POS**: login admin y garzón; cobro manual con garzón ≥ $30.000 exige aprobación; venta de prueba **marcada y anulable** (efectivo) → aparece en «Lo registrado» del turno; anularla.
4. **Point** (si hay terminal): una venta pequeña real; verificar `pagos_point.medio_reportado` y que el cobro quede «ya confirmado» con el medio correcto; si queda «por conciliar», conciliar a mano y anotar el valor real del proveedor.
5. **Cierre**: simulación con retiro y gasto; imprimir ticket 58 mm (prueba física de impresora); **Reimprimir cierre** desde historial con cifras originales; PROVISIONAL visible con Point por conciliar.
6. **Aviso** (si bot configurado): que falle no impide guardar el cierre y se muestra «NO enviado».
7. Reporte semanal (`CRON_SECRET`) responde 401 sin token y 200 con token.
8. Logs de Vercel/Supabase sin errores nuevos durante 30 min.

## 5. Reversión
Criterio: cobros que no se registran, cierre imposible o errores 5xx sostenidos. Reglas: la reversión de código no revierte la base; no revertir SQL con un turno v2 abierto sin cerrarlo (o aceptando que pasa a `respaldo_turnos`).
1. **Solo código**: rollback a `dpl_AMbvJb44WNSnrK41ui1thQzZ8y` (4bcd30e). El POS antiguo opera con 03/04/04b/07b/07c/08 aplicadas (compatibles). Si hay turno v2 abierto, el flujo antiguo de cierre queda bloqueado (P0412): cerrar el turno v2 antes o aplicar la reversión de 08.
2. **Reversión de 08**: `08_turnos_caja_REVERSION.sql` (guarda turnos v2, cobros por medio, retiros, cierres v2 y eventos en `respaldo_turnos`; elimina triggers/funciones/tablas; quita `ventas.turno_id` y `pagos_point.medio_reportado`; conserva las columnas añadidas a `aperturas_caja`). Los cierres de compatibilidad en `cierres_caja` permanecen. Luego cerrar a mano con cifras de papel y abrir con el flujo antiguo.
3. **Reversión de 07c/07b**: solo después de volver al código antiguo **y** con bandera 0 (el código nuevo con flag=1 las necesita).
4. Orden completo inverso: código → 08 → 07c → 07b → 04b → 04 → (06) → 03. Cada una con su `*_REVERSION*.sql`; 03 pierde `pagado_at` y la distinción cortesía/sin identificar/pagado de ventas nuevas (ver `PLAN_PUBLICACION.md`). Las reversiones de emergencia de 07a/07 reabren el acceso inseguro: solo si el negocio no puede operar.
5. Restauración total (último recurso): desde `respaldo_pre08` y los CSV, con aprobación del dueño.

## 6. Pendiente separado: aviso al dueño por WhatsApp
Hoy lo dispara el navegador y el payload permitido no lleva pendientes, retiros, fecha/n.º de turno, propinas ni detalle de gastos; `notas` no está en la lista permitida; no se envía con diferencia PROVISIONAL. Entrega aparte: mover el envío al servidor tras guardar el cierre, con reintento y estado persistido. Mientras tanto un fallo no bloquea el cierre ni aparenta envío.

## 7. Evidencia disponible
PG16 55/55 + carrera 4/4 (PG17 por Codex en la revisión anterior); Codex sobre 7594f39: build Windows correcto, 135 pruebas pasan y 19 omitidas sin PGlite. Navegador sobre 7594f39 (proyecto aislado, 03/11): reimpresión de ambos cierres del historial con cifras originales (el del lunes con DIFERENCIA PROVISIONAL y CON PENDIENTES); cierre de un turno con el bot sin configurar: "Aviso al dueño: NO enviado… El cierre sí quedó guardado". Sin verificar en vivo: texto PROVISIONAL del paso 3 con Point pendiente sobre este commit (cubierto por pruebas unitarias y por el ticket), impresora física, Point real.
