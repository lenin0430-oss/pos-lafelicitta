# Caja y turnos — propuesta e implementación (candidata, sin publicar)

Estado (rev. 2, tras revisión de Codex sobre e848547): implementado en la rama `claude/candidata-permisos-point-2026-11-02`. Probado en PostgreSQL 16 local (53 comprobaciones + 4 carreras con conexiones reales) y 151/151 pruebas de la suite, `tsc` sin errores. **Migración 08 sin aplicar en ningún proyecto**; producción intacta.

## Regla de horario (confirmada por el dueño)
La jornada empieza hacia las 11:00 y termina cuando se confirma «Cerrar turno», entre las 00:00 y la 01:00 del día siguiente. A las 00:00 no se reinicia nada y el miércoles no se abre una nueva jornada. El turno se identifica por la **fecha de apertura** (hora de Chile) y guarda las **horas reales** de apertura y cierre. Ninguna función de 08 usa la fecha del día para agrupar: el turno es una fila que se abre y se cierra explícitamente.

## Qué fallaba en el cierre actual
1. Ventas del turno = pagadas desde la hora de apertura, y el "día" se cortaba a medianoche del dispositivo: un turno que cruza medianoche se partía.
2. «Point» se agrupaba en QR; el esperado en efectivo ignoraba que Point puede ser efectivo/débito/QR → efectivo esperado $0 y sobrante falso de $140.400.
3. Todo se calculaba en el navegador y se guardaba lo que el navegador enviaba; no había clave de cierre (doble clic = doble cierre) ni protección frente a un cobro simultáneo.
4. Gastos y propinas se asociaban por hora (`created_at ≥ apertura`), no por turno; el gasto restaba efectivo si `afecto_caja` estaba en true sin que el cajero lo hubiera decidido.
5. No quedaba esperado/contado/diferencia por medio ni historial de cambios.

## Modelo (supabase/08_turnos_caja.sql, una transacción, con reversión)
- Turno = `aperturas_caja` ampliada (`modelo='v2'`, `fecha_apertura`, `cerrada_por`); índice único: un turno v2 abierto por negocio.
- `cobros_turno`: una fila por medio (efectivo, débito, crédito, transferencia, QR, cortesía, **por_conciliar**) y proveedor (manual/point). Un trigger la crea cuando la venta pasa a pagada, así cubre cobro manual, mixto y Point sin cambiar esos flujos. Mixto que no suma deja la diferencia como «por conciliar», nunca como efectivo.
- Gastos y propinas reciben `apertura_id` del turno abierto al insertarse. Solo los gastos con `afecto_caja=true` restan efectivo. Los retiros (`movimientos_caja`) restan efectivo y exigen motivo.
- Point: `lib/medioPoint.ts` toma el medio de `payment_method.type` de la orden solo si es valor conocido y hay un único pago; si no, queda **«Point por confirmar»** y la cajera elige el medio mirando el comprobante (`cobro_conciliar`, auditado). **Pendiente confirmar** con una orden real qué valores devuelve la cuenta (la documentación solo muestra `credit_card`).
- Cierre (`turno_cerrar`): bloquea el turno (`FOR UPDATE`), recalcula todo con lo guardado, exige efectivo contado, acepta contado opcional por medio electrónico (sin comprobar queda marcado), guarda esperado/contado/diferencia por medio en `cierres_turno_medios` y una instantánea en `cierres_turno`. Misma clave → devuelve el mismo cierre; otra clave → «ya cerrado». Un cobro que llegue mientras cierra espera, queda **fuera** del cierre y se registra como «cobro sin turno» (no se pierde ni se oculta). Escribe además una fila en `cierres_caja` para reportes existentes (los «por confirmar» no se cuentan como QR).
- Historial inmutable (`cierres_turno`, `cierres_turno_medios`, `turno_eventos`: update/delete bloqueados), RLS cerrada, funciones solo para `service_role`.
- No hace UPDATE sobre filas existentes: no se corrige ningún histórico ni se infiere nada.

## Pantalla (app/cierre/page.tsx, solo admin como antes)
1 Abrir con fondo contado → 2 lo registrado (por medio, gastos de caja, retiros, efectivo que debería haber) + retiros + «Point por confirmar» → 3 contar efectivo (obligatorio) y comprobar electrónicos → 4 confirmar con aviso (sin `window.confirm`). Muestra fecha de apertura, hora real y horas abiertas; avisa si el turno lleva más de 16 h abierto. Historial con diferencias por medio. API única: `/api/turno` (GET estado/historial, POST abrir/retiro/conciliar/cerrar), negocio y autor salen de la sesión firmada.

## Caso real reproducido (datos agregados, sin tocar histórico)
Fondo $1.000; Point conciliado efectivo $149.490, débito $61.500, QR $3.000; débito manual $3.000; transferencias $16.400; gastos de caja $121.400 (incluyen Jesús $30.000 y Feli $20.000, no se descuentan otra vez); retiro $10.000 (Adriana); contado $10.000.
Efectivo esperado = 1.000 + 149.490 − 121.400 − 10.000 = **$19.090** → diferencia **−$9.090** (provisional, pendiente de comprobar; **no se atribuye a la cajera**). Débito esperado $64.500; transferencia $16.400; QR $3.000: sin diferencia. El turno real ya cerrado **no se reescribe**.

## Pruebas
- `scripts/prueba-caja/` (`base.sql` + `turnos.sql`, PostgreSQL 16): 34/34 — caso real; turno del martes que cierra después de medianoche (cobro de madrugada dentro del mismo turno, intento de abrir el miércoles → «ya abierto»); dos turnos seguidos; dos negocios; transferencia, mixto, mixto que no suma, cortesía; retiros; gasto fuera de caja; anulación; reintento y doble cierre; cobro repetido sin duplicar; historial inmutable; históricos intactos; permisos. Además, carrera real con dos sesiones: cierre lento + cobro + segundo cierre + apertura simultáneos → 1 cierre, cobro fuera del cierre y registrado como sin turno.
- `tests/turnos.test.mjs`: 9 pruebas (validación, pertenencia al negocio, clave de cierre, campos ajenos descartados, medio Point).

## Pendientes / decisiones
1. Aplicar 08 en `mesapos-pruebas-aislado` (lo ejecuta el usuario en el editor SQL) y repetir el recorrido en navegador con datos ficticios.
2. Propina en efectivo pagada desde la caja: hoy se registra como retiro (decisión del dueño).
3. Cobro sin turno abierto: queda sin turno y avisado; ¿se prefiere bloquear el cobro?
4. Confirmar con una orden Point real los valores de `payment_method.type`.
5. Antes de producción: cerrar con el flujo actual cualquier turno abierto (los turnos `legacy` no se mezclan con v2), comprobar el default de `ventas.metodo_pago` en producción, y el payload de WhatsApp (los «por confirmar» no tienen campo propio).
6. Verificar con Codex build de Windows; coordinar antes de cualquier publicación.

## Revisión 2 — bloqueantes de Codex corregidos
1. **Gasto/propina tardío**: el trigger valida el `apertura_id` explícito (mismo negocio, turno v2 abierto, con bloqueo compartido que se serializa con el cierre). Gastos y propinas de un turno cerrado no se modifican ni se borran; el borrado en turno abierto queda en eventos. El turno cerrado siempre muestra su instantánea (el resumen posterior ya no cambia). `registrarGasto` ya no lee la apertura por separado. Probado con carrera de dos sesiones: cierre + gasto explícito → gasto rechazado.
2. **Anular y volver a cobrar**: la unicidad es solo entre cobros activos (`venta_id, medio` donde no está anulado). Anular marca el cobro y lo registra (`anulacion_posterior_al_cierre` si el turno ya estaba cerrado, sin cambiar ese cierre); volver a cobrar crea un cobro activo en el turno abierto.
3. **Caminos antiguos**: `/api/datos` ya no escribe `aperturas_caja` ni `cierres_caja` (solo lectura; abrir y cerrar solo por `/api/turno`). Además, la base rechaza UPDATE/DELETE/INSERT directo sobre turnos v2 y `cierres_caja` contra un turno v2 fuera de las funciones. Borrar gastos de turnos cerrados lo bloquea la base. Pendiente: un turno `legacy` abierto ya no tiene botón para cerrarse; hay que cerrarlo antes de desplegar (o con SQL).
4. **Pantalla desactualizada**: refresco cada 15 s y al volver a la ventana; si cambia el esperado se cancela la confirmación y se avisa. Al confirmar, la pantalla envía las cifras que vio; si el servidor tiene otras, **no cierra** y devuelve las nuevas (`resumen_cambio`, 409).
5. **Point pendiente identificable**: cada «por confirmar» muestra comanda, mesa, mesero, hora y referencia de la orden.

## Revisión 3 — dos casos de Codex sobre aa2731b
1. **Carrera DELETE/UPDATE de gasto contra cierre**: el trigger ahora toma bloqueo compartido del turno también en UPDATE/DELETE (y la anulación de un cobro lo toma antes de registrar), igual que el cierre toma `FOR UPDATE`. `scripts/prueba-caja/carrera.sh` prueba con dos conexiones reales, en ambos órdenes y para DELETE y UPDATE: si la operación sobre el gasto empieza primero, el cierre espera y guarda el estado final (gasto borrado → 0; actualizado → 1); si el cierre empieza primero, la operación se rechaza (`TURNO_CERRADO`) y el cierre conserva $500. 4/4 correctas.
2. **Esperado negativo**: `esperado_visto` admite enteros con signo (se acota a ±100.000.000); lo contado sigue siendo no negativo. Prueba de servidor (esperado −1000, contado 0 → 200; contado −1, decimales o texto → 400) y de base (cierre con esperado −1000 y diferencia +1000).

## Revisión 4 — recorrido en navegador (localhost:3112, c1f7b68, proyecto de pruebas)
Recorrido con datos ficticios (negocio A, admin ficticio): apertura con fondo $1.000 → cobros efectivo, débito, transferencia, crédito, mixto y cortesía → 2 cobros Point con simulador (quedaron «por confirmar», no en QR) → gasto de caja $2.000 y gasto fuera de caja $1.500 (solo el primero resta) → retiro $3.000 → confirmación de Point → cierre.
- Resultado guardado: turno del martes 03-11 abierto 12:57 y cerrado 13:02 (hora de Chile), 9 cobros activos, esperado=contado en los 4 medios (diferencia 0), fila de compatibilidad en `cierres_caja`, eventos `turno_abierto`, `cobro_conciliado`×2, `retiro`, `turno_cerrado`.
- Cobro de otro equipo antes de confirmar: la pantalla se actualizó sola, canceló la confirmación y avisó; el servidor, con cifras viejas, respondió 409 `resumen_cambio` sin cerrar.
- Aviso al dueño: el cierre llama a `/api/cierre-whatsapp` con las cifras correctas (Point sin confirmar no cuenta como QR); en pruebas responde 503 «Notificaciones no configuradas» porque no hay bot configurado (esperado).
Fallas encontradas y corregidas: (1) imprimir sacaba la pantalla completa → ahora ticket de 58 mm con turno, horas, medios esperado/contado/diferencia, gastos, retiros y firma; (2) aviso falso de «entraron cobros nuevos» tras las propias acciones → solo avisa por cambios ajenos; (3) un clic equivocado al confirmar un Point era irreversible → se puede corregir mientras el turno esté abierto (queda `cobro_corregido` con el medio anterior; un medio informado por Mercado Pago o un cobro manual no se corrigen así); (4) texto «Transferencia comprobada». Migración nueva `08b_conciliar_corregible.sql` (solo reemplaza `cobro_conciliar`; ya incluida en 08).
Pendiente: reimprimir un cierre desde el historial; probar impresión real en la térmica; probar un Point con medio informado por Mercado Pago (el simulador aún no lo devuelve).

## Revisión 5 — segundo turno en navegador (e20e30f + 08b)
Corrección de un Point mal confirmado, cierre con pendientes, cruce de medianoche (simulado con datos ficticios) y ticket: todo OK; detalle en `docs/evidencia/CAJA_navegador_2026-11-03.md`. El aviso al dueño sigue **pendiente** (bot no configurado en pruebas; el payload aún no incluye pendientes ni retiros; hoy lo dispara el navegador).
