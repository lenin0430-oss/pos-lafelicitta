import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { crearServidor } from "../scripts/simulador-point.mjs";

async function conSim(fn) {
  const s = crearServidor(); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const H = (clave) => ({ authorization: "Bearer TEST-token", "content-type": "application/json", "x-idempotency-key": clave });
  const crear = (clave, monto = "5000") => fetch(`${base}/v1/orders`, { method: "POST", headers: H(clave), body: JSON.stringify({ external_reference: "venta_x", transactions: { payments: [{ amount: monto }] }, config: { point: { terminal_id: "T" } } }) });
  const ctl = (ruta, b) => fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  try { await fn({ base, crear, ctl, H }); } finally { s.closeAllConnections?.(); s.close(); }
}

test("rechaza tokens que no sean TEST- (nunca habla con cuentas reales)", async () => conSim(async ({ base }) => {
  const r = await fetch(`${base}/v1/orders`, { method: "POST", headers: { authorization: "Bearer APP_USR-123", "x-idempotency-key": "k" }, body: "{}" });
  assert.equal(r.status, 401);
}));
test("idempotencia: la misma clave devuelve la misma orden; otra clave crea otra", async () => conSim(async ({ base, crear }) => {
  const a = await (await crear("clave-1")).json(), b = await (await crear("clave-1")).json(), c = await (await crear("clave-2")).json();
  assert.equal(a.id, b.id); assert.notEqual(a.id, c.id);
  assert.equal((await (await fetch(`${base}/__estado`)).json()).total_ordenes, 2);
}));
test("respuesta perdida: la orden existe, el cliente ve el corte y el reintento con la misma clave la recupera sin duplicar", async () => conSim(async ({ base, crear, ctl }) => {
  await ctl("/__proxima", { escenario: "perder_respuesta" });
  await assert.rejects(crear("clave-p"));
  assert.equal((await (await fetch(`${base}/__estado`)).json()).total_ordenes, 1);
  const r = await (await crear("clave-p")).json();
  assert.equal(r.id, "ORD-SIM-0001"); assert.equal((await (await fetch(`${base}/__estado`)).json()).total_ordenes, 1);
}));
test("error 500 NO crea orden; el reintento sí crea una", async () => conSim(async ({ base, crear, ctl }) => {
  await ctl("/__proxima", { escenario: "error_500" });
  assert.equal((await crear("clave-e")).status, 500);
  assert.equal((await (await fetch(`${base}/__estado`)).json()).total_ordenes, 0);
  assert.equal((await crear("clave-e")).status, 201);
}));
test("cola ocupada devuelve 409 already_queued_order_on_terminal sin crear", async () => conSim(async ({ base, crear, ctl }) => {
  await ctl("/__proxima", { escenario: "cola_ocupada" });
  const r = await crear("clave-c"); assert.equal(r.status, 409); assert.equal((await r.json()).errors[0].code, "already_queued_order_on_terminal");
}));
test("estados: rechazo, cancelación y expiración son finales y consultables", async () => conSim(async ({ base, crear, ctl, H }) => {
  for (const [i, fin] of [["a", "failed"], ["b", "canceled"], ["c", "expired"], ["d", "processed"]]) {
    const o = await (await crear(`k-${i}`)).json();
    assert.equal((await ctl(`/__orden/${o.id}`, { estado: "at_terminal" })).status, 200);
    assert.equal((await ctl(`/__orden/${o.id}`, { estado: fin })).status, 200);
    assert.equal((await ctl(`/__orden/${o.id}`, { estado: fin === "processed" ? "failed" : "processed" })).status, 409, "un estado final no cambia");
    assert.equal((await (await fetch(`${base}/v1/orders/${o.id}`, { headers: H("x") })).json()).status, fin);
  }
}));
test("el webhook sale firmado con el mismo algoritmo que valida app/api/point/webhook (y se puede forzar una firma inválida)", async () => conSim(async ({ ctl }) => {
  const recibido = [];
  const pos = http.createServer((req, res) => { recibido.push({ url: req.url, h: req.headers }); res.writeHead(200); res.end("{}"); });
  await new Promise((r) => pos.listen(0, "127.0.0.1", r));
  const posUrl = `http://127.0.0.1:${pos.address().port}`;
  try {
    assert.equal((await ctl("/__webhook", { orderId: "ORD-SIM-0001", posUrl, secreto: "secreto-de-prueba" })).status, 200);
    const { h, url } = recibido[0]; const p = Object.fromEntries(h["x-signature"].split(",").map((x) => x.split("=", 2)));
    const esperado = createHmac("sha256", "secreto-de-prueba").update(`id:ord-sim-0001;request-id:${h["x-request-id"]};ts:${p.ts};`).digest("hex");
    assert.equal(p.v1, esperado); assert.match(url, /data\.id=ORD-SIM-0001/);
    await ctl("/__webhook", { orderId: "ORD-SIM-0001", posUrl, secreto: "secreto-de-prueba", firmaInvalida: true });
    assert.notEqual(Object.fromEntries(recibido[1].h["x-signature"].split(",").map((x) => x.split("=", 2))).v1, esperado);
  } finally { pos.close(); }
}));
