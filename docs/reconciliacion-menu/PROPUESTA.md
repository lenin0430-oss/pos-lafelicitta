# Reconciliación de menú — lista exacta (PROPUESTA, no aplicada)

Negocio `382de687-99e1-4303-bbac-783561f663f0` (La Felicitta). Fuente única: `operaciones.json`. SQL: `supabase/05_reconciliar_menu_PROPUESTA.sql` (todo o nada, protegido por el precio actual). Reversión: `…_REVERSION.sql`.

Los precios nuevos son los del menú actualizado acordados en el chat. Las 7 altas son una **propuesta editable**: confirmar nombres, precios y categorías.

## A. Cambiar precio (27)

| # | Identificador | Categoría | Producto | Antes | Después |
|---|---|---|---|---:|---:|
| 1 | `29d4c257-52b1-4a8c-9cfe-1fb2d0f61054` | Almuerzos | Chop suey | $6.990 | $6.500 |
| 2 | `9783702e-209e-49fe-af11-57fe3d28dc96` | Almuerzos | Chuleta vetada | $4.000 | $4.500 |
| 3 | `dfaf3872-c736-4e25-955e-269ab6b1fbb4` | Almuerzos | Pechuga a la plancha | $4.000 | $4.500 |
| 4 | `e47d901b-215d-4687-9ab3-06692165f324` | Almuerzos | Pollo agridulce | $6.990 | $7.500 |
| 5 | `2338b745-2279-4d78-8fef-d7ec99ba59c6` | Almuerzos | Pollo estofado | $4.000 | $4.500 |
| 6 | `198b2dc6-e7a0-40dd-8ea5-ef9641033e32` | Arroz chino | Arroz Salteado | $4.500 | $6.500 |
| 7 | `3b953208-7299-41fe-bb5a-b701008c70a2` | Cachapas | Cochino + Queso | $10.000 | $12.000 |
| 8 | `f6490e96-5670-44b4-9545-90d72c7884d0` | Cachapas | Cochino Frito | $8.500 | $9.500 |
| 9 | `ca25e4d5-b345-45b9-a63a-980a5df893f8` | Cachapas | Queso de Mano | $7.500 | $8.500 |
| 10 | `278694d3-09e4-4274-8b77-95dddc9b58b7` | Combos a la Brasa | 1 Pollo solo | $12.000 | $13.000 |
| 11 | `e5d36854-785c-4c36-b735-b3681cb9dda1` | Combos a la Brasa | ½ Pollo solo | $6.000 | $6.500 |
| 12 | `17837d01-3a95-429b-b348-73fc4691d2f4` | Combos a la Brasa | ¼ Pollo solo | $3.000 | $3.500 |
| 13 | `97928b15-113f-431e-b4de-da1be60d7052` | Empanadas | Molida | $2.500 | $3.000 |
| 14 | `a1a2eeaf-8c1f-437c-ba1d-47cea7a0d01f` | Empanadas | Pabellón | $3.000 | $3.500 |
| 15 | `6d292e6b-9dca-4c28-8c22-baf5698eb8d3` | Papas | Bacon & Cheddar | $5.500 | $6.500 |
| 16 | `8e8c1f1d-15c1-414b-b1a2-80ddb72a043c` | Papas | Nuggets 12 u. | $7.500 | $8.500 |
| 17 | `3d2de1a6-5636-4896-bce6-52981c59bbbf` | Papas | Nuggets 6 u. | $4.000 | $4.500 |
| 18 | `8448a7cb-2f35-4e36-bebf-f577076579a4` | Papas | Papas Normal | $3.500 | $3.900 |
| 19 | `fc41a41b-bfd8-45da-88c9-bbdbd4a0f184` | Papas | Papas XL | $6.500 | $7.500 |
| 20 | `4ce5ea64-e97e-4702-a18a-e0b7224a72cd` | Papas | Salchipapas Normal | $4.500 | $5.500 |
| 21 | `aaf691f4-8685-42cf-893b-c8f2f0723184` | Papas | Salchipapas XL | $7.990 | $9.990 |
| 22 | `5a50ccc5-6fac-4585-914d-f6fb9d388552` | Perros | El Americano | $3.990 | $4.500 |
| 23 | `c65c8bc2-a491-4ba5-a277-e9df9a8519c4` | Perros | El Peluo | $3.990 | $4.500 |
| 24 | `6652e6fe-1da6-4c97-b357-58fab42455fc` | Perros | El Perripollo | $3.500 | $4.500 |
| 25 | `dc087307-7942-4ca1-8564-edef27c0ef46` | Tequeños | Tequeños 8cm — 12 unidades | $5.800 | $6.800 |
| 26 | `c5d867cd-8fa7-4415-aaa0-969ad60aaef2` | Tequeños | Tequeños 8cm — 4 unidades | $2.000 | $2.500 |
| 27 | `a15481b3-401f-488e-bc47-e20dc9847adf` | Tequeños | Tequeños 8cm — 8 unidades | $3.900 | $4.800 |

## B. Desactivar, conservando historial (5)

| # | Identificador | Categoría | Producto | Precio |
|---|---|---|---|---:|
| 1 | `20587711-d391-42e5-9ccb-d9ca0491b9a6` | Almuerzos | Pollo al horno | $4.990 |
| 2 | `d5c82b31-bcfe-45ef-8bf6-33a5b00afa50` | Empanadas | Perico Queso Llanero | $2.500 |
| 3 | `f4c3511d-258a-4729-aa1d-3d032d8a6d92` | Promos | 12 Tequeños de Queso + Salsas | $5.800 |
| 4 | `40c4750e-764b-485f-8a27-9af85abd48b2` | Promos | 4 Tequeños + Bebida | $3.500 |
| 5 | `bca9416e-41ae-4498-939e-b2c9aec60f0b` | Promos | Combo Pareja | $8.000 |

Efecto: `activo=false, disponible=false`. No se borra ninguna fila; 68 líneas de ventas históricas citan estos nombres en `ventas.items` y no cambian.

## C. Crear (7, propuesta)

| # | Categoría | Producto | Precio |
|---|---|---|---:|
| 1 | Almuerzos | Pollo broaster | $5.000 |
| 2 | Extras | Salsa extra: Mayo ajo | $500 |
| 3 | Extras | Salsa extra: Cheddar | $500 |
| 4 | Extras | Salsa extra: Maíz | $500 |
| 5 | Extras | Salsa extra: Tocineta | $500 |
| 6 | Extras | Salsa extra: Picante | $500 |
| 7 | Extras | Salsa extra: Barbecue | $500 |

## Efecto sobre historial

Ninguna venta histórica cambia: `ventas.items` guarda nombre y precio de cada línea. Solo cambian precios de ventas futuras.

## Reversión

Restaura el precio anterior (solo si sigue en el valor nuevo), reactiva los 5 retirados y desactiva —no borra— los 7 creados. Las ventas hechas con los precios nuevos conservan su importe.
