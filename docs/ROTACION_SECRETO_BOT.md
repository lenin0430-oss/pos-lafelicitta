# Rotación coordinada del secreto POS ↔ bot (no es una tarea "para después")

Objetivo: reemplazar el secreto antiguo (`x-bot-secret`) sin cortar los cierres de turno y **comprobar que el antiguo queda rechazado**.
Los valores nunca se escriben en el repositorio, en chats ni en registros. Se generan y se copian directamente entre los paneles (Vercel del POS y servidor/Vercel del bot).
Probado de extremo a extremo con un bot falso local: `tests/rotacionBot.test.mjs` (módulo `lib/rotacionSecretoBot.ts`).

| Fase | Bot | POS (Vercel) | Comprobación |
|---|---|---|---|
| 0 | Acepta solo el antiguo | Envía el antiguo (hoy, en `vercel.json`/código antiguo: **retirado** en esta versión) | — |
| A | Despliega la regla `secretoBotAceptado`: acepta `BOT_SECRET_ACTUAL`=nuevo y `BOT_SECRET_ANTERIOR`=antiguo | Sin cambios | Un cierre de prueba con el antiguo sigue funcionando |
| B | Igual | Despliega esta versión con `BOT_SECRET`=nuevo (+ `BOT_URL`, `BOT_EMPRESA_ID`, `CRON_SECRET`) | Cierre de prueba con sesión OK; sin sesión 401; otra empresa 403 |
| C | **Retira `BOT_SECRET_ANTERIOR`** y redespliega | Sin cambios | Con el secreto antiguo el bot responde 401 (ver abajo) y el POS con el nuevo sigue funcionando |

Comprobar que el antiguo es rechazado (sin imprimir secretos): con las variables `BOT_URL_PRUEBA`, `SECRETO_ANTERIOR`, `SECRETO_NUEVO` definidas en la sesión de PowerShell del propietario, `node scripts/verificar-rotacion-bot.mjs` envía una petición de verificación con cada uno y exige: nuevo → 2xx, anterior → 401/403. **Contra el bot real use `SOLO_ANTERIOR=1`** (no envía nada con el nuevo; esa petición podría generar un mensaje de WhatsApp); la prueba completa va contra un bot de pruebas. Termina con código distinto de 0 si el antiguo sigue aceptándose.

Reversión: antes de la fase C se puede volver al antiguo (el bot aún lo acepta). Después de C, volver exige reconfigurar el bot. Si el secreto antiguo estuvo expuesto, no se vuelve a usar nunca: se genera otro.
Pendiente que solo el propietario puede ejecutar: el código del bot vive en otro proyecto (no está en este repositorio).
