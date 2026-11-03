# Comprobación en navegador y siguiente paso de publicación (NO ejecutada)

Base: rama `claude/preparacion-2026-11-02`, que incorpora `origin/main` = `4bcd30e` (diseño visual, dependencias corregidas y los siete precios de hamburguesas ya publicados) más las migraciones 03/04/04b, el simulador y las pruebas. **Se conservan el diseño y todos los precios publicados; esta guía no cambia catálogo ni precios.** Verificar `origin/main` al preparar cada entrega. Esta rama **no está aprobada para publicar**. Todo en una **vista previa aislada con base de pruebas**; nunca contra la base productiva ni con cobros reales.

## Entorno de prueba (a preparar; requiere tu aprobación)
1. Proyecto Supabase **de pruebas**: `mesapos-pruebas-aislado` (ref `wcoaulvlicfimdfmwhid`). Nunca producción (`xlzbqgvmwbskpfajehgi`); `mesapos-piloto-chile` está inactivo: no usarlo sin autorización. Esquema con `01`…`04` y `03` (y `04b` para el aislamiento a nivel de base) y datos ficticios: **dos negocios** (A y B), usuarios admin/garzón/cocina de cada uno, productos, ventas de ejemplo incluidas `listo` con y sin método y una cortesía. El catálogo (`05`) **ya está aplicado en producción: no se ejecuta ni se revierte en esta prueba**; los productos de prueba se usan tal como están.
2. Proyecto Vercel de vista previa con variables **de prueba**: Supabase de pruebas, `SESSION_SECRET`, `CRON_SECRET`, `BOT_SECRET`, `BOT_URL` (apuntando a un receptor falso, no al bot real), `BOT_EMPRESA_ID`. Sin credenciales de Mercado Pago reales: Point se simula (ver la sección «Flujo completo con Point simulado»).
3. Alternativa local: `npm run dev` en Windows con `.env.local` de pruebas.

## Lista de comprobación (marcar al ejecutar)
**Arranque / Next 15:** inicia sesión por rol; rutas sin error 500 en consola; recarga conserva sesión; `/api/mp/callback` responde sin 500 con `state` inválido (usa `await cookies()`).
**Comanda y cocina:** crear comanda de mesa → aparece en cocina; pasar a en proceso y listo; **cobrar manual no la retira**; "Entregado" sí la retira; una comanda de >12 h sin entregar sigue visible con "Antigua · N h".
**Cobro manual:** efectivo, débito, transferencia, mixto → `estado_pago='pagado'` y `pagado_at`; Cortesía → `cortesia` y no suma al cierre; intentar cobrar dos veces no duplica.
**Cierre:** el turno suma solo cobros con fecha en el turno; una venta creada en el turno A y cobrada en B cuenta en B una sola vez; marcar entregado no la quita; el envío a WhatsApp sin sesión → 401 (probar con curl), con otra empresa → 403, con receptor falso → recibe solo campos permitidos.
**Reportes:** tres cifras (registradas / cobros recibidos / saldo pendiente) más "Sin identificar" y cortesías; las ventas históricas sin método aparecen como "Sin identificar"; método por pagos suma cobros; CSV con columnas de estado de cocina y de pago; "Editar pago" sobre una "Sin identificar" fija su estado de pago.
**Productos:** editar precio y activar/desactivar funciona; el menú del POS refleja el cambio.
**Responsive:** móvil (comanda/cocina/cobro) sin desbordes.
**Point (solo simulado):** ver la sección «Flujo completo con Point simulado» más abajo (simulador local, sin cobros reales). El cobro real con terminal se prueba **después**, con tu autorización, monto bajo y mesa PRUEBA.
**Consola/red:** sin errores de hidratación ni advertencias de `cookies()`/`headers()` sin await.

## Siguiente paso de publicación (cuando apruebes cada punto) — procedimiento unificado con `docs/PLAN_PUBLICACION.md`
1. Aprobar: este plan, `docs/PLAN_PUBLICACION.md`, criterio del histórico y, si se desea, el corte de `06` (archivo de cocina).
2. Montar el entorno de prueba y ejecutar la lista de arriba y la del flujo con Point simulado; archivar capturas y resultado.
3. Ensayo completo en la base de pruebas, **cada migración en una sola transacción**: pagos y estados `03` → verificar → `04` → `04b` → verificar y reversión inversa (`04b` → `04` → `03`). `06` (archivo de cocina) es un paso aparte, solo si se aprueba su corte. **El catálogo `05` ya está aplicado: no se repite ni se revierte como parte de esta prueba.**
4. Producción, fuera de horario y con cierre hecho: respaldo → `03` → verificación → (`06` si se aprobó) → `04` → `verificar_04b.sql` (lectura) → `04b` → desplegar el código aprobado → pruebas de humo → rotación coordinada del secreto del bot (**sigue pendiente**).
5. Punto de retorno del código: el despliegue de producción vigente `dpl_AMbvJb44…` (`4bcd30e`) en Vercel. **Revertir código no revierte datos**: las migraciones aplicadas quedan, y las reversiones SQL son un paso aparte con el orden de `docs/PLAN_PUBLICACION.md`. El código de `4bcd30e` inserta cobros con `restaurante_id` y `venta_id` de una venta del mismo negocio, por lo que no choca con `04b` (revisado leyendo el código, no ejecutado).

## Límites conocidos
Auditoría limpia no certifica seguridad total. No se ha ejecutado OAuth con cuenta real. El dueño confirmó efectivo y débito con Point en el POS **publicado** (Next 15, `main`); eso **no prueba** todavía la rama nueva de estados y cobros (03/04/04b), que sigue sin ejecutarse en navegador ni con terminal físico.


---

# Flujo completo con Point simulado: pedido → cocina → cobro → entrega → cierre (preparado 02/11/2026, NO ejecutado)

Todo con datos **ficticios** y **sin cobros reales**: la app habla con `scripts/simulador-point.mjs`, que solo acepta tokens `TEST-…`.

**Alcance real de la protección del simulador.** `lib/mpApi.ts` desvía las llamadas al simulador solo si `MP_SIMULADOR_URL` es `http` a localhost/127.0.0.1/[::1] y **`VERCEL_ENV` no es `production`**. No bloquea por `NODE_ENV=production`: una compilación local (`next build` + `next start`) con esa variable **sí** usaría el simulador, y fuera de Vercel no hay otra barrera. Por eso: no pongas `MP_SIMULADOR_URL` en ningún despliegue, y usa **solo credenciales ficticias desde el origen** (cuenta `TEST-` creada con el script; nunca un token real, aunque el simulador lo rechace).

## 1. Entorno (local en Windows; nada se publica)
1. **Base:** únicamente `mesapos-pruebas-aislado` (ref `wcoaulvlicfimdfmwhid`). Antes de arrancar, comprueba que `NEXT_PUBLIC_SUPABASE_URL` de `.env.local` contiene ese ref. **Nunca** uses la llave de servicio de producción. Las llaves las pones tú en `.env.local`; no las pegues en el chat.
2. **Esquema:** 03 y 04 aplicadas (y 04b para el caso P12 a nivel de base). Si las reversiones pendientes se ejecutan antes, reaplicar 03 → 04 → 04b primero.
3. **Cuenta ficticia de Mercado Pago:** `MP_TOKEN_KEY=<clave de prueba> node scripts/prueba-navegador/sql_mp_cuenta_ficticia.mjs <empresa_id de prueba>` imprime un `insert` con tokens `TEST-` cifrados; ejecútalo solo en el proyecto de pruebas.
4. **Variables de prueba** (`.env.local`): `SESSION_SECRET`, `CRON_SECRET`, `BOT_SECRET` (valor de prueba), `BOT_URL` (receptor falso, no el bot real), `BOT_EMPRESA_ID`, `MP_TOKEN_KEY`, `MP_WEBHOOK_SECRET` (valor de prueba) y `MP_SIMULADOR_URL=http://127.0.0.1:4010`. `lib/mpApi.ts` solo acepta ese valor si es `http` a localhost/127.0.0.1 y nunca con `VERCEL_ENV=production`.
5. **Arranque:** `node scripts/simulador-point.mjs` (panel en `http://127.0.0.1:4010`) y `npm run dev` (`http://localhost:3000`). En el panel escribe el mismo `MP_WEBHOOK_SECRET` de prueba para poder enviar webhooks.
6. En **Configuración** elige el terminal `TERM-FICTICIA` (el simulador lo lista).

## 2. Cómo se prueba cada caso
Para cada caso: ejecuta los pasos, captura la pantalla, y pega los bloques A–D de `scripts/prueba-navegador/verificar_flujo.sql` en el editor SQL del proyecto de pruebas (solo lectura). Los invariantes C1–C4 deben dar **0 filas** después de **cada** caso. Estados de la orden se manejan desde el panel del simulador (at_terminal / processed / failed / canceled / expired y «enviar webhook»).

| # | Caso | Pasos | Esperado en pantalla | Esperado en base / simulador |
|---|---|---|---|---|
| F1 | Pedido → cocina | Crear comanda mesa PRUEBA-1 con 2 productos | Aparece en cocina; pasar a en proceso y listo | `ventas.estado` cambia; `estado_pago='pendiente'`; sin `pagos_point` |
| P1 | Aprobado | Cobrar con Point → en el panel: at_terminal → processed (esperar el sondeo de 3 s o enviar webhook) | «Enviado al Point…», «Esperando que el cliente pague…», «¡Pago aprobado! ✅» | 1 fila `processed`, `estado_pago='pagado'`, `metodo_pago='Point'`, `pagado_at` con valor; `ventas.estado` (cocina) **sin cambio**; simulador: 1 orden |
| P1b | Webhook repetido | Enviar el webhook 3 veces más | Sin cambios visibles | `pagado_at` no cambia; sigue 1 fila; 0 duplicados |
| P2 | Rechazo | Otra venta: cobrar → at_terminal → **failed** | «Pago rechazado»; el botón «Cobrar con Point» vuelve a estar disponible | Fila `failed`; venta `pendiente`, sin `pagado_at`; no suma al cierre |
| P3 | Cancelación en el terminal | Cobrar → **canceled** | «Cobro cancelado» | Fila `canceled`; venta `pendiente` |
| P4 | Expiración | Cobrar → **expired** | «El cobro expiró» | Fila `expired`; venta `pendiente` |
| P5 | Reintento tras rechazo | Después de P2/P3/P4 volver a cobrar la misma venta y aprobar | Pago aprobado | Filas: la anterior en estado final + una nueva con **otra** `clave_idempotencia`; 1 solo `processed` |
| P6 | Respuesta perdida | Panel: «perder respuesta» → Cobrar | Error: «No se confirmó el envío al Point. Reintenta: no se duplicará el cobro.» | Fila `reservado` sin `mp_order_id`; simulador: **1** orden (existe) |
| P6b | Reintento tras respuesta perdida | Presionar Cobrar otra vez | Sigue como un cobro normal («Enviado al Point…») | La **misma** fila toma el `mp_order_id` de la orden ya existente; simulador sigue con **1** orden; 1 fila activa |
| P7 | Error 500 de Point sin crear | Panel: «error 500» → Cobrar → Cobrar de nuevo | Primer intento: mismo mensaje de reintento; segundo: normal | Simulador: 0 órdenes tras el 1.º, 1 tras el 2.º; 1 fila |
| P8 | Máquina con cobro pendiente | Panel: «máquina con cobro pendiente (409)» → Cobrar | «La máquina tiene un cobro pendiente. Termínalo o cancélalo en el Point.» | Fila `failed` con `detalle` `mp_409_already_queued_order_on_terminal`; se puede reintentar |
| P9 | Doble clic / dos pestañas | Abrir la misma venta en 2 pestañas y presionar Cobrar casi a la vez | Ambas muestran el mismo cobro | 1 fila activa, 1 orden (C1 = 0 filas) |
| P10 | Venta ya cobrada / total cambiado | Cobrar manualmente en efectivo y luego intentar Point; o editar la venta antes de cobrar | «La venta ya está cobrada» / «El total cambió…» | Sin filas nuevas; simulador sin órdenes nuevas |
| P11 | Webhook inválido | Panel: marcar «firma inválida» y enviar | — | El POS responde **401** (aparece en el aviso del panel); estado de la fila sin cambio |
| P12 | Aislamiento entre negocios | Con la sesión del negocio B (segundo negocio ficticio) intentar cobrar una venta del negocio A (p. ej. desde la consola: `fetch('/api/point/cobrar',…)`) | Error «Venta no encontrada» (404) | Sin filas nuevas. Con 04b aplicada, además: un `insert` directo con la llave de servicio sobre una venta ajena falla con 23514 |
| E1 | Entrega | En cocina pulsar «Entregado» en una venta ya pagada | Sale de cocina | `ventas.estado='entregado'`; `estado_pago` y `pagado_at` **no cambian** |
| E2 | Entrega sin pago | «Entregado» en una venta pendiente de pago | Sale de cocina | `estado='entregado'`, `estado_pago='pendiente'`: se puede cobrar aparte (el bloque C5 la lista como informativa) |
| C1 | Cierre | Abrir `/cierre` del turno | Efectivo/débito/Point/transferencia/mixto cuadran con los bloques D y A | Total = suma de ventas `pagado`; los intentos rechazados/cancelados/expirados no suman; P1 cuenta **una** vez bajo «Point» |
| C2 | Cierre por turno | Cobrar una venta creada en el turno A durante el B | Cuenta en el turno B una sola vez | Misma verificación por fecha de cobro |

## 3. Criterio de aprobado
Todos los casos con captura + bloques A–D; C1–C4 siempre vacíos; simulador con el número de órdenes indicado; ningún error 500 ni de hidratación en consola; ninguna petición a `api.mercadopago.com` (comprobar en la pestaña Red: solo `127.0.0.1:4010` desde el servidor — en el navegador no se ven llamadas a Mercado Pago).

## 4. Lo que esta prueba NO cubre
Las pruebas automáticas contra el simulador (§5) usan repositorios falsos y estados simulados: **no demuestran** por sí solas el flujo navegador → sesión → API → Supabase → webhook → cierre; eso solo lo demuestra ejecutar esta guía con la base de pruebas.
Terminal físico, OAuth real, comportamiento real de Mercado Pago ante idempotencia y estados, emisión tributaria y cobros reales. El simulador reproduce el contrato que usa la app, no a Mercado Pago: el comportamiento real se prueba aparte, con tu autorización, monto bajo y mesa PRUEBA.

## 5. Automatizado hoy (sin navegador)
`tests/pointSimulador.test.mjs` ejecuta la orquestación real del cobro contra el simulador HTTP (aprobado, rechazo/cancelación/expiración con reintento, respuesta perdida, error 500, máquina ocupada, doble clic, venta ya cobrada). `tests/simuladorPoint.test.mjs`, `tests/mpApi.test.mjs` y `tests/cuentaFicticia.test.mjs` prueban el simulador, la salvaguarda de URL y el SQL ficticio.
