# Evidencia — caja y turnos en navegador (proyecto de pruebas, datos ficticios)
Candidata e20e30f en http://localhost:3112 (modo servidor=1), simulador Point en 127.0.0.1:4010. Negocio A ficticio, admin ficticio. Sin producción.

## Turno 1 (martes 03-11, 12:57–13:02 hora de Chile)
Fondo $1.000; efectivo, débito, transferencia, crédito, mixto y cortesía; 2 Point por confirmar (no QR); gasto de caja $2.000 + gasto fuera de caja $1.500; retiro $3.000; otro equipo agrega un gasto antes de confirmar → la pantalla se actualiza y cancela; el servidor rechaza cifras viejas (409 `resumen_cambio`). Cierre: esperado = contado en efectivo, débito, crédito y transferencia (diferencia 0). 9 cobros activos; fila de compatibilidad en `cierres_caja`; eventos `turno_abierto`, `cobro_conciliado`×2, `retiro`, `turno_cerrado`.

## Turno 2 (lunes 02-11 11:00 → cierre martes 03-11, con pendientes)
- Apertura con fondo $2.000, efectivo $4.000, transferencia $7.000, 2 Point por confirmar.
- Corrección de Point mal confirmado: 9113 confirmado como efectivo por error → «Cambiar a Débito» (queda `cobro_corregido`, medio anterior `efectivo`); efectivo vuelve a $4.000 y débito pasa a $4.000.
- Cruce de medianoche (simulado con datos ficticios: apertura fijada a lunes 11:00 y un cobro a las 00:20 del martes; el reloj real no se puede adelantar): un gasto registrado ya en martes entra al mismo turno; abrir turno de nuevo → 409 `ya_abierto`; la pantalla muestra «Turno del lunes, 02-11 · abierto a las 11:00 · lleva 27,4 h» y avisa que lleva más de 16 h abierto.
- Cierre con pendientes: efectivo esperado $5.000 / contado $4.500 (dif. −$500), débito $4.000 / $4.000, transferencia $7.000 sin comprobar, Point $4.500 por confirmar. Guardado con `con_pendientes = true`; el historial lo marca «con pendientes». Avisó «Sin comprobar: Transferencia» antes de cerrar.
- Ticket (contenido del bloque de impresión): turno, apertura/cierre, fondo, cobros por medio, gastos, retiros, esperado/contado/diferencia por medio, «CON PENDIENTES», firma. El botón Imprimir invocó la impresión una vez (impresora real sin probar).
- El turno 1 no cambió (cierres inmutables).

## Aviso al dueño (WhatsApp) — PENDIENTE
El cierre llama a `/api/cierre-whatsapp` con cajero, fecha y horas de apertura/cierre, ventas por medio (Point sin confirmar no cuenta como QR; crédito suma a débito), efectivo esperado/físico, diferencia, fondo, gastos de caja y notas. En pruebas responde 503 «Notificaciones no configuradas» (sin `BOT_URL`/`BOT_SECRET`/`BOT_EMPRESA_ID`), por lo que **no se verificó el mensaje recibido**. Pendientes: (1) configurar el bot en un entorno de prueba y verificar entrega; (2) el payload no lleva todavía `por confirmar`, `sin comprobar`, `con pendientes`, retiros ni fecha de apertura del turno (la lista de campos permitidos está en `lib/seguridadBot.ts` y el bot debe aceptarlos); (3) decidir si el aviso sale del servidor al cerrar (hoy lo dispara el navegador y puede perderse si se cierra la ventana).
