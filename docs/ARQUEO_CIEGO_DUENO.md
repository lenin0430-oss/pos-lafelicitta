# Arqueo ciego y cierre aprobado por el dueño

Preparado el 03/11/2026 en `codex/arqueo-dueno-2026-11-03`. **No publicado y sin SQL remoto.** Sustituye el permiso anterior de cierre por garzón en `/api/turno`.

## Flujo

1. La cajera abre con fondo contado. Registra cobros y gastos como hasta ahora; no administra precios ni borra ventas.
2. Declara efectivo y totales de comprobantes en «Presentar arqueo». Su respuesta de `/api/turno` no contiene fondo, ventas acumuladas, efectivo esperado ni diferencias. El historial de cierres es solo del dueño.
3. El arqueo queda guardado, pendiente e inalterable por las rutas del POS. Se conservan la declaración, autora y hora. No se cierra el turno ni se envía WhatsApp automáticamente.
4. El dueño, en su propia sesión de administrador, ve declarado/esperado/diferencia y notas. Puede aprobar y cerrar o devolver con motivo. La cajera no puede hacer ninguna de esas acciones, aunque fabrique el rol en el cuerpo de la petición.
5. Devolver no cambia la declaración anterior: la conserva y permite otra versión. El dueño tampoco reemplaza las cifras mediante el cuerpo de aprobación: la función usa el arqueo guardado.
6. El turno sigue abierto hasta la aprobación. Si cambian movimientos después de contar, la aprobación se rechaza y el dueño debe devolver el arqueo para un nuevo conteo. El sistema compara movimientos completos, además de saldos, bajo el mismo bloqueo de turno.
7. Reintentar la misma presentación o aprobación no duplica el arqueo ni el cierre. Las comandas pendientes, ventas sin cobrar y Point por confirmar siguen bloqueando el proceso.

## Alcance y límite del arqueo ciego

No basta con esconder cifras mediante CSS: el servidor recorta las respuestas al perfil garzón y rechaza la lectura del historial. La cajera sigue viendo los importes de las comandas que opera y sus comprobantes; no se promete que no pueda calcular o recordar ventas.

**Esto no completa por sí solo el cierre del acceso directo a la base.** La publicación anterior dejó 07a/07 para otra ventana. Antes de presentar esta función como protegida frente a acceso directo con la llave pública, hay que verificar y cerrar esas rutas de datos privados, preservando menú y bot. SQL10 cierra por RLS y privilegios su tabla nueva y funciones; no modifica las políticas previas de `ventas` ni otras tablas. No difundir un claim de seguridad total con solo esta entrega.

## SQL y publicación

`supabase/10_arqueo_aprobacion_dueno.sql` es aditiva y requiere 08 final + 09. Tabla privada `arqueos_turno`, tres funciones, un índice de pendientes y claves únicas. No toca precios, ventas históricas ni folios. Probarla primero en la base aislada y recorrer login cajera → abrir → gastos → presentar → dueño → devolver → nueva declaración → aprobar → reimprimir.

El código nuevo falla cerrado si falta SQL10; no puede publicarse antes de la migración. El SQL solo permite invocar sus funciones con service_role; el servidor exige sesión admin para aprobar/devolver. No se aplicó en producción ni pruebas remotas.

Reversión operativa: volver al despliegue anterior conservando `arqueos_turno` para auditoría; sus cambios son aditivos. **El código anterior vuelve a permitir su flujo de cierre anterior**, por lo que esa reversión requiere supervisión del dueño. No borrar la tabla ni declaraciones para deshacer una publicación. Reaplicar SQL10 literalmente no es idempotente: comprobar su existencia antes de cualquier ejecución.

## Evidencia local

- `npm test` con PGlite: **188/188**, ninguna omitida. Los fallos iniciales de conexiones del simulador dentro del entorno restringido se resolvieron repitiendo el mismo ensayo local con acceso permitido.
- `tsc --noEmit`: correcto. `next build`: correcto en Windows, variables públicas ficticias; no se publicó.
- `tests/arqueoDueno.test.mjs`: seis pruebas de permisos, no filtración del esperado en GET/POST/historial, cuenta de negocio desde sesión, aprobación sin reemplazar contado y ausencia de vía alternativa de cierre.
- `tests/arqueoSql.test.mjs`: persistencia de declaraciones, cambio posterior, devolución conservando versión, aprobación/reintento y privilegios en PostgreSQL en memoria.
- PostgreSQL **17.6 local**, dos procesos psql independientes: **3/3** (gasto antes de aprobación, aprobación antes de gasto, dos aprobaciones simultáneas). Sincronización comprobada por `pg_stat_activity/PgSleep`; el ejecutor anterior con señal de stdout no garantizaba la carrera y fue corregido. Scripts: `scripts/prueba-caja/arqueo-concurrencia.mjs` y `output/postgres-pruebas/revisar-arqueo.ps1` en la carpeta de trabajo superior.
- **Ensayo visual con API ficticia**, NO E2E remoto: la compilación real se sirve en localhost:3114 mediante `scripts/prueba-caja/preview-arqueo.mjs`, que intercepta TODAS las rutas `/api/` y no contacta Supabase ni Mercado Pago. Cajera declara $27.000; no ve esperado ni diferencia ni botón de aprobar. Dueño ve $28.000 esperado y −$1.000 de diferencia; botones aprobar/devolver. Capturas: `docs/evidencia/ARQUEO_CIEGO_CAJERA.png` y `ARQUEO_CIEGO_DUENO.png`.
- Falta recorrido completo sobre proyecto aislado con login real y SQL10, incluido circuito de gastos y reimpresión; queda separado del fixture visual. No se creó ni cerró un turno productivo para esta entrega.
