# ESTADO_ACTUAL — MesaPOS (POS operativo de La Felicitta)

Actualizado: 2026-11-02 (Claude, 3.ª entrega). Codex y Claude no deben editar los mismos archivos a la vez: antes de tocar algo, anotar aquí carpeta y archivos.

## 1. Fuente principal y qué está publicado
- Carpeta: `C:\Users\yusma\mesapos-unified` (repo `lenin0430-oss/pos-lafelicitta`). `main` = `origin/main` = **8142dc7** = producción (Vercel `pos-lafelicitta-ndkb`). Menú publicado = 411052f.
- Rama de trabajo, **solo local, nada publicado ni empujado**: `claude/preparacion-2026-11-02`. Punto de retorno: tag `punto-retorno-2026-11-02` (= 8142dc7) y `respaldos/pos-8142dc7.bundle`.
- Base: proyecto Supabase `xlzbqgvmwbskpfajehgi`. Esta sesión hizo **solo SELECT** (estructura, conteos, nombre/precio/categoría de productos). No se aplicó SQL, no se leyeron credenciales ni datos personales.

## 2. Decisiones del dueño (3.ª entrega) y cómo quedaron en la rama
1. **Cobrar no retira comandas**; solo "Entregado". Sin ocultar por antigüedad: cocina muestra pendiente/en_proceso/listo siempre y etiqueta "Antigua · N h" desde 12 h (`lib/cocina.ts`, `app/cocina/page.tsx`).
2. **585 ventas sin método → "Sin identificar"** (`estado_pago='sin_identificar'`); método e importes intactos (583 La Felicitta, $4.263.280).
3. **Reportes**: ventas registradas / cobros recibidos / saldo pendiente (+ sin identificar, cortesías) en `lib/reportes.ts` y `app/reportes`. **Cierre**: suma cobros por fecha de cobro (`pagado_at`, o `created_at` en histórico), intervalo [desde,hasta), sin duplicados (`resumirCobros`).
4. **Conversión histórica**: `docs/conversion-historica-estado-pago.md`. Clasificación **inferida** del método registrado (no confirmación de cobro); solo los 5 pagos Point cruzados con `pagos_point` tienen evidencia del proveedor. No se inventan fechas de cobro (`pagado_at` NULL en histórico). **La migración no cambia ningún `ventas.estado`**; el histórico se saca de cocina con `06_archivar_cocina_historica_PROPUESTA.sql` (marca de archivo, no afirma entrega; no oculta pendientes ni lo de hoy). No aplicado.
5. **Menú**: lista exacta en `docs/reconciliacion-menu/PROPUESTA.md` (+ `operaciones.json`, `supabase/05_reconciliar_menu_PROPUESTA.sql` y su reversión). 27 precios, 5 desactivaciones (historial conservado), 7 altas propuestas. **No aplicado.**
6. **Seguridad**: `cierre-whatsapp` exige sesión y autorización (empresa `BOT_EMPRESA_ID`, rol admin/garzón), filtra el contenido y usa `BOT_SECRET` solo en servidor; cron con `Authorization: Bearer CRON_SECRET`; secreto retirado de `vercel.json`, rutas y del JS del navegador. Rotación coordinada en `docs/rotacion-secreto-cron/PLAN.md` (no ejecutada). **El valor antiguo sigue en el historial de Git y estuvo en el navegador: tratarlo como público.** Mi sesión lo mostró por error en salidas de comandos (incluida una más en esta entrega); no está en ningún archivo ni commit.
7. **Compilación**: `scripts/verificar-windows.ps1` (copia temporal, variables ficticias; no toca `.env.local`; se detiene con error si falla robocopy —código ≥ 8—, `npm ci`, `tsc`, pruebas o `next build`, y solo imprime OK si todo pasó). `next build` no pudo ejecutarse en esta sesión (sin SWC de Windows en la máquina virtual; el registro npm está bloqueado en la nube). `tsc` y pruebas sí pasan. El cobro Point responde 503 "Falta migración" si faltan columnas (código 42703).
8. **Orden de publicación y reversión**: `docs/PLAN_PUBLICACION.md` (indica qué reversión pierde información).

## 3. Pruebas ejecutadas (datos ficticios, sin red, sin cobros reales)
`npm test`: 45 pruebas (Point sin duplicados, simultáneas, respuesta perdida, fallo al guardar; cierre/reportes entre turnos; cocina; seguridad del bot; migraciones 03/04/05 y reversiones en PostgreSQL en memoria). `npx tsc --noEmit`: sin errores. `next build`: **pendiente en Windows**.

## 4. Estados reales en la base (lectura 02/11/2026)
`ventas.estado`: `listo` 6.095, `pendiente` 2. `pagos_point`: `processed` 5, `canceled` 1. Tras la migración 03 (propuesta): pagado / cortesía (6, $32.400) / sin identificar (583) / pendiente (2 Full Burger). Ver `docs/conversion-historica-estado-pago.md`.

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


## 7. Precios reales del POS (tabla `productos`, La Felicitta, 210 filas) vs. menú publicado 411052f
Resultado: **131 iguales · 27 con precio distinto (acordados) · 5 a retirar · 7 nuevos en el menú · 20 solo en POS · 23 solo en menú · 27 inactivos en POS.** Detalle por producto y categoría: `docs/precios-reales-pos-vs-menu-2026-11-02.csv`. No se cambió ningún precio, producto ni venta histórica.

**Definición de "acordado":** cambio que aparece en los commits del menú del 02/11/2026 00:01–00:54 (entre `b7c11b5` del 22/10 y `411052f`). Esta sesión no ve la conversación donde se acordaron; si algún cambio de la lista no corresponde, avisar.

### 7.1 Diferencias acordadas (ver la lista exacta por identificador en docs/reconciliacion-menu/PROPUESTA.md) (el POS aún tiene el precio anterior)
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


## 9. Riesgos y pendientes
0. **Dependencias:** resuelto por Codex en Windows (commit `2e1819f`): Next 15.5.28, override `next → postcss 8.5.32`, `cookies()` con await; npm audit 0 vulnerabilidades, tsc, 45/45 sin omisiones y `next build` aprobados. Cambio mayor de Next: falta la regresión en navegador (`docs/PRUEBA_NAVEGADOR.md`). Auditoría limpia no certifica seguridad total.
1. Aprobar una versión concreta (este documento + `docs/PLAN_PUBLICACION.md`).
2. Origen de las 583 ventas sin método sin demostrar; decidir si alguna se reclasifica.
3. Ejecutar `scripts/verificar-windows.ps1` (o vista previa aislada con base de pruebas) y archivar el resultado de `next build`.
4. Rotación del secreto: requiere acceso al bot (DigitalOcean) y a Vercel; enlace al bot por HTTP sin cifrar.
5. Reporte semanal: agrupa mixtos por texto. Sin barrido de reservas `reservado` huérfanas ni conciliación periódica con Mercado Pago.
6. Las 7 altas de menú son propuesta editable. `docs/comparacion-catalogo-pos-vs-menu-2026-11-02.csv` está obsoleto (usar `precios-reales-…csv`).
7. Facturación: Point/voucher ≠ emisión de facturas; verificar con el SII. Ser revendedor de equipos MP no acredita certificación ni alianza.
8. Acceso a `G:\Mi unidad\…\MesaPOS_ClaudeCode_Arranque_2026` sigue pendiente; su `CLAUDE.md` aún dice "Venezuela / dic-2026".

## 10. Reversión
Ver `docs/PLAN_PUBLICACION.md` (tabla de qué se pierde en cada reversión). Código: `git checkout main`, tag `punto-retorno-2026-11-02` o `respaldos/pos-8142dc7.bundle`; Vercel: rollback a `dpl_Dbn1AG…` (8142dc7).

## 2026-11-02 (tarde) · Integración sobre main 1ba0afd (Claude)
- Rama de preparación fusionada con origin/main 1ba0afd (diseño publicado + dependencias parcheadas); un conflicto (reportes) resuelto. Catálogo ya aplicado en producción: no se repite.
- Nuevo: `lib/rotacionSecretoBot.ts`, `tests/rotacionBot.test.mjs` (rotación completa con bot falso: el secreto anterior se rechaza), `tests/cobrosCierre.test.mjs` (cierre conciliado por método y turno, webhook repetido, firma inválida, cron sin Bearer), `docs/ROTACION_SECRETO_BOT.md`, `scripts/verificar-rotacion-bot.mjs`, `docs/PLAN_PUBLICACION.md` corregido (rotación coordinada con el despliegue POS+bot).
- Pruebas: 58/58 en Node (VM), sin omitidas. Pendiente repetir en Windows (`scripts/verificar-windows.ps1`: tsc + build).
- Migraciones 03/04/06 en el proyecto de PRUEBAS (`mesapos-pruebas-aislado`): en curso; el servidor Supabase pidió una confirmación de usuario que no se contestó (no aplicadas aún).
