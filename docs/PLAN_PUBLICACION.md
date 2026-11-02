# Plan de publicación, verificación y reversión (NADA de esto está ejecutado)

Rama `claude/preparacion-2026-11-02`. Producción hoy: 8142dc7 (Vercel `pos-lafelicitta-ndkb`, despliegue `dpl_Dbn1AG…`). Regla: **el código que exige columnas nuevas no se conecta a la base productiva antes de aplicar y verificar la migración**; por eso la base va primero y es compatible con el código actual.

## Antes de empezar (todo sin riesgo)
1. En Windows: `powershell -ExecutionPolicy Bypass -File scripts\verificar-windows.ps1` (copia temporal, variables ficticias, `npm ci`, `tsc`, `npm test`, `next build`). Debe terminar en OK.
2. Vista previa aislada (opcional, recomendada): proyecto Vercel de prueba + **proyecto Supabase de pruebas con las migraciones 01–04 aplicadas**. No apuntar ninguna vista previa a la base productiva (el proyecto `mesapos-piloto-chile` está inactivo: no usarlo sin autorización).
3. Aprobación del dueño de: criterio de `docs/conversion-historica-estado-pago.md`, `docs/reconciliacion-menu/PROPUESTA.md`, rotación del secreto.

## Orden
| # | Paso | Verificación | Si falla |
|---|---|---|---|
| 0 | Fuera de horario, con cierre hecho y sin cobros Point activos. Respaldo de `ventas`, `pagos_point`, `productos` (exportar) | Conteos y `sum(total)` anotados con `verificar_03_04.sql` | — |
| 1 | Aplicar `03_estados_separados.sql` (transacción) | `verificar_03_04.sql`: mismas cantidades/importes; `pagadas_sin_metodo=0`; el POS actual (8142dc7) sigue cobrando y cocinando (probar con mesa PRUEBA: el disparador marca pagado) | `03_…_REVERSION.sql` |
| 1b | Aplicar `06_archivar_cocina_historica_PROPUESTA.sql` (tras aprobar el corte) | Cocina muestra solo pendiente/en proceso/listo de hoy; `ventas.estado` sin cambios | `06_…_REVERSION.sql` |
| 2 | Aplicar `04_pagos_point_reserva.sql` | Índice único presente; sin `reservado` huérfanos | `04_…_REVERSION.sql` |
| 3 | (Tras aprobación) `05_reconciliar_menu_PROPUESTA.sql` | 27 precios, 5 desactivados, 7 altas; ventas intactas | `05_…_REVERSION.sql` |
| 4 | Crear variables en Vercel: `CRON_SECRET`, `BOT_SECRET`, `BOT_URL`, `BOT_EMPRESA_ID` y preparar el bot para aceptar ambos secretos (PLAN de rotación, Fase B 1–2) | — | — |
| 5 | Desplegar la rama (fusionar a `main` solo tras aprobar) | Humo: abrir POS, cocina (se ven comandas no entregadas), crear comanda, cobrar manual, cobrar Point de monto bajo (con autorización), cierre = cobros del turno, reportes con 3 cifras | Rollback Vercel a `dpl_Dbn1AG…` (la base 03/04 es compatible con el código viejo) |
| 6 | Rotación (Fase B 3–5) | cierre de prueba con sesión OK; sin sesión 401; secreto antiguo rechazado | Bot acepta ambos hasta confirmar |
| 7 | Más adelante, cuando no quede código antiguo: `03b_retirar_compatibilidad.sql` | — | recrear el disparador de 03 |

## Reversión y qué información nueva se pierde
| Reversión | Pierde información nueva? |
|---|---|
| Rollback del código en Vercel (sin tocar la base) | **No.** La base 03/04 es compatible con el código antiguo (el disparador marca el cobro). Ventas cobradas con el código nuevo siguen con su `estado_pago`. |
| `04_REVERSION` | **Sí:** claves de idempotencia, referencia, detalle y filas `reservado` (revisar que no haya huérfanas con orden creada en MP; conciliar a mano antes). Los pagos `processed` históricos se conservan. |
| `03_REVERSION` | **Sí:** `pagado_at`; la distinción cortesía/sin identificar/pagado; el estado de cocina de ventas nuevas cobradas (quedan `listo`) y las marcas de archivo. El histórico nunca cambió de estado. No pierde ventas, importes, métodos ni fechas. |
| `05_REVERSION` | No pierde ventas. Los precios vuelven al valor anterior solo si siguen en el nuevo; las 7 altas quedan desactivadas (no se borran). Ventas hechas con precios nuevos conservan su importe. |
| Rotación de secreto | Irreversible solo en el paso 5 (retirar el antiguo): volver a aceptarlo exige reconfigurar el bot. |

| `06_REVERSION` | Solo las marcas de archivo (cocina vuelve a mostrar el histórico); no toca estados. |

Orden de reversión completo: código (Vercel) → 05 → 06 → 04 → 03. Después de cualquier reversión de 03/04, el código nuevo ya **no** puede estar desplegado: responde 503 "Falta migración" al cobrar con Point en lugar de operar a medias.
