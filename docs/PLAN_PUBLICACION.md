# Plan de publicación, verificación y reversión (NADA de esto está ejecutado)

Rama `claude/preparacion-2026-11-02`. Producción hoy: `origin/main` = `4bcd30e` (Vercel `pos-lafelicitta-ndkb`, despliegue `dpl_AMbvJb44…`, que incluye el diseño visual y los siete precios de hamburguesas). Verificar `origin/main` antes de entregar. Regla: **el código que exige columnas nuevas no se conecta a la base productiva antes de aplicar y verificar la migración**; por eso la base va primero y es compatible con el código actual.

## Antes de empezar (todo sin riesgo)
1. En Windows: `powershell -ExecutionPolicy Bypass -File scripts\verificar-windows.ps1` (copia temporal, variables ficticias, `npm ci`, `tsc`, `npm test`, `next build`). Debe terminar en OK.
2. Vista previa aislada (opcional, recomendada): proyecto Vercel de prueba + **proyecto Supabase de pruebas (`mesapos-pruebas-aislado`) con las migraciones 01–04b aplicadas**. No apuntar ninguna vista previa a la base productiva (el proyecto `mesapos-piloto-chile` está inactivo: no usarlo sin autorización).
3. Aprobación del dueño de: criterio de `docs/conversion-historica-estado-pago.md`, corte de `06` (si se usa) y rotación del secreto. El catálogo (`05`) **ya está aplicado**: no se vuelve a aprobar ni ejecutar.

## Orden
| # | Paso | Verificación | Si falla |
|---|---|---|---|
| 0 | Fuera de horario, con cierre hecho y sin cobros Point activos. Respaldo de `ventas`, `pagos_point`, `productos` (exportar) | Conteos y `sum(total)` anotados con `verificar_03_04.sql` | — |
| 1 | Aplicar `03_estados_separados.sql` (transacción) | `verificar_03_04.sql`: mismas cantidades/importes; `pagadas_sin_metodo=0`; el POS actual (`4bcd30e`) sigue cobrando y cocinando (probar con mesa PRUEBA: el disparador marca pagado) | `03_…_REVERSION.sql` |
| 1b | Aplicar `06_archivar_cocina_historica_PROPUESTA.sql` (tras aprobar el corte) | Cocina muestra solo pendiente/en proceso/listo de hoy; `ventas.estado` sin cambios | `06_…_REVERSION.sql` |
| 2 | Aplicar `04_pagos_point_reserva.sql` | Índice único presente; sin `reservado` huérfanos | `04_…_REVERSION.sql` |
| 2b | `verificar_04b.sql` (solo lectura) y luego `04b_pagos_point_aislamiento.sql` (una transacción) | 0 cobros incompatibles (en producción el 02/11/2026 dio 0 de 12); triggers presentes; probar con mesa PRUEBA que el cobro Point sigue funcionando | `04b_…_REVERSION.sql` |
| 3 | **Catálogo `05`: YA APLICADO. No ejecutar ni revertir en este procedimiento.** Conservar los precios publicados (incluidos los siete aumentos de hamburguesas) | — | — |
| 4 | Crear variables en Vercel: `CRON_SECRET`, `BOT_SECRET` (el NUEVO), `BOT_URL`, `BOT_EMPRESA_ID`, `SESSION_SECRET`. **Antes de desplegar el POS**, el bot debe aceptar ambos secretos (fase A de `docs/ROTACION_SECRETO_BOT.md`) | Un cierre de prueba con el secreto antiguo sigue funcionando | Revertir variables |
| 5 | Desplegar la rama (fusionar a `main` solo tras aprobar) | Humo: abrir POS, cocina (se ven comandas no entregadas), crear comanda, cobrar manual, cobrar Point de monto bajo (con autorización), cierre = cobros del turno, reportes con 3 cifras | Rollback del código en Vercel a `dpl_AMbvJb44…` (`4bcd30e`); **no revierte datos**: la base 03/04/04b es compatible con el código de `4bcd30e` (revisado leyendo el código; confirmar en el ensayo) |
| 5b | **Rotación coordinada con este mismo despliegue (no se deja para después):** fase B (POS ya envía el nuevo) y, tras la prueba de humo, fase C: el bot retira el secreto antiguo y se ejecuta `scripts/verificar-rotacion-bot.mjs` | Cierre con sesión OK; sin sesión 401; otra empresa 403; **el secreto antiguo es rechazado por el bot** | Antes de C el bot aún acepta ambos; después de C, reconfigurar el bot |
| 6 | Verificar que ningún despliegue conserva el secreto antiguo (ni `vercel.json`, ni variables, ni historial visible) y que el cron semanal responde 401 sin `CRON_SECRET` | Pruebas de `tests/rotacionBot.test.mjs` y humo en producción | — |
| 7 | Más adelante, cuando no quede código antiguo: `03b_retirar_compatibilidad.sql` | — | recrear el disparador de 03 |

## Reversión y qué información nueva se pierde
| Reversión | Pierde información nueva? |
|---|---|
| Rollback del código en Vercel (sin tocar la base) | **No.** La base 03/04 es compatible con el código antiguo (el disparador marca el cobro). Ventas cobradas con el código nuevo siguen con su `estado_pago`. |
| `04_REVERSION` | **Sí:** claves de idempotencia, referencia, detalle y filas `reservado` (revisar que no haya huérfanas con orden creada en MP; conciliar a mano antes). Los pagos `processed` históricos se conservan. |
| `03_REVERSION` | **Sí:** `pagado_at`; la distinción cortesía/sin identificar/pagado; el estado de cocina de ventas nuevas cobradas (quedan `listo`) y las marcas de archivo. El histórico nunca cambió de estado. No pierde ventas, importes, métodos ni fechas. |
| `04b_REVERSION` | No pierde datos: solo retira los dos triggers (vuelve a no validarse que la venta sea del negocio). |
| Rotación de secreto | Irreversible solo en el paso 5 (retirar el antiguo): volver a aceptarlo exige reconfigurar el bot. |

| `06_REVERSION` | Solo las marcas de archivo (cocina vuelve a mostrar el histórico); no toca estados. |

Orden de reversión completo: código (Vercel) → 06 → 04b → 04 → 03. El catálogo `05` ya aplicado **no** forma parte de esta reversión ni se toca. Después de cualquier reversión de 03/04, el código nuevo ya **no** puede estar desplegado: responde 503 "Falta migración" al cobrar con Point en lugar de operar a medias.


## Migración 04b (aislamiento entre negocios) — añadido 02/11/2026
Orden: 03 → 04 → 04b, cada una como UNA transacción (sin dividir). Antes de 04b: ejecutar `supabase/verificar_04b.sql` (solo lectura) y revisar los cobros históricos incompatibles; 04b no los corrige. Reversión: 04b → 04 → 03. Ver `docs/DECISION_04B_TRIGGER_VS_FK.md`. Pendiente antes de producción: prueba de aplicación/reversión en `mesapos-pruebas-aislado` y concurrencia en PostgreSQL con la versión de Supabase.
