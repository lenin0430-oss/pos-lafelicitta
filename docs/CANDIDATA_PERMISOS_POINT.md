# Candidata conjunta: permisos + Point (NO publicada, NO aplicada en ninguna base remota)

Rama `claude/candidata-permisos-point-2026-11-02` = rama de preparación (03/04/04b, ruta Point con reserva, estados separados) **+** rama de permisos (puerta de datos, reglas por campo, aprobación de gastos, límite de login, 07a/07b/07c/07). Un único conflicto de fusión (`app/api/reporte-semanal/route.ts`): se conserva la autenticación por `CRON_SECRET` de preparación y el cliente de servidor de permisos (sin llave pública).
**No desplegar la rama de permisos sola**: su ruta Point es la antigua (llama al proveedor antes de registrar el pago).

## Qué cambió para integrarlas
- Reglas de ventas adaptadas al modelo de estados separados: cobrar escribe `metodo_pago + estado_pago (+ pagado_at)`, nunca `estado`; cocina maneja `pendiente|en_proceso|listo|entregado`; corregir medio de pago en Reportes (solo admin) y paso de «sin_identificar» a cobrada solo por esa vía.
- `07c` (versión conjunta, requiere 03): `cobrar_venta_manual` / `editar_comanda_venta` bloquean la venta y exigen `estado_pago = 'pendiente'` y sin cobro Point activo; el trigger `pagos_point_bloquea_venta` bloquea la misma venta y, **bajo ese bloqueo**, rechaza la reserva si la venta ya está cobrada (`VENTA_YA_COBRADA`) o si `pagos_point.monto ≠ total vigente` (`MONTO_NO_COINCIDE`), ambos SQLSTATE `P0409`.
- `lib/pointCobro.ts`: un `P0409` al reservar se devuelve como **409 estable** («El total de la venta cambió. Presiona «Actualizar cocina» y reintenta.» / «La venta ya está cobrada») **antes** de llamar al proveedor.

## Orden de aplicación (todo primero en `mesapos-pruebas-aislado`, fuera de horario, con respaldo)
| # | Paso | Notas |
|---|---|---|
| 0 | Respaldo; `verificar_03_04.sql`, `verificar_04b.sql` (lectura) | |
| 1 | SQL `03` → `04` → `04b` | prerrequisito de la ruta Point nueva y de `estado_pago` |
| 2 | SQL `07b`, luego `07c` | aditivos (tablas/funciones/trigger nuevos); no cambian datos |
| 3 | Desplegar la candidata con `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=0`, `PIN_MODO=legacy`; variables: `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `MP_*` | con la bandera en 0 el navegador sigue yendo directo a la base (como hoy) |
| 4 | SQL `07a` (cierra `usuarios` y funciones de login) | requiere el paso 3: login y PIN de admin ya en el servidor |
| 5 | Verificar flujo completo; poner `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1` y redesplegar | la puerta usa 07b (gastos grandes) y 07c (cobro/edición) |
| 6 | Verificar de nuevo (+ negativos con la llave pública); SQL `07` | cierra todo lo demás por defecto |
| 7 | Más tarde, coordinado con el dueño: rotar/hashear PIN (`PIN_MODO=mixto` → `hash`), `03b`, `05/06` según corresponda | fuera de esta candidata |

## Reversión (orden inverso)
`07` → `07a` → bandera en 0 → `07c` → `07b` → código anterior → `04b` → `04` → `03` (cada uno con su `*_REVERSION*.sql`). Las reversiones de emergencia de `07a/07` **restauran el acceso inseguro anterior**: solo si el negocio no puede operar, y luego hay que volver a cerrar. Revertir código no revierte la base: con `07` aplicada el código antiguo (cliente directo) deja de operar. Punto de retorno de código: despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y` (4bcd30e) — solo válido mientras 03/04/07 no estén aplicadas, o junto con sus reversiones.

## Evidencia (local, sin tocar bases remotas)
- 139 pruebas TypeScript (`npm test`), `tsc --noEmit` limpio. Build Windows: pendiente de repetir por Codex sobre este HEAD.
- PostgreSQL 16 real, dos conexiones: `tests/concurrencia_cobro_pg.sh` (28 comprobaciones, `docs/evidencia/07c_concurrencia_conjunta_pg16.txt`) y `tests/ensayo_point_pg.mjs` (**orquestación real de `pointCobro` + proveedor simulado + SQL 04/04b/07c**, `docs/evidencia/ensayo_point_pg16.txt`): edición 10.000→15.000 durante la reserva ⇒ 409 y **cero** llamadas al proveedor y cero reservas; reserva por el total nuevo ⇒ una orden con clave idempotente, reintento sin duplicar; reserva primero ⇒ la edición espera y responde `point_en_curso`; cobro manual primero ⇒ la reserva se rechaza con 409 «ya cobrada» sin llegar al proveedor. Antes: `tests/permisos_pg.sh` (77+22), `tests/seguridad_pg.sh` (37), `concurrencia_04b.sh`.
- Para repetir `ensayo_point_pg.mjs` hace falta transpilar `lib/pointCobro|pointGuard|estados.ts` a `.mjs` (ver cabecera); usa `psql` local, nunca una base remota.

## Pendiente / límites
- Prueba en **navegador con dos negocios** y base de pruebas con 03→04→04b→07b→07c→07a→07 (bloqueada por la aprobación de Supabase para sentencias destructivas). PostgreSQL 17 (producción 17.6) no repetido: solo hay 16 local.
- El simulador del proveedor del ensayo es mínimo (idempotencia por clave); la prueba con `scripts/simulador-point.mjs` y la UI sigue en `docs/PRUEBA_NAVEGADOR.md`.
- `mesapos-app` y el bot de WhatsApp: confirmar que no usan `pedidos`, `pedido_items`, `mesas` ni `configuracion_empresa` con la llave pública antes del paso 6.
- Catálogo: se aceptan los precios vigentes de productos **activos y disponibles** («Pabellón» activo a 3.500 y 6.490); no se modificó ningún precio (Pollo broaster 5.500, Pollo al horno 5.000). Falta reconciliar `lib/menu.ts` (respaldo) con el catálogo vivo: no es parte de esta candidata.
- Login de garzón por PIN de 4 dígitos sin identificar el negocio; PIN reales sin cambiar.
