# Integración Mercado Pago Point — MesaPOS (multi-cliente con OAuth)

Última revisión: 02/11/2026 (rama `claude/preparacion-2026-11-02`, **sin desplegar**).

## Evidencia
- **Prueba operativa reportada por el propietario (01/11/2026, versión 8142dc7):** cobro enviado por API → Point Smart → pago aprobado → boleta impresa. No se repitió en esta revisión; no se hicieron cobros.
- **Comprobado ahora, con datos ficticios y sin red:** 28 pruebas locales (`npm test`): solicitudes simultáneas, respuesta perdida, fallo al guardar `pagos_point`, estados y cierre, y migraciones SQL en PostgreSQL en memoria.
- **No comprobado:** comportamiento real contra Mercado Pago de la reserva/idempotencia nueva; `next build` (no ejecutable en el entorno de revisión; se comprueba tipos con `tsc`).
- Point no equivale por sí solo a emisión de facturas. El voucher puede sustituir la boleta según el modelo tributario del contribuyente; verificar con el SII antes de anunciar facturación.

## Cómo funciona (versión de esta rama)
1. Cada negocio entra a `/configuracion/mercadopago` → **Conectar Mercado Pago** (OAuth + PKCE). El token se guarda **cifrado** en `mp_cuentas` y se renueva solo.
2. El negocio elige su Point y activa el modo PDV ("Cobra desde MesaPOS").
3. `BotonCobrarPoint` (en el modal de cobro) llama a `POST /api/point/cobrar`.
4. **Cobro sin duplicados** (`lib/pointCobro.ts`):
   - se *reserva* un intento en `pagos_point` (`estado='reservado'`); un índice único parcial permite **un solo intento activo por venta y negocio**, incluso con solicitudes simultáneas;
   - la **clave de idempotencia** (`X-Idempotency-Key`) se guarda en esa fila y es la misma en todo reintento: Mercado Pago devuelve la misma orden;
   - si se pierde la respuesta, o falla el guardado tras crear la orden, la fila queda `reservado` y el reintento recupera la misma orden;
   - error definitivo de MP (4xx) → el intento se cierra en `failed`; fallo ambiguo (red, 408, 429, 5xx) → se conserva para reintentar.
5. El estado se actualiza por webhook (firma `x-signature` validada; se consulta la orden con el token del negocio) y por *polling* (`/api/point/estado`).
6. Al aprobarse (`processed`) se marca **solo el estado financiero** (`ventas.estado_pago='pagado'`, `metodo_pago='Point'`, `pagado_at`). **No se toca el estado de cocina** (`ventas.estado`).

## Estados separados
| Columna | Significado | Valores |
|---|---|---|
| `ventas.estado` | preparación / entrega (cocina) | `pendiente`, `en_proceso`, `listo`, `entregado` |
| `ventas.estado_pago` | estado financiero | `pendiente`, `pagado`, `cortesia`, `sin_identificar` |
Cobrar no retira la comanda de cocina (solo "Entregado" lo hace). Marcar preparado o entregado no impide cobrar ni quita una venta pagada del cierre (cubierto por pruebas). El cierre, el reporte semanal y Point leen `estado_pago`.

## Migraciones (revisar; NO aplicadas)
| Archivo | Qué hace | Reversión |
|---|---|---|
| `supabase/01_…`, `02_…` | tablas existentes (ya aplicadas en producción) | — |
| `supabase/03_estados_separados.sql` | agrega `estado_pago`/`pagado_at`, clasifica el histórico por inferencia (criterio en `docs/conversion-historica-estado-pago.md`) sin tocar `ventas.estado`, añade `cocina_archivada_at`, disparador de compatibilidad con el código antiguo | `03_estados_separados_REVERSION.sql` |
| `supabase/03b_retirar_compatibilidad.sql` | quita el disparador cuando ya no corra el código antiguo | — |
| `supabase/04_pagos_point_reserva.sql` | `clave_idempotencia`, `referencia_externa`, `detalle` y el índice único de un intento activo por venta | `04_pagos_point_reserva_REVERSION.sql` |

**Orden de despliegue:** ver `docs/PLAN_PUBLICACION.md` (respaldo → 03 → verificar → 04 → verificar → código → 03b más tarde). Si el código se despliega sin 03/04, el cobro responde 503 "Falta migración" sin llamar a Mercado Pago. Las migraciones son aditivas y compatibles con el código actual; el código nuevo **requiere** ambas.

## Variables de entorno (solo servidor)
`MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `MP_TOKEN_KEY`, `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `MP_ACCESS_TOKEN` y `MP_TERMINAL_ID` ya no se usan.

## Configuración en Mercado Pago Developers
- URL de redirección: `https://TU-DOMINIO/api/mp/callback` (idéntica a `MP_REDIRECT_URI`); activar PKCE.
- Webhooks: `https://TU-DOMINIO/api/point/webhook`, tópico **Order**; la clave secreta va en `MP_WEBHOOK_SECRET`.

## Limitaciones conocidas
- El webhook responde 200 aunque falle el procesamiento y no hay conciliación periódica; el respaldo es el *polling* del cliente. Si se crea una orden y el guardado falla, el webhook no puede ubicar el negocio hasta que se reintente el cobro (la fila `reservado` conserva la clave para recuperarla).
- Una fila `reservado` sin `mp_order_id` queda activa hasta que se reintente o se cierre a mano; no hay barrido automático.
- Si se cambia el monto de la venta con un cobro `reservado`/activo, se responde 409 hasta cancelar el cobro en el Point.
- Después de cambiar modo PDV/STANDALONE hay que reiniciar el Point. Montos en CLP enteros. `expiration_time: PT5M`.
- `lib/mercadopago.ts` (versión antigua) no se usa; eliminar cuando se pueda.

## Pendiente
Botón "Desconectar Mercado Pago"; conciliación periódica de órdenes; prueba controlada en el negocio (ver `ESTADO_ACTUAL.md`).
