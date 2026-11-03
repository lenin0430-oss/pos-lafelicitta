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

## 2026-11-02 (mediodía) · Precios de hamburguesas y referencia 4bcd30e (Claude)
- Codex subió 7 hamburguesas +$1.000 (POS y menú digital): La Felicitta 4.500; Especial de Carne 6.000; Doble 8.500; La Pelua 9.500; Triple 10.990; XL La Estrella 8.500; XL La Luna 8.500. Respaldo: `consolidacion\respaldo-burgers-2026-11-02.json`; registro: `consolidacion\ACTUALIZACION_BURGERS_2026-11-02.md`. Reversión solo de esos 7 y condicionada al precio nuevo (no reactivar ni tocar ventas).
- Lectura de solo consulta (producción, SELECT, 2026-11-02): los 7 precios coinciden con la lista; mi verificación del catálogo sigue exacta (27 precios / 5 desactivados / 7 altas / 217 productos). Ventas: 6.099 y suma 36.523.310 = antes 36.521.310 + 2 ventas nuevas por $2.000. Son ventas OBSERVADAS: no se ha comprobado su origen (no se afirma que sean pruebas de nadie); pendiente identificarlas por fecha, método y usuario si hace falta. Sin otras variaciones.
- Rama de preparación fusionada con origin/main 4bcd30e (548f025; sin conflictos; solo cambió `lib/menu.ts`). El catálogo NO se vuelve a aplicar.
- Pendiente: `lib/menu.ts` es un catálogo estático de respaldo; revisar si sus precios coinciden con los 27 cambios del catálogo (no se tocó).

## 2026-11-02 (tarde) · Revisión de `lib/menu.ts` y pruebas de migraciones (Claude)
- `lib/menu.ts` (catálogo estático de respaldo; se usa como estado inicial en caja y costeo y como respaldo si falla la base) vs precios actuales: las **7 hamburguesas coinciden**. Del catálogo de 27 precios, **26 no coinciden** (siguen con el precio anterior, p. ej. Chop suey 6.990 vs 6.500; Papas XL 6.500 vs 7.500; Tequeños 8 cm 12 u. 6.900 vs 6.800 y 8 u. 4.700 vs 4.800) y 3 cachapas no tienen entrada. Los 5 desactivados siguen listados (2 aún están: Pollo al horno, Perico Queso Llanero) y las 7 altas no existen. Es solo un respaldo; no se modificó. Propuesta: regenerar `lib/menu.ts` desde la base tras aprobación.
- Migraciones en `mesapos-pruebas-aislado` (wcoaulvlicfimdfmwhid): confirmado proyecto y que 03/04/06 NO están aplicadas; respaldo de datos ficticios en `respaldo_ventas_pre03` (63) y `respaldo_pagos_point_pre03` (4). Aplicación de 03 bloqueada por una aprobación pendiente de Supabase.

## 2026-11-02 (noche) · Pruebas de migraciones en `mesapos-pruebas-aislado` (wcoaulvlicfimdfmwhid) — Claude
Datos ficticios; respaldo previo en `respaldo_ventas_pre03` (63) y `respaldo_pagos_point_pre03` (4). Línea base: hash de ventas 9a9b8303…, estados en_proceso:1/listo:61/pendiente:1, total 314.000/63 ventas; pagos hash 4ba83888… (4).
- 03 aplicada (en pasos): hash/estados/total idénticos; estado_pago: pagado 51 ($250.000), cortesía 4 ($23.000), sin_identificar 6 ($29.000), pendiente 2 ($12.000); 0 pagadas sin método; permisos sin cambios. Compatibilidad con el código antiguo (en transacción revertida): cobro antiguo → listo/pagado con pagado_at; cocina marca listo sin método → sigue pendiente; entregar tras pago no cambia el pago.
- 04 aplicada: hash de pagos idéntico, índice único creado, segundo intento activo de la misma venta rechazado por la base, otro negocio con la misma venta permitido.
- 06 aplicada: 60 archivadas, 0 pendientes/en proceso archivadas, `ventas.estado` y hash sin cambios; su reversión deja 0 archivadas, hash igual.
- Reversión de 04 (drop index + drop de 3 columnas): **bloqueada por una aprobación pendiente de Supabase**; 04 sigue aplicada. Falta revertir 04 y 03 y verificar.

## 04b — aislamiento entre negocios (02/11/2026, noche)
Estado: **propuesta probada en PGlite y en PostgreSQL 16 local; NO aplicada en ningún proyecto remoto.** Operaciones remotas bloqueadas: la aprobación obligatoria de Supabase venció 4 veces sin respuesta; la reversión de 04 (y luego 03) en `mesapos-pruebas-aislado` sigue pendiente. No se repiten solicitudes ni se dividen operaciones.
- Corrección propia: yo había afirmado que otro negocio podía tener un intento sobre la misma venta; el índice único es por negocio, pero la base no comprobaba que la venta fuera del negocio. La API (`/api/point/cobrar`) sí filtra por `empresa_id`.
- Fallo encontrado en la primera 04b (solo trigger sin bloqueo): bajo concurrencia dejaba un cobro de A sobre una venta de B (1 caso medido). Corregido: `FOR SHARE` + trigger en `ventas` (ver `docs/DECISION_04B_TRIGGER_VS_FK.md`).
- Pruebas: `tests/migracion.test.mjs` 19/19 (cadena 03→04→04b, históricos incompatibles sin corregir, nulos, cambio posterior de empresa, reversión); `tests/concurrencia_04b.sh` en PostgreSQL 16.15 local: C1–C6 OK (evidencia en `docs/evidencia/04b_concurrencia_pg16.txt`).
- Clave foránea compuesta evaluada (`tests/pg_real/fk_alternativa.sql`): no aplicable hoy (text vs uuid, históricos no convertibles, hueco con NULL); queda como mejora futura.
- Pendiente: repetir aplicación/reversión 03→04→04b en el proyecto de pruebas; repetir la concurrencia en un PostgreSQL con la versión de Supabase; correr `verificar_04b.sql` en producción (solo lectura, requiere tu autorización) para ver si hay cobros históricos incompatibles.
- Procedimiento de producción propuesto: una transacción por migración (03 → 04 → 04b); reversión inversa 04b → 04 → 03; 06 aparte.

## Prueba en navegador con Point simulado y verificación de producción (02/11/2026, noche)
- `verificar_04b.sql` ejecutado en **producción solo como lectura** (revisado antes: sin escrituras): **0 cobros incompatibles** de 12 cobros Point (todos con orden; estados canceled/processed); 0 ventas sin empresa; `venta_id`/`restaurante_id` son `text` y `ventas.id` `uuid`. Producción corre **PostgreSQL 17.6** (aarch64); el proyecto de pruebas, 17.11. Mi PostgreSQL local es 16.15: **la concurrencia debe repetirse en 17** (no pude instalarlo: sin acceso a repositorios); el comportamiento de `FOR SHARE`/triggers no cambia entre 16 y 17, pero queda como pendiente y no como aprobado.
- Preparado (no ejecutado en navegador): `scripts/simulador-point.mjs` (Point simulado, solo tokens `TEST-`, escucha en 127.0.0.1), `lib/mpApi.ts` (salvaguarda: `MP_SIMULADOR_URL` solo http a localhost y nunca con `VERCEL_ENV=production`; **cambio mínimo en `lib/mp.ts` que revisar**: por defecto la URL real no cambia), `scripts/prueba-navegador/` (SQL de cuenta ficticia cifrada y `verificar_flujo.sql` de solo lectura) y la guía ampliada en `docs/PRUEBA_NAVEGADOR.md` (casos F1, P1–P12, E1–E2, C1–C2).
- Pruebas automáticas: 84/84 (incluye 7 de la orquestación real contra el simulador HTTP: aprobado, rechazo/cancelación/expiración, respuesta perdida, error 500, máquina ocupada, doble clic, venta ya cobrada).
- Aviso del proyecto de pruebas: RLS desactivada en `usuarios` y en las dos tablas de respaldo ficticias (`respaldo_*_pre03`). Comprobar si `usuarios` también carece de RLS en producción antes de publicar.

## Revisión Windows de 43a7cc7 y correcciones (02/11/2026, noche)
- Codex comprobó en Windows: 84/84 pruebas, build y tipos OK, 0 vulnerabilidades, el selector del simulador conserva Mercado Pago real por defecto y se desactiva con `VERCEL_ENV=production` (`REVISION_WINDOWS_43a7cc7.md`). No implica aprobación de despliegue; **esta rama no se publica todavía**.
- Corregido en `docs/PRUEBA_NAVEGADOR.md` y `docs/PLAN_PUBLICACION.md`: base de referencia `4bcd30e` (diseño y siete precios publicados); el catálogo `05` figura como **ya aplicado, no se ejecuta ni se revierte** (cabecera de aviso en los dos SQL de 05); procedimiento unificado 03 → 04 → 04b (una transacción cada una, `06` aparte) y reversión 06 → 04b → 04 → 03; punto de retorno del código `dpl_AMbvJb44…` (`4bcd30e`, comprobado en Vercel) aclarando que revertir código no revierte datos; el hallazgo de Codex sobre `VERCEL_ENV` vs `NODE_ENV` y «solo credenciales ficticias desde el origen»; las pruebas con repositorios falsos no demuestran el flujo completo; la confirmación del dueño de efectivo/débito aplica al POS publicado, no a la rama nueva.
- Compatibilidad: el cobro Point de `4bcd30e` inserta `restaurante_id` y `venta_id` de una venta del mismo negocio, por lo que no choca con 04b (leído en el código; falta confirmarlo en el ensayo).
- Permisos/RLS en el **proyecto de pruebas** (consultas de solo lectura; en producción **no** se consultó): `anon` y `authenticated` tienen todos los privilegios sobre las tablas de `public` (valor por defecto de Supabase). Con RLS desactivada (`usuarios`, `respaldo_ventas_pre03`, `respaldo_pagos_point_pre03`) un `anon` real ve todas las filas (3, 63, 4); `ventas` tiene una política que deja ver las 63 ventas a `anon`; `pagos_point` y `mp_cuentas` (RLS activa, sin políticas) devuelven 0 filas a `anon` (negación comprobada). Son datos ficticios, pero el patrón importa: **pendiente (requiere tu autorización de lectura en producción)** comprobar lo mismo allí (RLS, política de `ventas`, privilegios de `anon`) antes de publicar; las tablas de respaldo no deben crearse en `public` sin RLS en producción.

## Permisos/RLS en producción — corrección aislada preparada (02/11/2026, noche) — Claude
- Hallazgo confirmado por el dueño (solo configuración): `usuarios` sin RLS con lectura/escritura para anon; `ventas` con RLS pero política pública que permite todo. No se demostró acceso ni alteración; no se leyeron filas ni se probaron escrituras. Producción NO modificada.
- Corrección aislada en la rama `claude/permisos-2026-11-02` (commit 4a617fa, desde 4bcd30e; NO publicada, NO aprobada). Plan: `docs/PERMISOS_PLAN.md` en esa rama.
- Diseño: "puerta de datos" en servidor (`/api/datos`, lista blanca por tabla/rol, `empresa_id` forzado desde la cookie firmada), cliente-shim con bandera `NEXT_PUBLIC_DATOS_VIA_SERVIDOR`, verificación de PIN admin en servidor; luego SQL escalonado 07a (usuarios + funciones de login) → 07 (resto), con respaldo y reversión de emergencia.
- Evidencia: 20 pruebas TS; 77 + 22 comprobaciones por rol en PostgreSQL 16 real (anon, cajero, otro negocio, dueño, control positivo, reversión con huella idéntica). Tipos (`tsc`) sin errores.
- Pendiente: prueba en navegador (login, ventas, cocina, cierre, Point) con bandera ON + 07 en proyecto de pruebas; repetir en PG17; revisión de políticas/ACL de todas las tablas y funciones en producción (lectura, requiere autorización); dependencias de mesapos-app y bot; decisión sobre `/admin/nueva-empresa` y `PLATAFORMA_EMPRESA_ID`; rotación/hash de PIN; revisión de trazas.
- Hallazgos por código (sin afirmar explotación): PIN tratado como texto plano; RPC de login ejecutables por anon en el proyecto de pruebas; nueva-empresa sin separación entre negocios; `reporte-semanal` con token fijo y respaldo con clave anon.

## Permisos — correcciones a la revisión de Codex (02/11/2026, noche) — Claude
- Rama `claude/permisos-2026-11-02`, commit 8bbb98f (sobre 4a617fa). NO publicada. Producción no modificada.
- Gastos: alta solo por `/api/gastos`; garzón ≥ $30.000 exige aprobación de admin de un solo uso (negocio+empleado+importe+operación). Ventas: acciones y campos por rol, total = suma de líneas, precios contra catálogo vigente (Pollo broaster 5.500, Pollo al horno 5.000), Point solo con evidencia del proveedor. Login: límite persistente por IP y cuenta. Alta de negocios deshabilitada. Hash de PIN preparado (PIN_MODO=legacy; no se cambió ningún PIN).
- SQL nuevo `07b` (orden 07b → 07a → 07), 37 comprobaciones en PG16; TS 42/42; `tsc` limpio; `next build` pendiente en Windows.
- Lectura de producción: ver §9 de `docs/PERMISOS_PLAN.md` de esa rama.

## Permisos — segunda revisión de Codex (02/11/2026, noche) — Claude
- Rama `claude/permisos-2026-11-02`, ver commit más reciente. Nuevo SQL `07c` (cobro manual/edición atómicos con Point; orden 07b → 07c → 07a → 07), 20 comprobaciones con dos conexiones reales en PG16 (incluye control que reproduce la falla). Update/delete de ventas, caja, gastos, propinas y productos exigen un único id. Catálogo: solo productos activos y disponibles; «Pabellón» activo a dos precios en producción se acepta con ambos. TS 51/51. NO publicada; producción no modificada.

## 2026-11-02 — Importe de reserva Point bajo bloqueo + candidata conjunta permisos/Point
- Rama permisos `claude/permisos-2026-11-02` @ 62ede08: el trigger `pagos_point_bloquea_venta` (07c) compara `pagos_point.monto` con `round(total)` de la venta ya bloqueada (`FOR UPDATE`); si difiere rechaza con `P0409 MONTO_NO_COINCIDE` y `pointCobro` responde 409 antes de llamar al proveedor.
- Candidata conjunta `claude/candidata-permisos-point-2026-11-02` @ 7e04fcb (permisos + Point + estados separados). Detalle y orden de aplicación/reversión: `docs/CANDIDATA_PERMISOS_POINT.md`.
- Evidencia local: 139/139 pruebas TS, `tsc --noEmit` limpio, PG16 concurrencia conjunta 28 OK, ensayo Point con orquestación real y proveedor simulado OK (monto viejo: 409, 0 llamadas al proveedor, 0 reservas).
- No publicado, sin SQL en producción. Pendiente: `next build` en Windows (posible `experimental.cpus=1`), `tests/concurrencia_cobro_pg.sh` y `tests/ensayo_point_pg.mjs` con PostgreSQL por Codex, PG17, prueba en navegador con dos negocios, confirmar que mesapos-app/bot no usan pedidos/pedido_items/mesas/configuracion_empresa con clave pública antes del paso 07, y operaciones pendientes de aprobación en el proyecto de pruebas.


## 2026-11-03 — Caja y turnos (candidata, sin publicar)
- Nueva migración `supabase/08_turnos_caja.sql` (+ REVERSION) **sin aplicar en ningún proyecto**. Turno desde la apertura hasta «Cerrar turno» (00:00–01:00 del día siguiente; sin reinicio a medianoche).
- Nuevo: `lib/turnosServidor.ts`, `lib/medioPoint.ts`, `app/api/turno/route.ts`; reescrito `app/cierre/page.tsx`; `lib/mp.ts` y rutas Point pasan la orden para extraer el medio.
- Pruebas: PG16 34/34 (`scripts/prueba-caja/`), `tests/turnos.test.mjs` 9/9, total 148/148, `tsc` limpio. Detalle y pendientes: `docs/CAJA_TURNOS_PROPUESTA.md`.
- Caso real: diferencia provisional −$9.090 (pendiente de comprobar); histórico no se corrige.
- Archivos de transferencia temporales en `mesapos-unified/_transfer_turnos/` (carpeta del usuario; el dueño puede borrarla).
- Rev. 2 de caja (tras revisión de Codex): corregidos gasto tardío, anular/recobrar, caminos antiguos de /api/datos, resumen desactualizado, Point identificable. PG16 52/52, suite 150/150, tsc limpio. 08 sigue sin aplicar.
- Rev. 3 de caja (Codex sobre aa2731b): bloqueo del turno en UPDATE/DELETE de gastos (carrera probada en ambos órdenes) y esperado negativo admitido. PG16 53/53 + carrera 4/4, suite 151/151. 08 sigue sin aplicar.
- Rev. 3b: el commit b3f1b1e no incluía el SQL corregido (copia desordenada); este commit lo añade. Huellas SHA-256 (16 primeros): 08_turnos_caja.sql 598bf652f953d57d, turnos.sql a453094a89f3c44c, carrera.sh 5274a8ad6c141bbf. Son exactamente los archivos probados (53/53 + carrera 4/4).
- Recorrido en navegador de caja/turnos (pruebas): OK. Correcciones: ticket de impresión, aviso falso, corrección de Point confirmado (08b). 08 ahora 9956c5edcc716106; 08b 5b82d3e9ccb3f97d; turnos.sql 56245e0622707e96. Falta aplicar 08b en pruebas y repetir.
- Caja/turnos: 2.º recorrido en navegador OK (corregir Point, cierre con pendientes, cruce de medianoche simulado, ticket). Evidencia en docs/evidencia/CAJA_navegador_2026-11-03.md. PENDIENTE: aviso al dueño (bot sin configurar; payload sin pendientes/retiros; lo dispara el navegador).
- Caja (entrega final, ae2e94b + docs): reimpresión de cierres guardados con sus cifras originales, diferencia PROVISIONAL con Point por confirmar, aviso al dueño que no bloquea el cierre ni aparenta envío. Procedimiento de publicación/reversión y bloqueantes: `docs/PUBLICACION_CAJA_FELICITTA.md`; scripts de solo lectura/respaldo: `supabase/verificar_08_previo.sql`, `respaldo_previo_08.sql`, `transicion_turnos_antiguos_PROPUESTA.sql` (sin ejecutar). NO publicado; producción sin cambios. Ampliación del aviso WhatsApp: entrega separada.
- Caja (rev. publicación 2): `verificar_08_previo.sql` ya no referencia columnas ausentes (n/a sin 03; probado en base sin estado_pago). Plan corregido: Fase A con `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1` (exige 07b+07c); 08 depende de 03. Producción (Codex, solo lectura): faltan 03, 04, 04b, 07b, 07c, 08; turno real abierto; faltan `CRON_SECRET` y variables del bot. Ventana propuesta: miércoles 04-11 desde las 10:00 (`docs/PUBLICACION_CAJA_FELICITTA.md` §2). Navegador sobre 7594f39: reimpresión y "NO enviado" verificados. NO publicado; sin SQL productivo.
- Caja (reglas del dueño, 03/11): cierre bloqueado en el servidor por comandas sin entregar, ventas sin cobrar, Point en proceso y cobros con medio por confirmar (lista con n.º, mesa, monto, motivo); sin cobros sin turno abierto (P0413, «Abrir turno»); bot/WhatsApp para después. 08 final 6f126848553ff4ef (+ `08c` incremental para pruebas, `turnos.sql` 81/81, `carrera2.sh` 8/8, TS 159, tsc limpio). `06` pasa a obligatorio antes del primer cierre. Miércoles sin jornada: pruebas identificadas como PRUEBA y sin turno abierto hasta el jueves (`docs/PUBLICACION_CAJA_FELICITTA.md`). NO publicado; sin SQL productivo.

## Folios internos por negocio (03/11/2026) — Claude
- Candidata: `09_correlativos.sql` (+ REVERSIÓN), pruebas `scripts/prueba-caja/{folios_pre.sql,folios.sql,carrera3.sh}`, cambios en `app/page.tsx` (sin `lf_orden_num`; clave anti-duplicado; muestra/imprime el número del servidor), `lib/reglasNegocio.ts` (el `numero` del navegador se ignora), `app/cierre/page.tsx` (Turno N° / Cierre N°). 163 pruebas y `tsc` limpio; PG16: folios 34/34, carreras C1–C7, 60 turnos.
- Revisión de Codex sobre 15a512b corregida: (1) 09 restaura contadores/folios/claves desde `respaldo_correlativos` y nunca retrocede (prueba `reversion09.sh`: B 60 → 61); (2) la clave de la comanda se persiste en el navegador y se recupera la venta antes de reenviar (`tests/folios.test.mjs`).
- **No aplicado en producción ni en el proyecto de pruebas.** Orden: 08 → 09 → desplegar. Histórico sin renumerar (duplicados antiguos se conservan; folio vacío).
- Para Codex: reconstruir Windows/preview del commit final y probar en navegador comanda nueva, doble clic, recarga, editar/cobrar/reimprimir; aplicar 08c y 09 en el proyecto de pruebas solo con aprobación del dueño.
