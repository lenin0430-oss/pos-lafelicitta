// Ejecutar: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { ordenPointReutilizable } from "../lib/pointGuard.ts";

const ahora = Date.parse("2026-11-02T12:00:00Z");
const hace = (s) => new Date(ahora - s * 1000).toISOString();
const p = (o) => ({ mp_order_id: "ORD1", monto: 5000, estado: "created", created_at: hace(30), ...o });

test("reutiliza orden viva con mismo monto", () => {
  assert.equal(ordenPointReutilizable([p()], 5000, ahora)?.mp_order_id, "ORD1");
  assert.equal(ordenPointReutilizable([p({ estado: "at_terminal" })], 5000, ahora)?.mp_order_id, "ORD1");
});
test("no reutiliza si el monto cambió", () => {
  assert.equal(ordenPointReutilizable([p()], 6000, ahora), null);
});
test("no reutiliza estados finales", () => {
  for (const estado of ["processed", "canceled", "expired", "failed"])
    assert.equal(ordenPointReutilizable([p({ estado })], 5000, ahora), null, estado);
});
test("no reutiliza si pasaron 5 minutos", () => {
  assert.equal(ordenPointReutilizable([p({ created_at: hace(301) })], 5000, ahora), null);
  assert.equal(ordenPointReutilizable([p({ created_at: hace(299) })], 5000, ahora)?.mp_order_id, "ORD1");
});
test("ignora filas sin order id o con fecha inválida", () => {
  assert.equal(ordenPointReutilizable([p({ mp_order_id: null })], 5000, ahora), null);
  assert.equal(ordenPointReutilizable([p({ created_at: "x" })], 5000, ahora), null);
});
test("elige la más reciente", () => {
  const r = ordenPointReutilizable([p({ mp_order_id: "A", created_at: hace(100) }), p({ mp_order_id: "B", created_at: hace(10) })], 5000, ahora);
  assert.equal(r?.mp_order_id, "B");
});
test("lista vacía", () => assert.equal(ordenPointReutilizable([], 5000, ahora), null));
