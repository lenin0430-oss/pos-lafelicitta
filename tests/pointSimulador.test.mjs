// Orquestación REAL de cobro (lib/pointCobro.ts) contra el simulador HTTP: mismos escenarios que la prueba en navegador, sin cobros reales.
import test from "node:test";
import assert from "node:assert/strict";
import { iniciarCobroPoint } from "../lib/pointCobro.ts";
import { crearServidor } from "../scripts/simulador-point.mjs";
import { crearFakes, entrada } from "./helpers-point.mjs";

async function conSim(fn) {
  const s = crearServidor(); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const ctl = (ruta, b) => fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const estado = () => fetch(`${base}/__estado`).then((r) => r.json());
  // Mismo cuerpo y cabecera de idempotencia que app/api/point/cobrar/route.ts
  const mp = { async crearOrden({ clave, referencia, monto, terminalId }) {
    try {
      const r = await fetch(`${base}/v1/orders`, { method: "POST", headers: { authorization: "Bearer TEST-ficticio", "content-type": "application/json", "x-idempotency-key": clave },
        body: JSON.stringify({ type: "point", external_reference: referencia, expiration_time: "PT5M", transactions: { payments: [{ amount: String(monto) }] }, config: { point: { terminal_id: terminalId } } }) });
      const d = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, orden: { id: d.id, status: d.status } } : { ok: false, status: r.status, code: d?.errors?.[0]?.code };
    } catch { return { ok: false, status: 0 }; }
  } };
  try { await fn({ mp, ctl, estado, base }); } finally { s.closeAllConnections?.(); s.close(); }
}

test("aprobado: una orden, una fila, luego el webhook la deja processed", async () => conSim(async ({ mp, ctl, estado }) => {
  const f = crearFakes(); const r = await iniciarCobroPoint(f.pagos, mp, entrada());
  assert.equal(r.ok, true); assert.equal(f.filas.length, 1); assert.equal((await estado()).total_ordenes, 1);
  await ctl(`/__orden/${r.orderId}`, { estado: "processed" }); assert.equal((await estado()).ordenes[0].status, "processed");
}));

test("rechazo / cancelación / expiración: el intento termina y el reintento crea un intento NUEVO con otra clave", async () => conSim(async ({ mp, ctl, estado }) => {
  const f = crearFakes();
  for (const fin of ["failed", "canceled", "expired"]) {
    const r = await iniciarCobroPoint(f.pagos, mp, entrada()); assert.equal(r.ok, true);
    await ctl(`/__orden/${r.orderId}`, { estado: fin });
    f.filas.find((x) => x.mp_order_id === r.orderId).estado = fin;           // lo que hace el webhook/estado
  }
  assert.equal(f.filas.length, 3); assert.equal(new Set(f.filas.map((x) => x.clave_idempotencia)).size, 3);
  assert.equal((await estado()).total_ordenes, 3);
}));

test("respuesta perdida: 503 reintentable, la orden existe una sola vez y el reintento la recupera (misma clave)", async () => conSim(async ({ mp, ctl, estado }) => {
  const f = crearFakes(); await ctl("/__proxima", { escenario: "perder_respuesta" });
  const a = await iniciarCobroPoint(f.pagos, mp, entrada());
  assert.equal(a.ok, false); assert.equal(a.status, 503); assert.equal(a.reintentable, true);
  assert.equal(f.filas[0].estado, "reservado"); assert.equal(f.filas[0].mp_order_id, null); assert.equal((await estado()).total_ordenes, 1);
  const b = await iniciarCobroPoint(f.pagos, mp, entrada());
  assert.equal(b.ok, true); assert.equal(b.orderId, "ORD-SIM-0001"); assert.equal(f.filas.length, 1); assert.equal((await estado()).total_ordenes, 1);
}));

test("error 500 sin crear: 503 reintentable; el reintento crea exactamente una orden", async () => conSim(async ({ mp, ctl, estado }) => {
  const f = crearFakes(); await ctl("/__proxima", { escenario: "error_500" });
  const a = await iniciarCobroPoint(f.pagos, mp, entrada()); assert.equal(a.status, 503); assert.equal((await estado()).total_ordenes, 0);
  const b = await iniciarCobroPoint(f.pagos, mp, entrada()); assert.equal(b.ok, true); assert.equal(f.filas.length, 1); assert.equal((await estado()).total_ordenes, 1);
}));

test("máquina con cobro pendiente (409): se cierra el intento como failed con motivo y luego se puede reintentar", async () => conSim(async ({ mp, ctl }) => {
  const f = crearFakes(); await ctl("/__proxima", { escenario: "cola_ocupada" });
  const a = await iniciarCobroPoint(f.pagos, mp, entrada());
  assert.equal(a.ok, false); assert.equal(a.status, 409); assert.match(a.error, /máquina tiene un cobro pendiente/);
  assert.equal(f.filas[0].estado, "failed"); assert.match(f.filas[0].detalle, /already_queued_order_on_terminal/);
  const b = await iniciarCobroPoint(f.pagos, mp, entrada()); assert.equal(b.ok, true); assert.equal(f.filas.length, 2);
}));

test("doble clic / dos pestañas a la vez: una sola orden y todas reciben la misma", async () => conSim(async ({ mp, estado }) => {
  const f = crearFakes(); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => iniciarCobroPoint(f.pagos, mp, entrada())));
  assert.ok(rs.every((r) => r.ok && r.orderId === rs[0].orderId)); assert.equal((await estado()).total_ordenes, 1); assert.equal(f.filas.length, 1);
}));

test("venta ya cobrada o total distinto: se rechaza antes de hablar con Point", async () => conSim(async ({ mp, estado }) => {
  const f = crearFakes();
  const a = await iniciarCobroPoint(f.pagos, mp, entrada({ venta: { total: 5000, estado: "listo", estado_pago: "pagado" } }));
  const b = await iniciarCobroPoint(f.pagos, mp, entrada({ monto: 4000 }));
  assert.equal(a.status, 409); assert.equal(b.status, 409); assert.equal((await estado()).total_ordenes, 0); assert.equal(f.filas.length, 0);
}));
