# Integración Mercado Pago Point — MesaPOS (multi-cliente con OAuth)

Probado el 01/11/2026: cobro enviado por API → Point Smart → pago aprobado → boleta impresa ("Válido como boleta").

## Cómo funciona
1. Cada restaurante entra a `/configuracion/mercadopago` y presiona **Conectar mi cuenta de Mercado Pago** (OAuth + PKCE).
2. MesaPOS guarda su token **cifrado** en `mp_cuentas` y lo renueva solo (dura 180 días).
3. El restaurante elige su Point y activa el modo "Cobra desde MesaPOS" (PDV).
4. En la venta, `BotonCobrarPoint` crea la orden en **la cuenta de ese restaurante**; el dinero va directo a él.
5. El webhook (firma validada) y `/api/point/estado` actualizan `pagos_point`.

## Archivos
| Archivo | Para qué |
|---|---|
| `supabase/01_tabla_pagos_point.sql` | Tabla de pagos |
| `supabase/02_mp_cuentas_oauth.sql` | Tabla de cuentas conectadas + `restaurante_id` en pagos |
| `lib/mp.ts` | OAuth, cifrado de tokens, renovación, llamadas a la API |
| `lib/restaurante.ts` | **Único lugar** que decide el restaurante de la sesión (⚠️ conectar a `lib/auth.ts`) |
| `app/api/mp/conectar` | Inicia OAuth |
| `app/api/mp/callback` | Recibe el código, guarda la cuenta |
| `app/api/mp/terminales` | Lista Point, elige uno, cambia modo PDV/STANDALONE |
| `app/api/point/cobrar` | Crea el cobro |
| `app/api/point/estado` | Consulta estado (solo órdenes propias) |
| `app/api/point/webhook` | Avisos de MP con firma `x-signature` |
| `app/configuracion/mercadopago/page.tsx` | Pantalla de conexión |
| `components/BotonCobrarPoint.tsx` | Botón de cobro |

## Variables de entorno (Vercel + .env.local) — solo servidor
```
MP_CLIENT_ID=5633945719763385          # N.º de la app MesaPOS
MP_CLIENT_SECRET=...                    # Credenciales de producción → Client Secret
MP_REDIRECT_URI=https://TU-DOMINIO/api/mp/callback
MP_WEBHOOK_SECRET=...                   # Panel MP → Webhooks → Clave secreta
MP_TOKEN_KEY=una-frase-larga-y-secreta  # cifra los tokens en la base
APP_URL=https://TU-DOMINIO
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
```
`MP_ACCESS_TOKEN` y `MP_TERMINAL_ID` ya NO se usan (cada restaurante tiene los suyos).

## Configurar en Mercado Pago Developers (app MesaPOS)
- **Configuración de la aplicación → URLs de redireccionamiento:** `https://TU-DOMINIO/api/mp/callback` (debe ser idéntica a `MP_REDIRECT_URI`).
- Activar **PKCE** en los detalles de la aplicación.
- **Webhooks:** URL `https://TU-DOMINIO/api/point/webhook`, tópico **Order**; copiar la clave secreta a `MP_WEBHOOK_SECRET`.

## Pendiente (pedírselo a Claude Code)
1. Conectar `lib/restaurante.ts` con la sesión real (`lib/auth.ts`). **Obligatorio antes de producción.**
2. Poner `BotonCobrarPoint` en la pantalla de cobro.
3. En el webhook: marcar la venta como pagada cuando `status === "processed"`.
4. Botón "Desconectar Mercado Pago" (borrar fila de `mp_cuentas`).

## Notas
- Montos en CLP como entero (`"500"`).
- Si queda una orden en `at_terminal` y bloquea nuevas (`already_queued_order_on_terminal`), se libera al expirar; por eso usamos `expiration_time: PT5M`.
- Después de cambiar modo PDV/STANDALONE hay que reiniciar el Point.

> Nota: `lib/mercadopago.ts` es la versión vieja (sin uso). Bórralo cuando puedas.
