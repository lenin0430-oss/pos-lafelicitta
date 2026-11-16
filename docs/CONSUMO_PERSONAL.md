# Consumo personal de trabajadores

**Estado:** rama `claude/consumo-personal`. Nada aplicado en la base ni publicado en producción.

## Qué hace
- En Caja, al cobrar: «Consumo de trabajador (se descuenta de su pago)» → nombre del trabajador → «Anotar $X a este trabajador». Pide confirmación.
- La venta queda como **consumo personal**: registra la comanda y descuenta inventario, pero **no es un cobro**. No suma a efectivo, débito, transferencia ni QR, así que el arqueo no cambia.
- **Punto rojo** en la pantalla principal («Por descontar $3.800 · 2 trabajadores»), visible todo el turno; se actualiza cada minuto y al registrar o descontar. Lleva a `/consumos`.
- Pantalla **Consumos** (`/consumos`): por trabajador, cada consumo con fecha, comanda y productos. El administrador pulsa «Descontar $X» al pagarle el día; queda marcado con autor y fecha.
- **Comprobante** (en pantalla e impreso, con línea de firma) al descontar, y «Resumen» antes de descontar.
- **Cierre**: panel rojo «Descontar a trabajadores» con el detalle, y al confirmar el cierre pide una confirmación extra si queda algo sin descontar. No bloquea el cierre: lo que no se descuenta pasa al día siguiente.
- **Reportes**: tarjeta «Consumo personal» aparte de cobros, saldo pendiente y cortesías.

## Qué NO cambia (comprobado)
- `cobros_turno`, `turno_resumen`, `turno_bloqueos` y `turno_cerrar` no se tocan. Un consumo personal no escribe en la caja y no bloquea el cierre.
- Una venta de consumo no se puede cobrar, editar ni pasar a Point (07c y 04b la rechazan, como a las abonadas). Tampoco se le puede «corregir el medio de pago» desde Reportes.
- Solo el administrador marca consumos como descontados (también lo exige el servidor, no solo la pantalla).

## Cómo aplicarlo (en este orden)
1. Respaldo de la base (Supabase). Requiere 08 y 11 ya aplicadas.
2. Ejecutar `supabase/12_consumo_personal.sql` (una transacción).
3. Publicar la rama (Vercel genera una vista previa antes de tocar producción).
4. Probar con una venta chica: anotar a un trabajador, ver el punto rojo, mirar el cierre (el efectivo esperado no cambia), descontar e imprimir el comprobante.
Reversión: `supabase/12_consumo_personal_REVERSION.sql` (se detiene si ya hay consumos registrados, para no perder el historial).

## Pruebas hechas
- `scripts/prueba-caja/consumo-personal.sql` en PostgreSQL 16 local (base.sql + 04 + 04b + 07c + 08 + 08c + 11 + 12): **30 comprobaciones OK** (caja intacta, aislamiento entre negocios, doble registro, doble descuento, venta abonada/cobrada, permisos, borrado, reversión).
- `tests/consumoPersonal.test.mjs`: 11 pruebas OK (validación, permisos, agrupación por trabajador, la caja no suma consumos, reportes).
- Pruebas relacionadas (abonos, reportes, cierre, datosAutorizados, turnos): sin cambios, siguen en verde.
- **Pendiente:** `next build` y probar las pantallas en la vista previa. En esta sesión npm no pudo descargar paquetes, así que las pantallas (`.tsx`) solo se revisaron con el compilador de tipos sin dependencias: sin errores propios, pero no se ejecutaron.

## Aviso por WhatsApp al cierre — evaluación
**Viable, pero no se incluyó:** el mensaje lo arma el bot en el droplet (67.205.170.244), no el POS.
- El POS ya manda el cierre al bot (`/api/cierre-whatsapp` → `/cierre-turno`) y filtra los campos permitidos (`lib/seguridadBot.ts`). Agregar «consumos por descontar» al envío es pequeño.
- El bot en producción (Baileys, puerto 3001) **no es el del repositorio** (el repo tiene la versión vieja, sin `/cierre-turno`). Sin ver el `bot.js` vivo no se puede saber si ignora campos nuevos ni dónde insertar el texto. Mandar campos nuevos a ciegas podría romper el aviso de cierre que hoy funciona.
- Para hacerlo: leer `/root/bot-lafelicitta/bot.js` por SSH, agregar las líneas «Por descontar: Juan $2.300 · María $1.500» al mensaje, probar con un envío de prueba y recién entonces sumar el campo al POS. El respaldo `bot_BACKUP_20260610.js` sirve de retorno.
- Mientras tanto el aviso ya existe en pantalla: punto rojo + panel en el cierre + confirmación al cerrar.

## Pendiente / decisiones
- Precio del consumo: hoy se anota al **precio de venta** de la comanda. Si se quiere cobrar a costo o con descuento fijo, se ajusta antes de descontar.
- Anular un consumo mal anotado: hoy solo borrando la venta (admin), como con los abonos.
- Descuento de sueldo en Chile: requiere acuerdo escrito con el trabajador y el total de descuentos no puede pasar del 15% de su remuneración. Confirmarlo con el contador.
