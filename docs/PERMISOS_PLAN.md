# Corrección de permisos y acceso del POS — plan, evidencia y pendientes (02/11/2026)

Rama aislada `claude/permisos-2026-11-02`, creada desde producción (`4bcd30e`): **no depende de 03/04/04b ni de los pagos**, y se puede publicar sola cuando se apruebe. **Nada está aplicado ni publicado.**

## 1. Qué se sabe y qué no
Sabido (configuración, informe `HALLAZGO_PERMISOS_PRODUCCION_2026-11-02.md`): en producción `usuarios` no tiene RLS y `anon` puede leer/escribir; `ventas` tiene RLS pero con la política `allow_all` para `{public}`. No se leyeron filas ni se probó escribir. **No hay evidencia de acceso indebido y este documento no lo afirma.**

Hallazgos adicionales **del código** (no de datos): 
- `app/gastos` consulta `usuarios` desde el navegador comparando la columna `pin`, y `app/admin/nueva-empresa` la inserta tal cual: el código **trata el PIN como texto legible**. Con `usuarios` abierta a `anon`, PIN y correos serían legibles con la llave pública. Si es así, hay que **rotar los PIN** (etapa 3) aunque no haya señales de uso.
- Las funciones `verificar_pin_garzon` y `verificar_login_admin` son `SECURITY DEFINER` y ejecutables por `anon`/`PUBLIC` (verificado en el proyecto de pruebas; **confirmar en producción**): un PIN de 4 dígitos se puede adivinar contra la API pública sin pasar por el POS.
- `/admin/nueva-empresa` crea negocios y usuarios desde el navegador: hoy cualquier admin de cualquier negocio podría usarla.
- La sesión que usa el navegador (`localStorage`) la puede editar el usuario; la que vale es la cookie firmada `lf_srv`. Todas las pantallas filtran por un `empresa_id` que sale del navegador.
- `vercel.json` y `app/api/reporte-semanal` llevan un token fijo en el código y usan la llave pública como respaldo (la rotación del cron está en la rama de preparación; aquí solo se cambia a la llave de servicio del servidor).

## 2. Inventario de acceso (navegador → tablas)
| Tablas | Pantallas | Garzón | Admin |
|---|---|---|---|
| ventas | Caja, Cocina, Reportes, Cierre | leer, crear, actualizar | + borrar |
| aperturas_caja | Caja, Cierre, Gastos, Reportes | leer | leer, crear, actualizar |
| cierres_caja | Cierre | — | leer, crear |
| gastos, propinas | Gastos, Propinas, Caja, Cierre | leer, crear | + borrar |
| productos, categorias | Caja (carta), Productos | leer | + crear, actualizar |
| mesas, configuracion_empresa, empresas | Caja, login, logo/nombre | leer | leer |
| insumos, recetas, stock_* | Insumos, Costeo, Stock, Panadería | — | todo |
| usuarios | Gastos (PIN), nueva-empresa | — (ahora por `/api/admin/verificar-pin`) | solo plataforma: alta |
| mp_cuentas, pagos_point | rutas `/api/point/*`, `/api/mp/*` | ya van por servidor con llave de servicio | idem |
`mesapos-app` (otra aplicación) también usa `usuarios`, `empresas` y `productos`: ver pendientes.

## 3. Diseño
1. **Puerta de datos** `POST /api/datos` (`lib/datosAutorizados.ts`, `lib/datosServidor.ts`): el navegador envía tabla + pasos de consulta; el servidor toma negocio y rol **de la cookie firmada**, valida tabla/operación/columnas/rol contra una lista cerrada, **fuerza el filtro del negocio**, rechaza cualquier intento de apuntar a otro negocio (403), exige filtro en update/delete, impide relaciones a otras tablas en `select`, y solo acepta JSON del mismo origen. Lo que no está en la lista no se puede.
2. **Cliente del navegador** `lib/clienteDatos.ts`: misma forma que `supabase-js`, de modo que las páginas casi no cambian. Se activa con `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1`. Sin sesión solo permite leer la carta pública (login). No hay tiempo real: Cocina consulta cada 5 s.
3. **PIN de admin** (Gastos) se verifica en `/api/admin/verificar-pin` con límite de 5 intentos / 5 min por sesión (en memoria: **falta un límite persistente**).
4. **Base**: `07a` (etapa 1) cierra `usuarios` y las funciones de login; `07` (etapa 2) cierra todo lo demás por defecto y deja abierta solo la carta (`productos disponible=true`, `categorias`, columnas públicas de `empresas`), con tablas nuevas cerradas por defecto. `service_role` no cambia.

## 4. Despliegue por etapas (cada una verificada antes de la siguiente)
| Etapa | Qué | Riesgo | Verificación | Retorno |
|---|---|---|---|---|
| 0 | Confirmar en producción (solo lectura): políticas y ACL de todas las tablas/funciones, `verificar_07.sql` bloque A; revisar `mesapos-app` y bot | nulo | listado | — |
| 1 | Desplegar la rama con `NEXT_PUBLIC_DATOS_VIA_SERVIDOR=0` y aplicar `07a` | bajo: el login ya usa servidor; Gastos usa el endpoint nuevo. **`/admin/nueva-empresa` deja de funcionar hasta la etapa 2** | login por PIN y por email, Gastos con PIN, caja, cocina, Point; con la llave pública: `usuarios` y `rpc/verificar_*` denegados | `07a_…_REVERSION_EMERGENCIA.sql` (restaura lo inseguro) o rollback de código |
| 2 | Variable en `1` y redeploy; verificación completa; aplicar `07` | medio: todo el POS pasa por la puerta | lista de §5 + `verificar_07.sql` bloques B, C, D vacíos + prueba negativa con la llave pública | variable en `0` + `07_…_REVERSION_EMERGENCIA.sql` **solo si el negocio no puede operar**; luego volver a cerrar |
| 3 | Rotar PIN de todos los usuarios; pasar a PIN con hash; límite de intentos persistente; revisar trazas de la API | medio (todos deben aprender su PIN nuevo) | login | — |
Fuera de horario, con cierre hecho, un cambio por vez y respaldo. **Orden estricto: código primero, base después.**

## 5. Pruebas
**Hechas (sin tocar ninguna base remota):**
- `tests/datosAutorizados.test.mjs` y `tests/datosServidor.test.mjs` (20 pruebas): sin sesión 401; cookie manipulada/forjada; el negocio sale de la cookie; `eq/in/neq` sobre otro negocio y `insert`/`update` con otra empresa → 403 sin llegar a la base; garzón no administra; tablas fuera de lista (usuarios, mp_cuentas, pagos_point…) y métodos peligrosos rechazados; relaciones en `select` (exfiltración por join) rechazadas; CSRF (solo JSON, mismo origen); límite de PIN; el cliente nunca envía tablas privadas directo; alta de negocios solo con `PLATAFORMA_EMPRESA_ID`.
- `tests/permisos_pg.sh` en **PostgreSQL 16 local con los roles `anon`, `authenticated` y `service_role`** (evidencia en `docs/evidencia/07_permisos_pg16.txt` y `07a_permisos_pg16.txt`): partiendo del estado observado, se **reproduce el problema** (anon lee/escribe `ventas` y `usuarios`, ejecuta el login), y tras `07`: anon no lee ni escribe 19 tablas privadas, no ejecuta funciones, solo ve la carta y columnas públicas; `authenticated` solo ve su fila sin `pin`; `service_role` ejecuta todo el flujo (venta, cocina, gasto, cierre, Point, login, PIN); tablas nuevas nacen cerradas; la reversión de emergencia deja una **huella idéntica** a la original; repetir 07/07a no falla. 77 + 22 comprobaciones.

**Pendientes (necesitan la base de pruebas y navegador):**
- Flujo completo en navegador con `DATOS_VIA_SERVIDOR=1` y `07` aplicada en `mesapos-pruebas-aislado` (bloqueado por la aprobación de Supabase para sentencias destructivas): login PIN y admin; caja (crear, cobrar efectivo/débito/mixto); cocina (cambio de estado y refresco ≤ 5 s en otra pestaña); cierre (abrir/cerrar); gastos con PIN; propinas; reportes; productos (editar precio); Point con el simulador; **negativos**: con la llave pública `GET/POST/PATCH/DELETE` a `/rest/v1/ventas|usuarios|gastos` y `rpc/verificar_*` deben fallar; un garzón no puede `update` de productos ni borrar ventas por `/api/datos`; el negocio B no ve ni toca datos de A.
- PostgreSQL 17 (producción 17.6): repetir `tests/permisos_pg.sh` (solo hay 16 local; no se espera diferencia, pero no está probado).
- Compilación y tipos en Windows (Codex).

## 6. Reversión
Código: variable en `0` y redeploy, o rollback al despliegue `dpl_AMbvJb44…` (`4bcd30e`). **Revertir código no revierte la base**: si `07` está aplicada, el código antiguo (cliente directo) deja de poder operar. Base: `07a_…/07_…_REVERSION_EMERGENCIA.sql` restauran el estado anterior desde `permisos_respaldo_07[a]` — **ese estado es el inseguro**; es una salida de emergencia, no una solución permanente. Después de usarla hay que volver a cerrar.

## 7. Decisiones y pendientes (dueño)
1. `/admin/nueva-empresa`: ¿se usa? Si sí, definir `PLATAFORMA_EMPRESA_ID` (tu negocio); si no, queda deshabilitada.
2. **Rotar los PIN** (y los correos de admin si se desea) tras cerrar el acceso; migrar a PIN con hash (`crypt`) y un límite de intentos persistente (tabla en la base).
3. `mesapos-app` usa `usuarios/empresas/productos` con la llave pública y Supabase Auth; el bot de WhatsApp también puede consultar la base: confirmar qué llave y qué tablas usan **antes** de la etapa 2. `07` deja `authenticated` con su propia fila y la carta, pero no cubre otros usos.
4. Revisar trazas de la API (solo lectura, sin datos de clientes) para buscar accesos anómalos con la llave pública; no afirmar incidentes sin evidencia.
5. `reporte-semanal`: el token fijo y su ruta en `vercel.json` se resuelven con la rotación de la rama de preparación.
6. Confirmar con Codex la compilación y la regresión visual de las pantallas tocadas (Gastos, Cocina).
