# Plan de sustitución y rotación del secreto del cron / bot (NO ejecutado)

**Hallazgo (02/11/2026).** Un mismo secreto, corto y deducible, está escrito en texto plano en el repositorio y en su historial de Git (`vercel.json`, `app/api/reporte-semanal/route.ts`, `app/api/cierre-whatsapp/route.ts`). Se usa para dos cosas distintas:
1. token del cron `/api/reporte-semanal?token=…` (cualquiera que lo conozca puede invocar el reporte);
2. cabecera `x-bot-secret` hacia el bot de WhatsApp (`http://<IP>:3001/cierre-turno`, sin cifrado).

Además `POST /api/cierre-whatsapp` **no exige sesión**: cualquiera puede pedirle al POS que reenvíe mensajes al bot con ese secreto. Este documento no contiene el valor.

## Fase A — Código (YA hecho en la rama; no desplegado)
- `vercel.json`: el cron ya no lleva token en la URL; Vercel Cron envía `Authorization: Bearer $CRON_SECRET`.
- `/api/reporte-semanal`: valida ese Bearer (comparación de tiempo constante, secreto ≥ 24 caracteres; sin `CRON_SECRET` rechaza todo).
- `/api/cierre-whatsapp`: **exige sesión** del negocio vinculado (`BOT_EMPRESA_ID`) con rol admin o garzón, filtra el contenido a campos numéricos/texto conocidos (descarta `mensaje_custom`, `reporte_semanal` y cualquier otro) y usa `BOT_SECRET` solo en el servidor. Sin `BOT_URL`/`BOT_SECRET`/`BOT_EMPRESA_ID` responde 503.
- `app/cierre/page.tsx` ya no envía ninguna cabecera secreta (estaba en el JavaScript del navegador: **el valor antiguo es público**, trátalo como tal).
- Pruebas: `tests/reportes.test.mjs` (401/403/503/400, whitelist, Bearer).
- Variables nuevas (Vercel, Production y Preview): `CRON_SECRET`, `BOT_SECRET`, `BOT_URL`, `BOT_EMPRESA_ID`.

## Fase B — Rotación coordinada (requiere acceso que esta sesión no tiene; nada ejecutado)
Orden pensado para no cortar los envíos a WhatsApp:
1. Generar dos valores aleatorios largos distintos (`openssl rand -base64 32`); guardarlos solo en Vercel y en el servidor del bot.
2. **Bot**: aceptar durante la ventana AMBOS secretos (el antiguo y el nuevo) en `x-bot-secret`. Reiniciar.
3. **Vercel**: crear `CRON_SECRET`, `BOT_SECRET` (nuevo), `BOT_URL`, `BOT_EMPRESA_ID`. Desplegar el código de la rama (después de la migración, ver `docs/PLAN_PUBLICACION.md`).
4. Probar: un cierre de turno de prueba (con sesión) y una invocación manual del cron con el Bearer. Verificar con un POST sin sesión → 401, con otra empresa → 403.
5. **Bot**: retirar el secreto antiguo. Confirmar que el antiguo recibe 401 en el bot y que `/api/reporte-semanal?token=…` ya no existe como vía de acceso.
6. Recomendado: HTTPS (o red privada/túnel) hacia el bot en lugar de `http://IP:3001`, y limitar por firewall el puerto 3001 a las IP de Vercel o a un proxy; añadir límite de frecuencia en el bot.

## Fase C — Higiene
- El valor antiguo seguirá en el historial de Git y estuvo en JS del navegador: considerarlo comprometido; la rotación lo invalida. No hace falta reescribir el historial si ya no sirve.
- Buscar el mismo valor en otros repos propios (menú, bot) y en variables de otros proyectos.

## Reversión
- Código: `git revert`; el cron volvería a un token en URL (no recomendado) — solo con el valor antiguo vigente en el bot.
- Rotación: mantener el secreto antiguo aceptado en el bot hasta confirmar el paso 4; el paso 5 es el único irreversible (volver a aceptar el antiguo exige reconfigurar el bot).
