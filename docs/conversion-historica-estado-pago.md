# Conversión histórica de `estado_pago` — criterio, evidencia y excepciones (antes de migrar)

**Regla madre:** una venta no se considera pagada solo por un estado de cocina. Se exige además evidencia del paso de cobro.

## Evidencia (lectura de solo lectura, 02/11/2026)
- El código 8142dc7 crea la comanda con `metodo_pago = ''` (`app/page.tsx`) y **solo escribe el método en el paso de cobro**, junto con `estado='listo'`. La cocina marca `listo` sin tocar `metodo_pago`.
- `ventas.estado`: `listo` 6.095, `pendiente` 2 (ningún `en_proceso`/`entregado`). De las `listo`: 583 de La Felicitta tienen `metodo_pago` vacío ($4.263.280); 6 son método "Cortesía" ($32.400); el resto trae método. Point: 5 pagos `processed` coinciden con 5 ventas.
- `tipo_servicio` es NULL en todo el histórico (no ayuda a distinguir). Las 583 se concentran entre junio y septiembre.

## Criterio de conversión (supabase/03)
| Condición histórica | `estado_pago` | Nota |
|---|---|---|
| `estado='listo'` y método = Cortesía | `cortesia` | no es cobro; no suma al cierre |
| `estado='listo'` y método no vacío | `pagado` | el método evidencia el paso de cobro |
| `estado='listo'` y método vacío | `sin_identificar` | no se inventa método ni se asume cobro; importe intacto |
| cualquier otro estado (`pendiente`, `en_proceso`, `entregado`…) | `pendiente` | nunca se deduce pagado |

No se modifican `metodo_pago`, `total`, `created_at` ni `items`. `pagado_at` queda NULL en el histórico (los informes usan `created_at` como respaldo).

Cocina: `listo` de más de 12 h pasa a `entregado` (copia en `estado_legacy`) para no mostrar miles de comandas viejas; las `listo` recientes no cambian.

## Excepciones y riesgos conocidos (no resueltos por la migración)
1. El esquema tiene `metodo_pago` con valor por defecto `'Débito'`: una inserción directa sin método (no hecha por este código) se vería como pagada con débito. 1.523 ventas son Débito; no hay forma de distinguirlas.
2. La pantalla de reportes permite "corregir pago" (admin): un método puesto a posteriori en una venta `listo` se leería como pago. Desde esta rama, corregir una `sin_identificar` fija su estado de pago según el método elegido.
3. Origen de las 583 sin método no probado (¿cortesías sin etiquetar, deudas, ventas no cobradas, error de captura?). Por eso permanecen visibles como "Sin identificar" y fuera de cobros y del saldo pendiente. Decidir con el dueño si alguna se reclasifica.
4. Una `listo` reciente (<12 h) con método vacío queda `sin_identificar` aunque en realidad pueda estar sin cobrar: **aplicar fuera del horario de servicio**, con cierre hecho.

## Verificación posterior (solo lectura)
`supabase/verificar_03_04.sql`: mismas cantidades y suma de `total` antes y después; `pagadas_sin_metodo = 0`; `sin_identificar_con_metodo = 0`; `pagadas_sin_listo = 0`.
