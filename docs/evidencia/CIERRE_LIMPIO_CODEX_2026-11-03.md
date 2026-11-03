# Cierre limpio y aviso móvil — 3 de noviembre de 2026

Destino exclusivo: `mesapos-pruebas-aislado` (`wcoaulvlicfimdfmwhid`). Código base `666a7aa` (producto `8c37a78`), rama aislada `codex/cierre-limpio-2026-11-03`. Sin publicación ni cambios en producción.

## Negocio nuevo

Se creó `E2E Cierre limpio Codex`, id `c0300000-0000-4000-8000-000000000001`, con administrador y catálogo ficticios. No se reutilizaron los negocios A/B ni se resolvieron sus comandas pendientes.

Al comenzar había 90 ventas anteriores (las 84 originales más las seis del recorrido de Claude). Antes y después conservan el mismo hash de filas completas: `fe7ffbf10236ab4ae3bdacfa71f58ea0`. No se modificaron las 26 comandas antiguas ni se archivaron, entregaron o cobraron para facilitar el ensayo.

## Recorrido realizado

- Login y apertura por pantalla: fondo $10.000, Turno N° 0001.
- Por HTTP contra las rutas reales del servidor local, con sesión obtenida por login: cinco comandas de $5.000, cobradas respectivamente en efectivo, débito, transferencia, QR y crédito. Todas pasaron por pendiente → en proceso → listo → entregado; quedaron pagadas. Folios del negocio nuevo: 1–5.
- Por `/api/gastos`: gasto de caja $2.000 y otro gasto $1.500 pagado fuera de caja. El segundo se registra pero no resta efectivo.
- Retiro por pantalla: $3.000, con motivo y receptor ficticios.
- Contado y confirmación por pantalla: efectivo $10.000 y $5.000 en cada medio electrónico. Cierre N° 0001, sin pendientes.

| Medio | Esperado | Contado | Diferencia |
| --- | ---: | ---: | ---: |
| Efectivo | $10.000 | $10.000 | $0 |
| Débito | $5.000 | $5.000 | $0 |
| Crédito | $5.000 | $5.000 | $0 |
| Transferencia | $5.000 | $5.000 | $0 |
| QR | $5.000 | $5.000 | $0 |

Efectivo: $10.000 de fondo + $5.000 cobrados − $2.000 de gasto de caja − $3.000 de retiro = $10.000. Las tarjetas, transferencia y QR no se restan del cajón.

Turno 1: `5958f096-124f-4a10-8ab8-8b36b8954a03`. Cierre 1: `69980a75-7739-4119-b4e4-921a4bb0c596`. Apertura 17:21 y cierre 17:26, hora de Chile.

El historial mostró los contados y esperados originales. «Reimprimir cierre» activó la impresión; no se imprimió papel ni se validó la térmica física. El navegador integrado quedó detenido por el diálogo de impresión y fue necesario recargar para continuar. No afirmar validación física de 58 mm.

El aviso al dueño indicó NO enviado (bot no configurado), y el cierre se conservó. No se enviaron mensajes a terceros.

## Siguiente turno

Se abrió por pantalla el Turno N° 0002 con fondo $10.000. Mostró cero cobros, gastos y retiros: no arrastró los del primero. Se cerró también por pantalla, con contado $10.000, Cierre N° 0002, sin pendientes y sin diferencia. El negocio de ensayo queda sin turno abierto.

La consulta final confirma dos turnos cerrados, dos cierres consecutivos y cero diferencias no nulas distintas de cero. `por_conciliar` queda en cero; su contado no aplicable permanece nulo.

## Aviso móvil

Se sacó el aviso del encabezado fijo y se colocó en una fila normal debajo del encabezado. Sus botones pueden saltar de línea. No se modificaron las reglas financieras ni de bloqueo.

Se revisó en el navegador a 618 × 900 y 390 × 844. Para mostrar el aviso se inyectó temporalmente un dato visual ficticio en la copia local; se retiró antes de compilar y guardar el commit. Las capturas son de esa fixture visual, no de un pedido real incierto. Menú y Comanda permanecen visibles debajo del aviso. Capturas: `aviso-618-codex.png`, `aviso-390-codex.png`.

## Verificación y límites

- `tsc --noEmit`: correcto.
- Build de Windows: correcto con el preview detenido. Un primer intento con directorio de compilación alternativo y preview vivo falló en /_not-found; se repitió sin concurrencia y terminó correctamente. La configuración temporal y el cambio automático de tsconfig fueron retirados.
- Suite secuencial con el cargador habitual: 181 casos, 162 pasan, 19 omitidos por PGlite, cero fallos.
- La primera corrida paralela tuvo un fallo intermitente en la prueba existente del canal de pestañas (espera simulada de 20 ms). Se conserva su registro; no se cambió el producto ni se ocultó el fallo para hacerlo pasar. La corrida secuencial pasa. Queda como limitación de estabilidad de esa prueba, no demostrado que sea causado por el cambio visual.
- Cobros de este ensayo: registro manual por medio. No se usó terminal Point real ni dinero real.
- Los escenarios de medianoche y respuesta perdida son evidencia anterior, no se repitieron en este recorrido limpio.

Evidencia adicional: `CIERRE_LIMPIO_CODEX_API.json` (sin cookies ni llaves), y los logs `consolidacion/cierre-limpio-tests.log`, `cierre-limpio-tests-secuencial.log`, `cierre-limpio-build.log`.
