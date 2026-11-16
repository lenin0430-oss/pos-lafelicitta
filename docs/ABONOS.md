# Abonos (pago en partes)

**Estado:** rama `claude/abonos`. Nada aplicado en la base ni publicado en producción.

## Qué hace
- En Caja, al cobrar: «Pagar solo una parte (abono)» → monto, medio y cliente. La venta queda **abonada** (saldo por cobrar) y sale de Caja.
- Nueva pantalla **Por cobrar** (`/por-cobrar`): lista saldos, «Cobrar saldo» (con el medio que elijas) y «Abonar» más.
- El **cierre de turno** cuenta solo el dinero que entró ese turno: el abono en el turno del abono, el saldo en el turno en que se cobra.
- Una venta abonada **no bloquea** el cierre de turno.
- Al pagar el saldo, `ventas.metodo_pago` queda con el detalle completo (`Efectivo` o `Mixto: Efectivo $6.000 + Transferencia $6.000`).

## Cómo aplicarlo (en este orden)
1. Respaldo de la base (Supabase).
2. Ejecutar `supabase/11_abonos.sql` (una transacción; requiere 08 ya aplicada).
3. Publicar la rama (Vercel genera una vista previa antes de tocar producción).
4. Probar con una venta chica: abono, ver «Por cobrar», cobrar saldo, revisar el cierre de turno.
Reversión: `supabase/11_abonos_REVERSION.sql` (se detiene si ya hay abonos registrados, para no perder dinero cobrado).

## Pruebas hechas
- `scripts/prueba-caja/abonos.sql` en PostgreSQL 16 local con 08 + 07c + 04/04b: 30 comprobaciones OK (turno, medios, mixtos, cierre entre turnos, borrado, regresión del cobro normal).
- `tests/abonos.test.mjs`: 7 pruebas OK. `npm test` completo: las 3 fallas que quedan ya existían (faltan dependencias en este entorno).
- La pantalla (`app/page.tsx`, `app/por-cobrar/page.tsx`) NO pudo compilarse aquí (sin acceso a npm): solo se verificó la sintaxis. Falta `next build` / probar en la vista previa.

## Pendiente (no incluido)
- Reportes: los totales aún no separan «abonos cobrados» ni «saldo por cobrar»; la venta abonada solo muestra su etiqueta.
- Anular un abono mal digitado (hoy solo se corrige borrando la venta, como admin).
- Cobrar el saldo con pago mixto (hoy un solo medio por cobro de saldo; se pueden hacer varios abonos).
