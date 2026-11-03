# Publicación de la candidata con Caja/Turnos para La Felicitta (PROCEDIMIENTO — NADA EJECUTADO)

Candidata: rama `claude/candidata-permisos-point-2026-11-02` (caja incluida). Producción hoy: `origin/main` 4bcd30e, despliegue `dpl_AMbvJb44WNSnrK41ui1thQzZ8y`, Supabase `xlzbqgvmwbskpfajehgi`.
Este documento **no autoriza** nada: cada paso con ★ requiere visto bueno explícito del dueño y coordinación con Codex. Revisión 5 (03/11, verificaciones separadas por etapa): reglas del dueño (cierre bloqueado, sin cobros sin turno), Fase A con servidor=1, miércoles sin jornada, folios internos (09), respaldo y transición del turno actual (§3b). Complementa `PLAN_PUBLICACION.md` y `CANDIDATA_PERMISOS_POINT.md`.

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
| 10:00 | **V0** `verificar_08_previo.sql` + `verificar_04b.sql` (solo lectura). `verificar_03_04.sql` se usa después de instalar 03/04, porque requiere sus columnas. Esperado: fila 11 = 0 abiertas, 14 = 0; anotar 13 y 20–23. | Codex/dueño ★ | Turno abierto o Point activo: no seguir. |
| 10:10 | **R** CSV (`ventas, gastos, propinas, aperturas_caja, cierres_caja, pagos_point, usuarios`) + `respaldo_previo_08.sql`; anotar conteos y suma. | ★ | Si existe `respaldo_pre08`: detenerse. |
| 10:25 | Variables Vercel (§2.5) y flag `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`; **sin desplegar aún**. | dueño | |
| 10:35 | SQL, cada uno una transacción y verificado antes del siguiente: `03` → `04` → `verificar_04b` → `04b` → `07b` → `07c` → `06` (corte aprobado). | ★ | Fallo: `*_REVERSION.sql` de ese paso y detenerse. |
| 11:15 | **V1** repetir `verificar_08_previo.sql`: filas 20–22 = 0 (o lista aprobada por el dueño). | ★ | Si no es 0: resolver/archivar antes de 08. |
| 11:20 | Aplicar **solo** `08_turnos_caja.sql` (final, SHA-256 `6f126848…`; **no** 08b ni 08c: ya incluidos). Verificar fila 8 = 5 y 9 = 5. | ★ | `08_turnos_caja_REVERSION.sql`. |
| 11:22 | Aplicar **`09_correlativos.sql`** (folios internos; SHA-256 `1f70b8d8…`; **después de 08, antes de desplegar**). Antes: filas 24–25 de `verificar_08_previo.sql` anotadas (grupos de números repetidos y máximo). Verificar: tabla `correlativos` con 1 fila `comanda` por negocio = máximo histórico; `select count(*) from ventas where folio is not null` = 0 (histórico intacto). | ★ | `09_correlativos_REVERSION.sql`; el código antiguo sigue funcionando con 09 (el trigger ignora el número del navegador). |
| 11:25 | **Desplegar** la candidata (flag=1). | ★ | Ver §6 (rollback con 08 y 09). |
| 11:30 | **Comprobaciones §5** (sin turno: cobro bloqueado; menú; login; prueba identificada). | Codex+dueño | |
| 12:15 | Revisar logs 30 min; decidir «queda» o reversión. **Confirmar que no queda turno abierto.** | | |

Fase B (07a → flag ya en 1 → 07) en otra ventana, tras confirmar menú/bot y la rotación del secreto.
Proyecto de pruebas (`mesapos-pruebas-aislado`): **ya tiene 08 + 08b + 08c + 09** aplicados (Codex, 03/11) y el ensayo de caja y correlativos quedó cerrado en pantalla (ver `ESTADO_ACTUAL.md`). 08c es solo para ese proyecto (incremental, verificado idéntico a 08 final); **nunca 08c en producción**.

## 3b. Respaldo y transición del turno actual (Revisión 4)
**Estado a 03/11:** producción tiene un turno real abierto (modelo antiguo) y NO tiene 03, 04, 04b, 07b, 07c, 08 ni 09. Nada de esto se ha ejecutado.

**Condiciones para empezar (Go / No-Go, las confirma el dueño en el chat el día de la ventana):**
1. El turno real del martes está **cerrado con el flujo antiguo** y las cifras de papel anotadas. Si V0 (fila 11) muestra un turno abierto: **No-Go**; no se cierra a la fuerza por SQL.
2. Cero cobros Point activos (fila 14 = 0) y cero ventas sin cobrar de hoy.
3. Respaldo hecho y verificado (R): conteos de `respaldo_pre08` = conteos de las tablas originales; CSV guardados **fuera** de Supabase; confirmado si el plan tiene copias/PITR (anotar el momento del último respaldo automático).
4. Aprobado por el dueño: criterio de 03 y corte de 06 (comandas antiguas), `CRON_SECRET` y `PIN_MODO=legacy` creados en Vercel, y el equipo sabe que toda comanda termina «Entregado» y toda venta cobrada.
5. Codex confirma el commit exacto a desplegar (hash) y que el build de Windows y las pruebas de ese commit pasan.

**Respaldos:** (a) copia/PITR únicamente si se confirma que el plan lo incluye y está disponible, anotando hora; si no existe, registrar expresamente que no hay copia automática y verificar una exportación externa recuperable antes de continuar; (b) `respaldo_previo_08.sql` crea el esquema `respaldo_pre08` en la MISMA base (ventas, aperturas, cierres, gastos, propinas, pagos Point) + CSV exportados del panel guardados fuera; (c) la reversión de 09 crea `respaldo_correlativos` (folios, claves y contadores) y la de 08 crea `respaldo_turnos`. Las copias de las reversiones se crean al revertir: no sustituyen el respaldo previo. La copia dentro de la misma base tampoco protege ante pérdida del proyecto. Ningún respaldo se borra el mismo día de la ventana.

**Transición del turno actual:** el turno antiguo termina con su propio flujo (martes noche) y **nunca se convierte** al modelo nuevo; `transicion_turnos_antiguos_PROPUESTA.sql` queda solo como último recurso, sin ejecutar, y únicamente con aprobación expresa del dueño. Tras publicar: **no hay turno abierto**; el dueño abre el turno real («Turno N° 0001», fondo contado) el jueves antes de vender. Los cierres anteriores quedan en `cierres_caja` sin folio (no se renumeran); desde el primero nuevo, `Cierre N° 0001`. La migración 08 NO rechaza automáticamente un turno legacy abierto: su índice limita solo los turnos v2. Por eso V0 es obligatorio y el operador se detiene si queda cualquier turno antiguo abierto. No confiar en un rechazo automático de 08.

**Verificación SQL de solo lectura por etapa:** tras 08 ejecutar `supabase/verificar_post_08.sql` (filas 1–4 y 12, sin referencias a 09). Tras 09 ejecutar `supabase/verificar_post_08_09.sql` (12 filas). No ejecutar el segundo antes de 09: PostgreSQL valida toda la consulta y fallaría por objetos ausentes. La fila 9 debe ser 0 justo tras 09 (el histórico no se tocó) y la fila 10 muestra cada contador igual al mayor número histórico del negocio. Anotar los resultados en el registro de la ventana.

**Decisión de reversión tras el despliegue (a las 12:15 y de nuevo el jueves antes de abrir):** reversión inmediata si hay cobros que no se registran, cierre imposible sin pendientes reales, errores 5xx sostenidos, o folios repetidos. Pendientes de confirmación física que **no** bloquean la publicación pero se vigilan el jueves: impresora térmica 58 mm y medio reportado por Point real (si llega sin medio, queda «por conciliar» y la cajera lo confirma).

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
4. Orden inverso completo: código → 09 → 08 → 07c → 07b → 04b → 04 → 06 → 03 (cada uno con su `*_REVERSION*.sql`; 03 pierde `pagado_at` y la distinción cortesía/sin identificar/pagado de ventas nuevas). Las reversiones de emergencia de 07a/07 reabren el acceso inseguro: solo si el negocio no puede operar.
5. Restauración total (último recurso): desde `respaldo_pre08` y los CSV, con aprobación del dueño.

## 6b. Folios internos (09) — qué cambia y qué no
- **Comandas, turnos y cierres** reciben un correlativo por negocio, asignado dentro de la base con bloqueo de fila (`correlativos`); sin reinicio a medianoche, único entre equipos, sin huecos por reintentos (si la transacción falla, el contador vuelve atrás). Anular **no** reutiliza el número. Editar, cobrar y reimprimir conservan el número.
- El navegador **ya no manda** el número: `app/page.tsx` no usa `lf_orden_num`; manda una clave anti-duplicado (`clave_idempotencia`); un doble clic o reintento devuelve la misma comanda. El servidor ignora cualquier `numero` que llegue.
- **Histórico**: no se renumera. Los duplicados antiguos (mismo `numero`, mismos `id`) quedan tal cual con `folio` vacío; el contador arranca en el mayor número histórico del negocio, así que los nuevos no chocan con los viejos.
- Son **folios internos**, separados de la numeración tributaria del SII (no son boletas ni facturas).
- Orden: 08 → 09 → desplegar. Con 09 aplicado y código antiguo no se rompe nada. Para el proyecto de pruebas: 08c y luego 09 (manual, con visto bueno).
- **Respuesta perdida**: la clave de la comanda vive SIEMPRE en memoria (si `localStorage`/`sessionStorage` fallan, igual se reutiliza en los reintentos) y se respalda en el navegador antes de enviar (`lf_intencion_comanda:<pestaña>`). Hay una intención por **pestaña** (id en `sessionStorage`): dos pestañas con los mismos productos usan claves distintas y no se adoptan la comanda una a la otra. «Comanda nueva» y la confirmación cierran la intención: una comanda nueva con productos idénticos usa otra clave y crea otra venta. Las intenciones caducan a las 24 h. **Pestaña duplicada** (el navegador copia `sessionStorage` y con él el id): cada página viva reclama su id con un arrendamiento en `localStorage` (latido cada 20 s y al volver a verse; vigencia 130 s; se libera en `pagehide`). Si otra instancia viva ya lo tiene, la copia toma un id NUEVO y no hereda la intención de la original, de modo que dos pedidos independientes (aunque idénticos) nunca comparten clave. Una recarga legítima libera el id al salir y recupera lo suyo. **Cierre brusco sin `pagehide` + reapertura inmediata**: la página nueva pregunta por un canal entre pestañas (`BroadcastChannel`) si la anterior sigue viva; si nadie contesta en ~300 ms retoma el MISMO id y su intención (misma venta, mismo folio, misma clave; no hay que esperar los 130 s). **Red de seguridad**: las intenciones de ids sin instancia viva (huérfanas) se COMPRUEBAN en el servidor antes de enviar una comanda nueva: si la venta existe se recupera con su folio; si no se puede confirmar (no existe todavía, sin red o error), el envío queda **BLOQUEADO** con un aviso rojo (mesa y monto) hasta «Comprobar de nuevo» o «No se guardó: descartar»; el tiempo no lo libera (solo la caducidad de 24 h de la intención). Sin `BroadcastChannel` (navegadores antiguos) la reapertura inmediata se trata como duplicada y el pedido anterior pasa por esa comprobación; con una pestaña duplicada viva y SIN canal, la copia puede ver pendiente el pedido de la original y se le bloqueará el envío hasta resolverlo (conservador). Al recargar, si la base ya tiene esa clave, la comanda se reabre con su mismo folio; si no, el reintento reutiliza la clave (misma comanda) o genera otra si la cajera armó una distinta. Antes de insertar siempre se busca por clave; ante 23505 se recupera la ganadora. El folio sigue saliendo solo de la base.
- **Reversión y re-aplicación**: `09_correlativos_REVERSION.sql` respalda contadores, folios y claves en el esquema `respaldo_correlativos`; al volver a aplicar 09 se **restauran** (B sigue en 60 → siguiente 61) y ningún contador retrocede (`greatest`). No renombrar ese esquema hasta confirmar la re-aplicación. Lo creado entre la reversión y la re-aplicación sin folio queda sin folio (no se renumera) y los contadores continúan después del mayor existente.
- Limitación: `cierres_caja` (tabla heredada de compatibilidad) no tiene folio; el folio de cierre vive en `cierres_turno.numero_cierre`.

## 7. Evidencia (03/11/2026, candidata con reglas del dueño)
- PostgreSQL 16 real: `scripts/prueba-caja/turnos.sql` **81/81** (incluye: comanda histórica sin archivar bloquea; archivada no; pagada pero sin entregar sigue bloqueando y no se entrega sola; Point en proceso y cobro por confirmar bloquean; días anteriores no se ocultan; otro negocio no cuenta; cierre bloqueado no cambia nada y deja evento; cobro/cortesía/venta pagada/reserva Point sin turno → P0413; Point ya confirmado se registra sin turno; borrar venta anula cobros sin error de FK).
- Carreras con dos conexiones reales: `carrera.sh` 4/4 (gastos) y **`carrera2.sh` 8/8**: comanda nueva, venta pagada, reserva Point y cobro manual contra el cierre, en **ambos órdenes** (si la operación llega primero, el cierre la ve; si el cierre llega primero, la operación queda fuera del turno cerrado o se rechaza P0413 sin dejar rastro).
- 08c sobre 08+08b ≡ 08 final (comparación de funciones, triggers, restricciones, índices y permisos); reversión y re-aplicación probadas.
- Folios (PG16): `folios.sql` **34/34** (asignación, idempotencia, histórico conservado, inmutabilidad, anulación sin reutilizar, **60 turnos** con números 1..60 sin huecos), `carrera3.sh` C1–C7 (misma clave en paralelo, equipos en paralelo, cierres en paralelo, etc.); `reversion09.sh` (reversión + re-aplicación con 60 turnos: contadores, folios y claves idénticos, siguiente turno 61); `tests/folios.test.mjs` (respuesta perdida → recarga → reintento: una venta y el mismo folio; doble clic; 23505; almacenamiento roto → clave en memoria; comanda nueva vs reintento con productos idénticos; dos pestañas simultáneas y recarga de cada una; **sessionStorage copiado** con y sin respuesta perdida, recarga legítima, latido en segundo plano, almacenamiento roto; **respuesta perdida → cierre sin liberar → reapertura inmediata (+130 s)**: misma identidad, venta, folio y clave; canal con duplicada viva; sin canal; pedido incierto que la base no tiene → bloqueado hasta comprobar/descartar; error de red no libera el bloqueo); regresión `turnos.sql` 81/81, carreras 4/4 y 8/8; 08c→09 ≡ 08→09; reversión de 09 y re-aplicación probadas.
- TypeScript: 181 pruebas, `tsc` limpio. Pendiente: build Windows del commit final (Codex), navegador sobre el proyecto de pruebas con 08c, impresora física, Point real.
