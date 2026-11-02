# ESTADO_ACTUAL — MesaPOS (POS operativo de La Felicitta)

Actualizado: 2026-11-02 (Claude). Codex y Claude no deben editar los mismos archivos a la vez: antes de tocar algo, anotar aquí carpeta y archivos.

## 1. Fuente principal
- Carpeta: `C:\Users\yusma\mesapos-unified` (repo `lenin0430-oss/pos-lafelicitta`).
- `main` = `origin/main` = **8142dc7** (01/11/2026). Árbol limpio salvo 2 archivos sin seguir: `menu-lafelicitta/` (copia local) y `tsconfig.tsbuildinfo`.
- **Producción (Vercel, proyecto `pos-lafelicitta-ndkb`)**: último despliegue production `dpl_Dbn1AG…` = commit **8142dc7**, estado READY. Coincide con la carpeta. Rollback previo disponible: `dpl_BvydazKW…` (fd18122).
- Rama de trabajo (solo local): **`claude/preparacion-2026-11-02`**.
- Punto de retorno: tag `punto-retorno-2026-11-02` → 8142dc7 + bundle verificado `respaldos/pos-8142dc7.bundle` (carpeta excluida de git vía `.git/info/exclude`).

### Otras copias (solo lectura, no modificadas)
| Carpeta | Estado | Uso |
|---|---|---|
| `C:\Users\yusma\pos-lafelicitta` | `e855e4a` (may-2026), antigua | No es la publicada |
| `…\Documents\ChatGPT\…\menu-lafelicitta` | `411052f` (02/11), limpia, = menú publicado en Vercel | **Fuente del menú actual** |
| `C:\Users\yusma\menu-lafelicitta` | `b0e3ecc` (21/05), antigua | Descartar como fuente |
| `…\consolidacion` (Codex) | copias sin historial de Empresarial y del POS | Referencia |
| `G:\Mi unidad\MesaPOS_ClaudeCode_Arranque_2026` (Empresarial, e4659a9) | **No accesible desde esta sesión**; solo se leyó la copia de Codex | Falta acceso para verificar commit |

## 2. Cambios realizados (rama, sin publicar)
| Archivo | Cambio |
|---|---|
| `lib/pointGuard.ts` (nuevo) | Función pura `ordenPointReutilizable`: si la venta ya tiene una orden Point viva (`created`/`at_terminal`, < 5 min, mismo monto) se reutiliza |
| `app/api/point/cobrar/route.ts` | (a) consulta `pagos_point` y reutiliza la orden viva en vez de crear otra; (b) si falla el `insert` en `pagos_point` tras crear la orden en MP, ya no se ignora: responde 500 con `orderId`, mensaje "no repitas el cobro" y log |
| `tests/pointGuard.test.mjs` (nuevo) | 7 pruebas |
| `docs/comparacion-catalogo-pos-vs-menu-2026-11-02.csv` (nuevo) | Diferencias POS vs menú |
| `ESTADO_ACTUAL.md` (nuevo) | Este archivo |

No se tocó: Point/OAuth/webhook/estado, impresión, caja, esquema SQL, precios, `.env*`, `vercel.json`.

## 3. Pruebas ejecutadas HOY
- `node --test tests/pointGuard.test.mjs` → 7/7 OK.
- `tsc --noEmit` → sin errores.
- **No ejecutadas**: `next build`, pruebas contra Supabase/Mercado Pago, cobros reales, pruebas de impresión. `.env.local` local solo tiene 2 variables públicas de Supabase, así que Point no se puede probar en local.
- Evidencia histórica (no reejecutada): prueba operativa de Point del 01/11/2026 (`INTEGRACION_POINT.md` + tu confirmación). Informe de Codex: suite Empresarial 1049 OK / 3 fallos clasificados, 611 pruebas de aislamiento (en PostgreSQL en memoria); no reverificado por mí.

## 4. Hallazgos del flujo pedido → cocina → Point → pagada → cierre (por lectura de código)
1. **`listo` significa dos cosas.** Cocina pone `listo` = comida lista; `/api/point/cobrar` lo trata como "ya cobrada" (409) y `marcarVentaPagadaPoint` usa `.neq("estado","listo")`. Si cocina marca `listo` antes de cobrar, Point no deja cobrar y, si cobrara, no registraría `metodo_pago = Point`.
2. **Cierre de caja** (`app/cierre/page.tsx`) solo suma ventas `estado = 'listo'`; una venta pasada a `entregado` por cocina desaparece del cierre. Verificar con datos reales.
3. Idempotencia: `mpFetch` genera clave aleatoria por llamada (no protege reintentos). Mitigado parcialmente por el cambio de arriba y por el bloqueo de MP `already_queued_order_on_terminal`.
4. Webhook: captura errores y responde 200; no hay reintento durable ni conciliación (el polling de `/api/point/estado` es el respaldo).
5. Documentación desactualizada: `INTEGRACION_POINT.md` aún lista como pendiente cosas ya hechas (sesión real, botón en cobro, marcar pagada).
6. **`vercel.json` contiene un token en la URL del cron** (`/api/reporte-semanal?token=…`) dentro del repositorio: rotarlo y moverlo a variable de entorno. No se modificó.
7. `README.md` propone política RLS `allow_all` en `ventas`: confirmar en Supabase que no sigue activa (no verificado, sin acceso remoto).
8. El POS tiene `MENU` estático en `lib/menu.ts` como respaldo; el catálogo real viene de la tabla `productos` en Supabase (**no consultada**).

## 5. Catálogo y precios (resumen)
Comparado `lib/menu.ts` (146 ítems) contra el menú publicado (411052f). Detalle en el CSV.
- Coinciden en precio: ~100 (84 por nombre exacto + alias de combos, churrascos, jugos y tequeños 25 cm).
- **Precio distinto (≈30)**: ¼/½/1 pollo solo (+500/+500/+1000), almuerzos chuleta/estofado/pechuga (+500), chop suey (−490), agridulce (+510), perros Americano/Peluo (+510) y Perripollo (+1000), Arroz Salteado (+2000), papas/salchipapas/nuggets (+400 a +2000), empanada Molida (+500), cachapas (+1000 a +2000), tequeños 8 cm 8 u. (+100) y 12 u. (−100), todos los Mix de pasapalos (+2000 a +4000) y Mini Tequeños (+2400 a +5600).
- **Solo en POS**: Envase para llevar ($300), Pollo al horno ($4.990), Chicharrón P/M/G, Perico Queso Llanero (el menú lo retiró).
- **Solo en menú**: Pollo broaster ($5.000), Tequeño individual ($500), promos (Perros a Luka, Almuerzo Ejecutivo $4.990, Burger+Papas+Bebida $8.500), y agregados/extras con precio.
- Falso emparejamiento a ignorar: "Pabellón" empanada vs arepa.
- **Pendiente**: leer `productos` en Supabase (solo lectura) para saber qué precios usa realmente el POS. La diferencia de arriba es del respaldo en código, no demuestra el estado de la base. No se cambió ningún precio ni venta histórica.

## 6. Publicado vs. solo local
- Publicado: POS 8142dc7 (Vercel production); menú 411052f (Vercel production).
- Solo local: rama `claude/preparacion-2026-11-02`, tag, bundle, este archivo, CSV. **Nada empujado a GitHub ni desplegado.**

## 7. Reversión
- Descartar el trabajo: `git checkout main && git branch -D claude/preparacion-2026-11-02`.
- Volver al estado exacto: `git checkout punto-retorno-2026-11-02` o restaurar desde `respaldos/pos-8142dc7.bundle` (`git clone respaldos/pos-8142dc7.bundle nueva-carpeta`).
- Si algún día se despliega la rama y falla: Vercel → pos-lafelicitta-ndkb → Deployments → promover/rollback a `dpl_Dbn1AG…` (8142dc7).

## 8. Pendientes y siguiente tarea
1. Tu OK para consulta **solo lectura** de `productos` (Supabase) y reconciliar precios; luego script con vista previa (dry-run) y precios solo hacia adelante.
2. Decidir semántica de estados (separar "preparado" de "pagado") — requiere SQL; proponer migración, sin aplicar.
3. Rotar token del cron; actualizar `INTEGRACION_POINT.md`.
4. Acceso a `G:\…\MesaPOS_ClaudeCode_Arranque_2026` para verificar e4659a9. Su `CLAUDE.md` aún dice "Venezuela, piloto dic-2026, La Felicitta solo como referencia": contradice la decisión actual (Chile, POS operativo como base); debe actualizarse antes de que otra sesión trabaje allí.
5. Facturación: Point/voucher no equivale a emisión de facturas; validar modelo tributario con el SII antes de anunciarlo. Revendedor de equipos MP ≠ software certificado ni alianza tecnológica.

## 9. Propuesta para la primera prueba en el negocio (sin cobros reales fuera de lo normal)
Con una sola caja y un solo turno de baja demanda, tras revisión y despliegue en una vista previa (no producción):
1. Crear 3 comandas de prueba con total $100 en una mesa "PRUEBA".
2. Caso A: cocina "En proceso" → cobrar con Point $100 → verificar pagada, `metodo_pago = Point`, que aparece en el cierre.
3. Caso B: doble clic en "Cobrar con Point" → debe mostrar la misma orden, no dos.
4. Caso C: cocina marca `listo` ANTES de cobrar → confirmar el bloqueo descrito en hallazgo 1 (documentar, no corregir aún).
5. Cancelar/anular los $100 según el procedimiento habitual y comparar cierre vs. Mercado Pago.
Criterio de éxito: cero duplicados, la venta pagada aparece en el cierre, y se conoce el comportamiento del caso C.
