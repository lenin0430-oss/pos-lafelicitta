import test from "node:test";
import assert from "node:assert/strict";
import { resumirCobros, resumirVentasPagadas } from "../lib/cierre.ts";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1"; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "ficticia";
process.env.CRON_SECRET = "cron-ficticio-".padEnd(32, "c"); process.env.MP_WEBHOOK_SECRET = "webhook-ficticio-".padEnd(32, "w");
const { marcarVentaPagadaPoint } = await import("../lib/mp.ts");

// ---- cierre conciliado por método y turno ----
const T1 = ["2026-11-02T12:00:00Z", "2026-11-02T18:00:00Z"], T2 = ["2026-11-02T18:00:00Z", "2026-11-03T02:00:00Z"];
const V = (id, total, metodo, pagado_at, created_at, estado_pago = "pagado", estado = "entregado") => ({ id, total, metodo_pago: metodo, pagado_at, created_at, estado_pago, estado });
const ventas = [
  V("a", 5000, "Efectivo", "2026-11-02T13:00:00Z", "2026-11-02T12:50:00Z"),
  V("b", 7000, "Débito", "2026-11-02T14:00:00Z", "2026-11-02T13:30:00Z"),
  V("c", 9000, "Point", "2026-11-02T17:59:59Z", "2026-11-02T17:00:00Z"),
  V("d", 6000, "Transferencia", "2026-11-02T19:00:00Z", "2026-11-02T18:30:00Z"),
  V("e", 5000, "Mixto: Efectivo $2.000 + Débito $3.000", "2026-11-02T20:00:00Z", "2026-11-02T19:30:00Z"),
  V("f", 4000, "Efectivo", "2026-11-02T18:00:00Z", "2026-11-02T17:30:00Z"),               // creada en T1, cobrada justo al inicio de T2
  V("g", 3000, "Cortesía", "2026-11-02T20:00:00Z", "2026-11-02T19:00:00Z", "cortesia"),
  V("h", 8000, "", null, "2026-11-02T15:00:00Z", "sin_identificar"),
  V("i", 2500, "", null, "2026-11-02T16:00:00Z", "pendiente", "listo"),
];
const suma = (r) => r.efectivo + r.debito + r.qr + r.transferencia;
test("cada turno cuadra: total = efectivo + débito + Point/QR + transferencia", () => {
  for (const t of [T1, T2]) { const r = resumirCobros(ventas, t[0], t[1]); assert.equal(r.total, suma(r), t[0]); }
});
test("turno 1 y turno 2 no duplican ni omiten cobros; el cobro en el límite cuenta en el turno siguiente", () => {
  const r1 = resumirCobros(ventas, T1[0], T1[1]), r2 = resumirCobros(ventas, T2[0], T2[1]);
  assert.deepEqual([r1.efectivo, r1.debito, r1.qr, r1.transferencia], [5000, 7000, 9000, 0]);
  assert.deepEqual([r2.efectivo, r2.debito, r2.qr, r2.transferencia], [4000 + 2000, 3000, 0, 6000]);
  const todo = resumirVentasPagadas(ventas);
  assert.equal(r1.total + r2.total, todo.total); assert.equal(r1.cantidad + r2.cantidad, todo.cantidad);
});
test("cortesía, sin identificar y pendiente no entran al cierre", () => {
  const r = resumirCobros(ventas, T1[0], T2[1]);
  assert.equal(r.total, 5000 + 7000 + 9000 + 6000 + 5000 + 4000);
});

// ---- webhook: notificaciones repetidas ----
function dbFalsa(estadoInicial) {
  const fila = { ...estadoInicial }; let escrituras = 0;
  const q = { _f: [], update(v) { this._v = v; return this; }, eq(c, x) { this._f.push(["eq", c, x]); return this; }, neq(c, x) { this._f.push(["neq", c, x]); return this; },
    then(res) { const ok = this._f.every(([op, c, x]) => (op === "eq" ? fila[c] === x : fila[c] !== x)); if (ok) { Object.assign(fila, this._v); escrituras++; } this._f = []; res({ error: null }); } };
  return { db: { from: () => q }, fila, escrituras: () => escrituras };
}
test("webhook repetido: la venta se marca pagada una sola vez y no cambia la cocina", async () => {
  const f = dbFalsa({ empresa_id: "E1", id: "V1", estado: "en_proceso", estado_pago: "pendiente", pagado_at: null, metodo_pago: null });
  await marcarVentaPagadaPoint(f.db, "V1", "E1"); const primera = { ...f.fila };
  for (let i = 0; i < 4; i++) await marcarVentaPagadaPoint(f.db, "V1", "E1");
  assert.equal(f.escrituras(), 1); assert.equal(f.fila.pagado_at, primera.pagado_at);
  assert.equal(f.fila.estado, "en_proceso"); assert.equal(f.fila.estado_pago, "pagado"); assert.equal(f.fila.metodo_pago, "Point");
});
test("webhook de otro negocio no marca la venta", async () => {
  const f = dbFalsa({ empresa_id: "E1", id: "V1", estado: "listo", estado_pago: "pendiente" });
  await marcarVentaPagadaPoint(f.db, "V1", "E2"); assert.equal(f.fila.estado_pago, "pendiente");
});
test("webhook con firma inválida o ausente responde 401 y no consulta nada", async () => {
  const { POST } = await import("../app/api/point/webhook/route.ts");
  for (const h of [{}, { "x-signature": "ts=1,v1=00", "x-request-id": "r" }]) {
    const r = await POST(new Request("http://pos.local/api/point/webhook?data.id=ORD1", { method: "POST", headers: h, body: "{}" }));
    assert.equal(r.status, 401);
  }
});
test("cron semanal: sin Bearer correcto responde 401", async () => {
  const { GET } = await import("../app/api/reporte-semanal/route.ts");
  for (const h of [{}, { authorization: "Bearer incorrecto" }, { authorization: "Bearer " + "x".repeat(32) }]) {
    assert.equal((await GET(new Request("http://pos.local/api/reporte-semanal", { headers: h }))).status, 401);
  }
});
