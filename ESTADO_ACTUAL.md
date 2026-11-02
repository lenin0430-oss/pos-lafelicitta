# ESTADO_ACTUAL — MesaPOS (POS operativo de La Felicitta)

Actualizado: 2026-11-02 (Claude, 2.ª entrega). Codex y Claude no deben editar los mismos archivos a la vez: antes de tocar algo, anotar aquí carpeta y archivos.

## 1. Fuente principal y qué está publicado
- Carpeta: `C:\Users\yusma\mesapos-unified` (repo `lenin0430-oss/pos-lafelicitta`). `main` = `origin/main` = **8142dc7**.
- **Producción (Vercel `pos-lafelicitta-ndkb`)** = 8142dc7 (verificado el 02/11). Menú publicado = 411052f.
- Rama de trabajo, **solo local, nada publicado ni empujado**: `claude/preparacion-2026-11-02`. Punto de retorno: tag `punto-retorno-2026-11-02` (= 8142dc7) y `respaldos/pos-8142dc7.bundle`.
- Base de datos: proyecto Supabase `xlzbqgvmwbskpfajehgi` (el mismo que usa el `.env.local` del POS). Esta sesión hizo **solo lecturas** (SELECT) de estructura, conteos de estados y nombre/precio/categoría de productos de La Felicitta. No se aplicó SQL ni se leyó ninguna credencial ni dato personal.

## 2. Cambios en la rama (sin aplicar remotamente)
| Área | Archivos |
|---|---|
| Estados separados (lib) | `lib/estados.ts` (nuevo), `lib/cierre.ts` (nuevo) |
| Cobro Point | `lib/pointCobro.ts` (nuevo), `lib/pointGuard.ts` (reescrito), `lib/mp.ts` (clave de idempotencia estable; marcar pagada solo toca `estado_pago`), `app/api/point/cobrar/route.ts` |
| Pantallas | `app/page.tsx` (cobro manual escribe `estado_pago`), `app/cocina/page.tsx`, `app/cierre/page.tsx`, `app/reportes/page.tsx`, `app/api/reporte-semanal/route.ts` |
| Migraciones (revisar, NO aplicadas) | `supabase/03_estados_separados.sql` + `_REVERSION`, `03b_retirar_compatibilidad.sql`, `04_pagos_point_reserva.sql` + `_REVERSION` |
| Pruebas | `tests/*.test.mjs`, `tests/helpers-point.mjs`, `tests/register.mjs`, `tests/resolver.mjs`; `package.json` (script `test`) |
| Documentos | `ESTADO_ACTUAL.md`, `INTEGRACION_POINT.md`, `docs/precios-reales-pos-vs-menu-2026-11-02.csv`, `docs/rotacion-secreto-cron/*`. `docs/comparacion-catalogo-pos-vs-menu-2026-11-02.csv` es de la 1.ª entrega y quedó **obsoleto** (comparaba el respaldo estático del código, no la base) |

No se tocó: `.env*`, `vercel.json`, impresión, OAuth/webhook de Point, precios, productos ni ventas.

## 3. Pruebas ejecutadas HOY (datos ficticios, sin red, sin cobros)
- `npm test` → **28/28 OK**: `pointCobro` (13), `cierre` (6), `pointGuard` (2), `migracion` (7, incluidas las reversiones).
- `tsc --noEmit` (proyecto completo) → sin errores.
- Point: dos y cinco solicitudes simultáneas → 1 sola orden; respuesta perdida → el reintento recupera la misma orden; fallo al guardar `pagos_point` tras crear la orden → se recupera sin duplicar; error definitivo 4xx cierra el intento; 5xx/red conserva la reserva; venta pagada → 409 sin llamar a MP. Una prueba de **contraste** muestra que "mirar antes si existe" sí duplica con solicitudes simultáneas.
- Estados: preparado/en proceso/listo/entregado **no impiden cobrar**, y una venta pagada **no sale del cierre** al cambiar el estado de cocina (en código y en SQL).
- Migraciones en PostgreSQL en memoria (PGlite, esquema equivalente al real, filas ficticias): el backfill conserva `estado`, `metodo_pago` y `total`; es repetible; es compatible con el código antiguo (cobro antiguo = pagado; cocina `listo` sin método ≠ pagado); la reversión restaura el esquema sin perder ventas ni cobros; el índice único rechaza el segundo intento activo (23505).
- **No ejecutado:** `next build`. El entorno de revisión no puede (los `node_modules` son de Windows/SWC y no hay acceso a npm). Ejecutar en tu PC `npm run build`, o una vista previa de Vercel desde la rama (**no** producción). **No probado:** el comportamiento real de Mercado Pago con la reserva/idempotencia nueva.

## 4. Estados reales en la base (lectura 02/11/2026)
`ventas.estado`: `listo` 6.095, `pendiente` 2 (nunca existieron `en_proceso` ni `entregado`). `pagos_point`: `processed` 5, `canceled` 1. Hoy `listo` significa "cobrada" en todo el histórico (incluye 585 ventas `listo` con `metodo_pago` vacío, que el cierre cuenta pero no asigna a ningún método: revisar). La migración 03 marca esas 6.095 como `pagado` y deja `pagado_at` en NULL (hora real desconocida).

## 5. Dónde se leían/escribían los estados (auditoría)
| Lugar | Antes (8142dc7) | En la rama |
|---|---|---|
| Cocina | lee `pendiente/en_proceso`; escribe `estado` | lee `pendiente/en_proceso/listo` de las últimas 12 h; muestra "💳 Pagado"; escribe solo `estado` |
| Cobro manual (`app/page.tsx`) | `metodo_pago` + `estado='listo'` | `metodo_pago` + `estado_pago='pagado'` + `pagado_at`; **no** toca `estado` |
| Reabrir comanda | `cobrada = estado==='listo'` | `cobrada = estado_pago==='pagado'` |
| Point cobrar | rechaza si `estado==='listo'` | rechaza solo si `estado_pago==='pagado'`; reserva atómica |
| Point webhook / estado | `estado='listo'` | `estado_pago='pagado'`, `metodo_pago='Point'` |
| Cierre (2 consultas) | `estado='listo'` | `estado_pago='pagado'` + `lib/cierre.ts` |
| Reporte semanal | `estado='listo'` | `estado_pago='pagado'` |
| Reportes | muestra `estado`; totales suman TODAS las ventas del período | muestra estado de cocina y de pago; **totales sin cambio** (decisión pendiente) |

Sin cambios: `cierre-whatsapp` (no lee estados), propinas, gastos, costeo.

**Correcciones incluidas por hallazgos de las pruebas:**
1. Los pagos "Mixto: Efectivo + Débito…" se contaban **enteros como efectivo** en el cierre (el texto contiene "efectivo" y esa rama iba primero). Ahora se reparten por método. Cambia los números de cierres futuros, no los ya guardados.
2. Las ventas **Point** entraban al total del cierre pero a ningún método. Ahora se agrupan con QR/Mercado Pago.

El reporte semanal aún calcula efectivo/débito por texto y cuenta mixtos completos en el primer método (sin corregir).

## 6. ⚠ Cambio de comportamiento que debes decidir antes de publicar
Hoy cobrar saca la comanda de la pantalla de cocina (porque cobrar = `listo`). Con la separación, **cobrar ya no la saca**: seguirá apareciendo hasta que cocina la marque. Como en la base nunca se usó `en_proceso`/`entregado`, es probable que cocina no use esos botones. Mitigación incluida: la pantalla muestra solo las últimas 12 h y los estados `listo`, con botón "Entregado". Alternativas: (a) aceptarlo y capacitar; (b) que cobrar también marque `listo` en negocios sin cocina (opción por negocio); (c) ocultar las pagadas tras N minutos. **Elige antes de publicar.**

## 7. Precios reales del POS (tabla `productos`, La Felicitta, 210 filas) vs. menú publicado 411052f
Resultado: **131 iguales · 27 con precio distinto (acordados) · 5 a retirar · 7 nuevos en el menú · 20 solo en POS · 23 solo en menú · 27 inactivos en POS.** Detalle por producto y categoría: `docs/precios-reales-pos-vs-menu-2026-11-02.csv`. No se cambió ningún precio, producto ni venta histórica.

**Definición de "acordado":** cambio que aparece en los commits del menú del 02/11/2026 00:01–00:54 (entre `b7c11b5` del 22/10 y `411052f`). Esta sesión no ve la conversación donde se acordaron; si algún cambio de la lista no corresponde, avisar.

### 7.1 Diferencias acordadas (el POS aún tiene el precio anterior)
| Categoría | Producto | POS hoy | Menú | Dif. |
|---|---|---|---|---|
| Almuerzos | Chop suey | $6.990 | $6.500 | -490 |
| Almuerzos | Chuleta vetada | $4.000 | $4.500 | +500 |
| Almuerzos | Pechuga a la plancha | $4.000 | $4.500 | +500 |
| Almuerzos | Pollo agridulce | $6.990 | $7.500 | +510 |
| Almuerzos | Pollo estofado | $4.000 | $4.500 | +500 |
| Combos a la Brasa | 1 Pollo solo | $12.000 | $13.000 | +1000 |
| Combos a la Brasa | ½ Pollo solo | $6.000 | $6.500 | +500 |
| Combos a la Brasa | ¼ Pollo solo | $3.000 | $3.500 | +500 |
| Perros | El Americano | $3.990 | $4.500 | +510 |
| Perros | El Peluo | $3.990 | $4.500 | +510 |
| Perros | El Perripollo | $3.500 | $4.500 | +1000 |
| Cachapas | Cochino + Queso | $10.000 | $12.000 | +2000 |
| Cachapas | Cochino Frito | $8.500 | $9.500 | +1000 |
| Cachapas | Queso de Mano | $7.500 | $8.500 | +1000 |
| Arroz chino | Arroz Salteado | $4.500 | $6.500 | +2000 |
| Papas | Bacon & Cheddar | $5.500 | $6.500 | +1000 |
| Papas | Nuggets 12 u. | $7.500 | $8.500 | +1000 |
| Papas | Nuggets 6 u. | $4.000 | $4.500 | +500 |
| Papas | Papas Normal | $3.500 | $3.900 | +400 |
| Papas | Papas XL | $6.500 | $7.500 | +1000 |
| Papas | Salchipapas Normal | $4.500 | $5.500 | +1000 |
| Papas | Salchipapas XL | $7.990 | $9.990 | +2000 |
| Empanadas | Molida | $2.500 | $3.000 | +500 |
| Empanadas | Pabellón | $3.000 | $3.500 | +500 |
| Tequeños | Tequeños 8cm — 12 unidades | $5.800 | $6.800 | +1000 |
| Tequeños | Tequeños 8cm — 4 unidades | $2.000 | $2.500 | +500 |
| Tequeños | Tequeños 8cm — 8 unidades | $3.900 | $4.800 | +900 |

**Retirar del POS (el menú los quitó):** 12 Tequeños de Queso + Salsas ($5.800), 4 Tequeños + Bebida ($3.500), Combo Pareja ($8.000), Pollo al horno ($4.990), Perico Queso Llanero ($2.500).
**Nuevos en el menú, ausentes en el POS:** Salsa extra Mayo ajo ($500), Salsa extra Cheddar ($500), Salsa extra Maíz ($500), Salsa extra Tocineta ($500), Salsa extra Picante ($500), Salsa extra Barbecue ($500), Pollo broaster ($5.000).

### 7.2 Otras diferencias (históricas, NO acordadas)
- **Diferencias de precio entre productos equivalentes: ninguna.** Todo lo que está en ambos y no figura arriba coincide.
- **Solo en el POS (activos):** Agua sin gas 500cc ($1.300), Costillas chinas agridulce ($7.990), Jarra limonada ($6.000), Jarra papelón ($6.000), Limonada ($2.500), Papelón con limón ($2.500), Pechuga Crispy al Estilo Chef ($6.990), Pollo a la brasa ($7.500), Envase para llevar ($300), La Casa Club XL ($9.500), Super de Carne ($6.000), El Perro Loco ($3.500), Pepito Pollo 15cm ($7.500), Pernil ($2.500), Pan de Coco ($500), Pan de Guayaba Pequeño ($600), Pan Dulce ($500), Chicharrón Grande ($2.500), Chicharrón Mediano ($2.000), Chicharrón Pequeño ($1.000). Limonada, Papelón, Jarras y Agua sí están en el menú, pero el cruce por nombre no los empareja; sus precios coinciden.
- **Solo en el menú:** 23 filas; sobre todo agregados con precio en arepas, extras, guarniciones $0 y "Churrasco Italiano" (no existe en el POS).
- **27 productos inactivos en el POS** (Pepitos, Patacones, Pepsi, cafés grandes…): no se comparan.
- El respaldo estático `lib/menu.ts` (solo se usa si la base no devuelve productos) está desactualizado respecto a la base; no afecta la operación normal.

## 8. Secreto detectado (sin mostrar su valor) — plan en `docs/rotacion-secreto-cron/`
Un mismo secreto corto está escrito en texto plano en `vercel.json`, `app/api/reporte-semanal/route.ts` y `app/api/cierre-whatsapp/route.ts` (y en el historial de Git). Sirve como token del cron **y** como `x-bot-secret` del bot de WhatsApp (enlace HTTP sin cifrar a una IP). Además `POST /api/cierre-whatsapp` no exige sesión. **Mi sesión mostró ese valor por error en la salida de dos comandos (el primer `cat vercel.json` del 02/11 y una búsqueda posterior); no lo copié a ningún archivo ni commit.** Tratarlo como comprometido. Preparado, **sin aplicar**: `PLAN.md` (fases A/B/C y reversión) y `sustituir-secreto-por-variables.mjs` (vista previa por defecto; probado en una copia: deja 0 ocurrencias). La rotación real exige cambiar el bot (servidor DigitalOcean) y crear `CRON_SECRET`/`BOT_SECRET` en Vercel; esta sesión no tiene ese acceso.

## 9. Riesgos y pendientes
1. Decisión del §6 (cocina).
2. Revisar las 585 ventas `listo` con `metodo_pago` vacío (¿cortesías, deudas, errores?).
3. `reportes`: los totales incluyen ventas sin pagar; decidir si deben contar solo `pagado`.
4. Reporte semanal: agrupa mixtos por texto.
5. Sin barrido de reservas `reservado` huérfanas ni conciliación periódica con Mercado Pago.
6. Compilación real pendiente (§3); probar en vista previa de Vercel con una base de pruebas, no la de producción.
7. Facturación: Point/voucher ≠ emisión de facturas; verificar el modelo tributario con el SII antes de anunciarlo. Ser revendedor de equipos MP no acredita certificación del software ni alianza tecnológica.
8. Acceso a `G:\Mi unidad\…\MesaPOS_ClaudeCode_Arranque_2026` sigue pendiente; el `CLAUDE.md` de Empresarial aún dice "Venezuela / dic-2026".

## 10. Procedimiento de reversión
- **Código:** `git checkout main && git branch -D claude/preparacion-2026-11-02`; o `git checkout punto-retorno-2026-11-02`; o restaurar `respaldos/pos-8142dc7.bundle` (`git clone respaldos/pos-8142dc7.bundle carpeta-nueva`).
- **Base (cuando se apliquen):** primero volver a desplegar 8142dc7; luego `04_…_REVERSION.sql` y `03_…_REVERSION.sql`. Antes de aplicar: respaldo de `ventas` y `pagos_point` y ventana sin cobros activos.
- **Vercel:** rollback al despliegue `dpl_Dbn1AG…` (8142dc7).

## 11. Orden recomendado para publicar (cuando lo autorices)
1. Decidir §6. 2. `npm run build` y `npm test` en tu PC. 3. Aplicar 03 y 04 en una base de pruebas con respaldo. 4. Vista previa de Vercel de la rama. 5. Prueba controlada con mesa "PRUEBA" y cobro bajo — casos: normal, doble clic, cocina marca `listo` antes de cobrar (debe poder cobrar), el cierre incluye la venta. 6. Recién entonces 03 → 04 → despliegue en producción fuera de horario de servicio. 7. Rotación del secreto como tarea aparte.
