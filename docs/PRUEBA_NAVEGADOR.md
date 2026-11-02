# Comprobación en navegador y siguiente paso de publicación (NO ejecutada)

Base: rama `claude/preparacion-2026-11-02` en `2e1819f` (Next 15.5.28, React 18). El cambio mayor de Next exige regresión visual/funcional **antes** de publicar. Todo en una **vista previa aislada con base de pruebas**; nunca contra la base productiva ni con cobros reales.

## Entorno de prueba (a preparar; requiere tu aprobación)
1. Proyecto Supabase **de pruebas nuevo** (no `xlzbqgvmwbskpfajehgi`; `mesapos-piloto-chile` está inactivo: no usarlo sin autorización) con el esquema actual + `01`…`04`, `03` y datos ficticios (negocio, usuarios admin/garzón/cocina, 15 productos, ventas de ejemplo incluidas `listo` con y sin método, una cortesía).
2. Proyecto Vercel de vista previa con variables **de prueba**: Supabase de pruebas, `SESSION_SECRET`, `CRON_SECRET`, `BOT_SECRET`, `BOT_URL` (apuntando a un receptor falso, no al bot real), `BOT_EMPRESA_ID`. Sin credenciales de Mercado Pago reales; Point queda fuera (ver abajo).
3. Alternativa local: `npm run dev` en Windows con `.env.local` de pruebas.

## Lista de comprobación (marcar al ejecutar)
**Arranque / Next 15:** inicia sesión por rol; rutas sin error 500 en consola; recarga conserva sesión; `/api/mp/callback` responde sin 500 con `state` inválido (usa `await cookies()`).
**Comanda y cocina:** crear comanda de mesa → aparece en cocina; pasar a en proceso y listo; **cobrar manual no la retira**; "Entregado" sí la retira; una comanda de >12 h sin entregar sigue visible con "Antigua · N h".
**Cobro manual:** efectivo, débito, transferencia, mixto → `estado_pago='pagado'` y `pagado_at`; Cortesía → `cortesia` y no suma al cierre; intentar cobrar dos veces no duplica.
**Cierre:** el turno suma solo cobros con fecha en el turno; una venta creada en el turno A y cobrada en B cuenta en B una sola vez; marcar entregado no la quita; el envío a WhatsApp sin sesión → 401 (probar con curl), con otra empresa → 403, con receptor falso → recibe solo campos permitidos.
**Reportes:** tres cifras (registradas / cobros recibidos / saldo pendiente) más "Sin identificar" y cortesías; las ventas históricas sin método aparecen como "Sin identificar"; método por pagos suma cobros; CSV con columnas de estado de cocina y de pago; "Editar pago" sobre una "Sin identificar" fija su estado de pago.
**Productos:** editar precio y activar/desactivar funciona; el menú del POS refleja el cambio.
**Responsive:** móvil (comanda/cocina/cobro) sin desbordes.
**Point (solo simulado):** sin cuenta MP conectada, `/api/point/cobrar` responde 400 "Conecta Mercado Pago"; con la base sin migración 03/04 responde 503 "Falta aplicar la migración…" sin llamar a MP. El cobro real con terminal se prueba **después**, con tu autorización, monto bajo y mesa PRUEBA.
**Consola/red:** sin errores de hidratación ni advertencias de `cookies()`/`headers()` sin await.

## Siguiente paso de publicación (cuando apruebes cada punto)
1. Aprobar: este plan, `docs/PLAN_PUBLICACION.md`, criterio del histórico, lista de menú, corte de `06`.
2. Montar el entorno de prueba y ejecutar la lista de arriba; archivar capturas y resultado.
3. Ensayo completo en la base de pruebas: `03` → verificar → `06` → `04` → `05` → verificar y reversión.
4. Producción, fuera de horario y con cierre hecho: respaldo → `03` → verificación → `06` → `04` → `05` (si se aprobó) → desplegar `main` actualizado → pruebas de humo → rotación coordinada del secreto del bot (**sigue pendiente**).
5. Reversión según `docs/PLAN_PUBLICACION.md` (rollback Vercel a `dpl_Dbn1AG…` sigue disponible; ojo: Next 15 y 14 comparten base, no hay datos propios de Next que revertir).

## Límites conocidos
Auditoría limpia no certifica seguridad total. No se ha ejecutado OAuth con cuenta real ni prueba física Point con Next 15.
