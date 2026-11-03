# Prueba e2e de la candidata 7e04fcb con dos negocios (PREPARADA, NO EJECUTADA)

Alcance: SOLO `mesapos-pruebas-aislado` (ref `wcoaulvlicfimdfmwhid`), datos ficticios, Point simulado. Producción (`xlzbqgvmwbskpfajehgi`), precios y credenciales reales no se tocan. Complementa `docs/PRUEBA_NAVEGADOR.md` (casos Point P1–P12, E1–E2, C1–C2); aquí se añaden los dos negocios, roles, gastos, límite de login y llave pública.

## 0. Estado del proyecto de pruebas (comprobado 02/11/2026, solo lectura)
03 y 04 aplicadas; **04b, 07b, 07c, 07a y 07 pendientes** (04b esperando la confirmación del conector). Políticas aún `allow_all`. Respaldo previo en el esquema `respaldo_e2e` (empresas, usuarios, categorías, productos, mesas, 63 ventas, 4 pagos Point).

## 1. Etapas (cada migración en UNA transacción; sin dividir para evitar confirmaciones)
| Etapa | Estado de la base | Qué se prueba |
|---|---|---|
| E0 «control» | 03+04, políticas abiertas | `llave_publica.mjs control` debe mostrar acceso público (demuestra que la prueba detecta el problema) |
| E1 | + 04b + 07b + 07c | login con límite persistente, gastos aprobados, cobro manual atómico, Point, aislamiento (api + base) |
| E2 | + 07a + 07 (con `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1` y `SUPABASE_SERVICE_ROLE_KEY` en el servidor) | todo lo anterior otra vez + `llave_publica.mjs cerrado` debe dar «Sin acceso público» |
Orden de aplicación: 04b → 07b → 07c → [desplegar con interruptor 0] → 07a → [interruptor 1] → 07. Reversión de emergencia: `07_permisos_REVERSION_EMERGENCIA.sql` y las `_REVERSION` de cada paso, en orden inverso. Tras cada paso: `verificar_*.sql` (lectura) y `select` de existencia de funciones/triggers.

## 2. Datos
`scripts/prueba-navegador/semilla_dos_negocios_FICTICIA.sql`: negocios «E2E Negocio A/B», admin y garzón de cada uno (PIN de prueba 7101/7102/7201/7202, solo en este proyecto; líneas de venta con `precio_unit`, total = suma de líneas verificada dentro de la transacción; una sola transacción), productos (con «E2E Plato común» a 4000 en A y 5000 en B; «E2E Plato caro» 35000; «E2E Plato inactivo»), mesas `E2E-…`, 4 ventas (pendiente, pagada efectivo, cortesía, pendiente de B) y una apertura de caja por negocio. Cuenta Mercado Pago ficticia por negocio con `sql_mp_cuenta_ficticia.mjs`. Limpieza: `…_LIMPIEZA.sql` (destructiva; pide confirmación). No se aplica hasta que se confirme.

## 3. Entorno
`.env.local` de pruebas (llaves puestas por quien opera, no en el chat): `NEXT_PUBLIC_SUPABASE_URL` con el ref de pruebas, `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`, `SESSION_SECRET`, `CRON_SECRET`, `BOT_SECRET` (prueba), `BOT_URL` (receptor falso), `MP_TOKEN_KEY`, `MP_WEBHOOK_SECRET`, `MP_SIMULADOR_URL=http://127.0.0.1:4010`, `PIN_MODO=legacy`, `DATOS_CATALOGO` sin definir. Arranque: `node scripts/simulador-point.mjs` y `npm run dev`. Comprobar antes que el ref de la URL es el de pruebas.

## 4. Guion (marcar resultado + captura; «DB» = bloques de `verificar_flujo.sql`)
**L · Login y roles**
- L1 admin A (`e2e-admin-a@example.test` + 7101) entra; garzón A (7102) entra; recarga conserva sesión. Esperado: sesión con `empresa_id` de A.
- L2 **Administrador (email + PIN):** 5 fallos en 15 min sobre la MISMA cuenta de admin → bloqueo de 15 min (límite por cuenta); el PIN correcto durante el bloqueo también espera. Usar el admin de B para esta prueba y el de A solo para el recorrido, o esperar/limpiar `intentos_login` después.
- L2b **Garzón (solo PIN, sin cuenta identificada):** NO hay límite por cuenta; aplica solo el límite por IP: 12 fallos en 15 min → bloqueo de 10 min. Un resultado de «5 fallos y bloqueo» en el garzón sería un resultado esperado incorrecto, no un defecto del limitador. Ejecutarlo desde una IP/entorno ficticio separado (o al final del recorrido) para no bloquear el resto de casos; limpiar con `select limpiar_intentos_login(clave)` (servicio) o esperar. En ambos: `intentos_login` guarda hashes, sin PIN ni IP en claro.
- L3 garzón no ve pantallas de admin (configuración, productos con edición, reportes de admin); cocina disponible para ambos.
**K · Cocina**
- K1 garzón A crea comanda (E2E-A2) con «E2E Plato común» + «E2E Bebida A» → aparece en cocina A y NO en cocina B. Total = suma de líneas.
- K2 pendiente → en proceso → listo → entregado; cobrar manual no cambia `estado`.
- K3 intento de línea con producto inactivo o precio distinto (consola: `fetch('/api/datos',…)`) → 422 catálogo. «E2E Plato común» a 5000 en A → rechazado; en B se acepta.
- K4 garzón intenta cambiar `total` o `metodo_pago` de una venta por `/api/datos` → 403/422.
**G · Gastos**
- G1 garzón A registra gasto de 5.000 → OK. G2 garzón A gasto de 100.000 por `POST /api/gastos` sin aprobación → 403/aprobación requerida. G3 con PIN admin correcto vía `/api/admin/verificar-pin` → token; registrar gasto → OK; reusar el mismo token → rechazado; token con otro monto o de B → rechazado; token tras 300 s → vencido. G4 5 PIN admin erróneos → bloqueo persistente.
**C · Cobros** (casos Point P1–P12 de `PRUEBA_NAVEGADOR.md`, ejecutados con el negocio A y repetidos P12 con B)
- C1 cobro manual efectivo/débito/transferencia/mixto/cortesía → `estado_pago` y `pagado_at` correctos; segundo cobro de la misma venta → 409.
- C2 editar el total de una venta con reserva Point activa → bloqueado; editar y luego reservar con importe viejo → 409 «El total de la venta cambió», simulador sin órdenes.
- C3 Point aprobado/rechazado/expirado/reintento/respuesta perdida/webhook repetido: P1–P9, P11.
- C4 DB: C1–C4 de invariantes vacíos tras cada caso.
**Z · Cierre**
- Z1 `/cierre` del negocio A suma solo cobros de A; B no ve ni suma A. Z2 envío a WhatsApp: sin sesión 401, con sesión de B pidiendo A 403, receptor falso recibe solo los campos permitidos.
**I · Aislamiento**
- I1 con sesión B: leer/editar/borrar por id una venta de A vía `/api/datos` → vacío/404/403. I2 con sesión B: `/api/point/cobrar` sobre venta de A → 404. I3 con 04b: `insert` directo (llave de servicio, en el editor SQL de pruebas) de un cobro de B sobre venta de A → error 23514. I4 operaciones sin `eq(id)` exacto sobre ventas/gastos/propinas/productos/cierres/aperturas → rechazadas.
**P · Llave pública** (`scripts/prueba-navegador/llave_publica.mjs`; exige origen exacto `https://wcoaulvlicfimdfmwhid.supabase.co` y que la clave sea anon/publishable, nunca de servicio)
- Dos modos separados. **Inventario** (por defecto): solo lecturas (GET y RPC de consulta). **`--escrituras`** (+ `CONFIRMO_ESCRITURAS_PRUEBA=SI`): operaciones VÁLIDAS con datos ficticios marcados `e2e-llave-publica` (INSERT/PATCH/DELETE y RPC de escritura sobre el negocio A de la semilla); si el acceso estuviera abierto, SÍ escribe. Al final imprime el SQL de persistencia para correr con credenciales de servicio en el SQL de pruebas (la API REST no comparte transacción con una conexión SQL externa; un ensayo por rol en SQL iría dentro de BEGIN/ROLLBACK).
- Cada sonda es DENEGADO (401/403/42501), ABIERTO (operación ejecutada o filas visibles) o INCONCLUSO (columna/tabla inexistente, firma RPC incorrecta, 404, error de validación, 200 sin filas, clave inválida). INCONCLUSO no prueba permiso ni denegación. Salida 0 = todas las sondas esperadas DENEGADO; 1 = acceso abierto; 3 = verificación incompleta (no es aprobado). Un 200 sin filas no prueba aislamiento.
- P1 E0: `llave_publica.mjs control` (se espera ABIERTO: control positivo de que la prueba detecta el problema). P2 E1: inventario, resultado intermedio documentado. P3 E2: inventario y luego `--escrituras`; ambos deben terminar en salida 0 y, tras las escrituras, el SQL de persistencia debe dar 0. Lectura pública por diseño: `productos` (disponibles), `categorias`, `empresas` (columnas no sensibles); sus escrituras deben estar denegadas.
- Además, desde el navegador con `supabase-js` y la llave pública sobre `ventas`, `usuarios`, `gastos`, `pagos_point`: sin filas ni escritura.
**R · Reversión** (final) ejecutar la reversión de emergencia de 07, confirmar que el POS vuelve a funcionar con el modo anterior, y volver a aplicar 07.

## 5. Criterio de aprobado
Todos los casos con resultado y captura; invariantes vacíos; llave pública sin acceso en E2; ningún 500 ni error de hidratación; cero llamadas a `api.mercadopago.com`; ninguna fila de producción tocada. Se informa cualquier fallo con la reproducción, sin ocultar los casos no ejecutados.

## 6. Límites
No prueba terminal físico, OAuth real ni el comportamiento real de Mercado Pago. La prueba con navegador exige abrir la vista previa local (o un despliegue de vista previa de pruebas); el navegador integrado no abre `localhost` del entorno en la nube, por lo que el recorrido visual se hace en el equipo vinculado o en Chrome con la vista previa. Las comprobaciones por consola/`fetch` y las SQL sí pueden ejecutarse aquí.
