# Plan de sustitución y rotación del secreto del cron / bot (NO ejecutado)

**Hallazgo (02/11/2026).** Un mismo secreto, corto y deducible, está escrito en texto plano en el repositorio y en su historial de Git (`vercel.json`, `app/api/reporte-semanal/route.ts`, `app/api/cierre-whatsapp/route.ts`). Se usa para dos cosas distintas:
1. token del cron `/api/reporte-semanal?token=…` (cualquiera que lo conozca puede invocar el reporte);
2. cabecera `x-bot-secret` hacia el bot de WhatsApp (`http://<IP>:3001/cierre-turno`, sin cifrado).

Además `POST /api/cierre-whatsapp` **no exige sesión**: cualquiera puede pedirle al POS que reenvíe mensajes al bot con ese secreto. Este documento no contiene el valor.

## Fase A — Sustitución en el código (reversible, sin rotar todavía)
1. Revisar con `node docs/rotacion-secreto-cron/sustituir-secreto-por-variables.mjs` (vista previa).
2. Aplicarlo con `--aplicar` en una rama. Quita el valor del código y de `vercel.json`; el cron pasa a autenticarse con `Authorization: Bearer $CRON_SECRET` (Vercel Cron lo envía solo si existe la variable `CRON_SECRET`); el bot lee `BOT_SECRET`.
3. **Antes de desplegar**, crear en Vercel (Production y Preview) `CRON_SECRET` y `BOT_SECRET`. Mientras `BOT_SECRET` no coincida con lo que acepta el bot, los envíos a WhatsApp fallarán (cierre de turno y reporte semanal): por eso la rotación del bot (Fase B) y este despliegue deben hacerse en la misma ventana.
4. Pendiente de decisión, fuera del script: exigir sesión en `/api/cierre-whatsapp` (hoy es un relé abierto).

## Fase B — Rotación (requiere acceso que esta sesión no tiene)
1. Generar dos valores aleatorios largos distintos (≥ 32 bytes, p. ej. `openssl rand -base64 32`); guardarlos solo en Vercel y en el servidor del bot.
2. Servidor del bot (DigitalOcean, `:3001`): cambiar el secreto aceptado en `x-bot-secret` al nuevo `BOT_SECRET`; reiniciar el bot.
3. Vercel → Environment Variables: cargar `CRON_SECRET` y `BOT_SECRET`; desplegar la Fase A.
4. Probar con un envío de prueba al bot (mensaje de prueba, sin datos reales) y esperar o disparar manualmente el cron.
5. Confirmar que el valor antiguo ya no es aceptado por el bot ni por el cron (debe responder 401).

## Fase C — Higiene
- El valor antiguo seguirá en el historial de Git: tratarlo como comprometido (la rotación lo invalida). Reescribir historial es opcional y riesgoso; no es necesario si el valor ya no sirve.
- Si el repositorio de GitHub es o fue público, asumir exposición. Revisar el acceso al servidor del bot y usar HTTPS o una red privada para ese enlace.
- Buscar el mismo valor en otros repos propios (menú, bot) y en variables de otros proyectos.

## Reversión
- Fase A: `git revert` del commit; el cron vuelve a `?token=` (solo si el valor antiguo sigue vigente; si ya se rotó, restaurar la variable antigua en el bot).
- Fase B: conservar el valor anterior hasta confirmar que todo funciona; no se borra en ningún sitio hasta el paso 5.
