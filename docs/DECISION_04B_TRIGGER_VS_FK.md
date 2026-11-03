# Decisión 04b — trigger vs. clave foránea compuesta

Objetivo: que un cobro Point (`pagos_point`) solo pueda existir sobre una venta del MISMO negocio (`ventas.empresa_id = pagos_point.restaurante_id`), también si alguien escribe con la llave de servicio, con dos solicitudes en paralelo o si luego se edita la venta.

Todo lo medido aquí se ejecutó en un PostgreSQL 16 local y aislado (no en Supabase ni en producción). PGlite sirvió para la lógica; la concurrencia solo cuenta lo probado en PostgreSQL real (`tests/concurrencia_04b.sh`).

## Fallo encontrado en la primera versión
La primera 04b era un solo trigger en `pagos_point` que leía `ventas` sin bloquearla. Con dos conexiones: una cambia la empresa de la venta a B (sin confirmar) y otra inserta el cobro de A → el trigger ve todavía la empresa antigua, deja pasar el cobro y al confirmar queda un cobro de A sobre una venta de B (resultado medido: 1 cobro incompatible). Tampoco había nada que impidiera cambiar después la empresa de una venta con cobros.

## Solución elegida (04b revisada)
1. Trigger en `pagos_point` (INSERT y cambios de `venta_id`/`restaurante_id`): rechaza nulos, ventas inexistentes, ventas sin empresa y ventas de otro negocio; lee la venta con `FOR SHARE`, así nadie puede cambiarle la empresa hasta que termine la transacción del cobro (y si el cambio ya estaba pendiente, el cobro espera y luego se rechaza).
2. Trigger en `ventas` (cambios de `empresa_id`/`id`): rechaza el cambio si dejaría incompatible algún cobro existente; permite corregir la empresa para que coincida con sus cobros.
3. No modifica ni corrige filas históricas. `supabase/verificar_04b.sql` (solo lectura) las lista con su motivo. Las actualizaciones de otras columnas (estado, monto, `mp_order_id`: lo que hace el webhook) no evalúan el trigger.

## Comparación
| Criterio | Trigger (elegido) | FK compuesta `(venta_id, restaurante_id) → ventas(id, empresa_id)` |
|---|---|---|
| Tipos actuales (`venta_id` y `restaurante_id` son `text`; `ventas.id`/`empresa_id` son `uuid`) | funciona sin cambiar columnas (compara como texto) | **no se puede crear**: «incompatible types: text and uuid». Exige `ALTER COLUMN … TYPE uuid` en una tabla en uso |
| Históricos incompatibles (p. ej. ids que no son uuid) | no se tocan; se listan | el cambio de tipo **falla** con ids no convertibles (`invalid input syntax for type uuid`); habría que decidir qué hacer con ellos antes. `NOT VALID` evita validar el pasado, pero `VALIDATE` falla mientras exista uno |
| Nulos | los rechaza | con `MATCH SIMPLE` (por defecto) un `restaurante_id` NULL **pasa**; hace falta `NOT NULL`/`MATCH FULL` (y los históricos con NULL lo impiden) |
| Cambio posterior de empresa de la venta | trigger adicional en `ventas` | nativo (`NO ACTION`): rechaza si hay cobros referenciados (medido) |
| Concurrencia | `FOR SHARE` (probado con dos conexiones: C2/C3/C5/C6) | nativa, sin código propio |
| UPDATE de otras columnas en históricos incompatibles | permitido (medido) | permitido con `NOT VALID` (medido) |
| Riesgo de despliegue | bajo: aditivo, sin reescritura, reversible borrando 2 triggers | medio-alto: reescritura/bloqueo de la tabla, cambio de tipos que toca código y el bot, índice de 04 a reconstruir, requiere resolver históricos |
| Mensaje de error | claro y controlable (`23514`) | genérico (`23503`) |

Elección: **trigger ahora**, porque funciona con el esquema real, no exige tocar datos históricos y quedó probado bajo concurrencia real. La FK compuesta es mejor a largo plazo (garantía declarativa del motor). Se recomienda evaluarla en una migración futura aparte, cuando: (1) `verificar_04b.sql` en producción (lectura) liste 0 incompatibles o se decida qué hacer con ellas, (2) se migren `venta_id`/`restaurante_id` a `uuid` junto con el código y el bot, (3) se agregue `NOT NULL` y se use `MATCH FULL`. Entonces se podrían retirar los dos triggers.

## Límites
- La prueba de concurrencia se hizo en PostgreSQL 16.15 local; Supabase corre PostgreSQL gestionado (versión a confirmar). Debe repetirse con `tests/concurrencia_04b.sh` en un PostgreSQL local con la versión de Supabase antes de producción, y las pruebas de aplicación/reversión siguen pendientes en `mesapos-pruebas-aislado` (bloqueadas por la aprobación de Supabase).
- Rendimiento: la comparación `v.id::text = new.venta_id` no usa el índice de `ventas.id`; irrelevante con cientos de ventas, a revisar si crecen a cientos de miles.
- Si en producción hubiera cobros históricos incompatibles, 04b no los corrige: reasignarlos exige una decisión explícita.
