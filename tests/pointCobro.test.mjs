import test from "node:test";
import assert from "node:assert/strict";
import { iniciarCobroPoint } from "../lib/pointCobro.ts";
import { crearFakes, entrada } from "./helpers-point.mjs";

const cobrar = (f, e = entrada()) => iniciarCobroPoint(f.pagos, f.mp, e);

test("dos solicitudes simultáneas -> UNA sola orden y la misma respuesta", async () => {
  for (let i = 0; i < 50; i++) { // repetido para variar el entrelazado
    const f = crearFakes();
    const [a, b] = await Promise.all([cobrar(f), cobrar(f)]);
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.orderId, b.orderId);
    assert.equal(f.ordenesEnMP(), 1, "Mercado Pago debe tener 1 orden");
    assert.equal(f.filas.length, 1);
  }
});

test("cinco solicitudes simultáneas -> una orden", async () => {
  const f = crearFakes();
  const r = await Promise.all([1, 2, 3, 4, 5].map(() => cobrar(f)));
  assert.equal(new Set(r.map((x) => x.orderId)).size, 1);
  assert.equal(f.ordenesEnMP(), 1);
});

test("CONTRASTE: 'mirar antes si existe' NO basta (duplica con solicitudes simultáneas)", async () => {
  const f = crearFakes();
  let n = 0;
  const ingenuo = async () => {
    const viva = f.filas.find((x) => ["created", "at_terminal"].includes(x.estado) && x.venta_id === "venta-1");
    if (viva) return viva.mp_order_id;
    const r = await f.mp.crearOrden({ clave: `aleatoria-${++n}`, referencia: "x", monto: 5000, terminalId: "T" }); // clave distinta por llamada
    f.filas.push({ id: `i${n}`, restaurante_id: "rest-A", venta_id: "venta-1", estado: "created", mp_order_id: r.orden.id });
    return r.orden.id;
  };
  await Promise.all([ingenuo(), ingenuo()]);
  assert.equal(f.ordenesEnMP(), 2, "el enfoque ingenuo crea dos cobros");
});

test("respuesta perdida: el reintento recupera la MISMA orden", async () => {
  const f = crearFakes({ perderRespuestaUnaVez: true });
  const a = await cobrar(f);
  assert.equal(a.ok, false); assert.equal(a.status, 503); assert.equal(a.reintentable, true);
  assert.equal(f.filas[0].estado, "reservado");
  assert.equal(f.ordenesEnMP(), 1, "MP sí creó la orden aunque se perdió la respuesta");
  const b = await cobrar(f);
  assert.equal(b.ok, true);
  assert.equal(f.ordenesEnMP(), 1, "el reintento no crea otra");
  assert.equal(f.filas[0].mp_order_id, b.orderId);
  assert.equal(f.filas.length, 1);
});

test("respuesta perdida + solicitud simultánea -> una sola orden", async () => {
  const f = crearFakes({ perderRespuestaUnaVez: true });
  const r = await Promise.all([cobrar(f), cobrar(f)]);
  const ok = r.filter((x) => x.ok);
  assert.ok(ok.length >= 1);
  assert.equal(f.ordenesEnMP(), 1);
  const c = await cobrar(f);
  assert.equal(c.ok, true);
  assert.equal(f.ordenesEnMP(), 1);
});

test("fallo al guardar pagos_point DESPUÉS de crear la orden externa -> se recupera sin duplicar", async () => {
  const f = crearFakes({ fallarGuardarUnaVez: true });
  const a = await cobrar(f);
  assert.equal(a.ok, false); assert.equal(a.status, 503); assert.equal(a.reintentable, true);
  assert.ok(a.orderId, "informa el orderId para conciliar");
  assert.equal(f.filas[0].mp_order_id, null);
  assert.equal(f.filas[0].estado, "reservado", "la reserva y su clave siguen guardadas");
  const b = await cobrar(f);
  assert.equal(b.ok, true);
  assert.equal(b.orderId, a.orderId);
  assert.equal(f.ordenesEnMP(), 1);
  assert.equal(f.filas[0].mp_order_id, a.orderId);
});

test("error definitivo de Mercado Pago (4xx) cierra el intento y permite uno nuevo", async () => {
  const f = crearFakes({ errorMP: { status: 409, code: "already_queued_order_on_terminal" } });
  const a = await cobrar(f);
  assert.equal(a.ok, false); assert.equal(a.status, 409);
  assert.match(a.error, /pendiente/);
  assert.equal(f.filas[0].estado, "failed");
  f.est.errorMP = null;
  const b = await cobrar(f);
  assert.equal(b.ok, true);
  assert.equal(f.filas.length, 2);
});

test("5xx de Mercado Pago es ambiguo: conserva la reserva", async () => {
  const f = crearFakes({ errorMP: { status: 503 } });
  const a = await cobrar(f);
  assert.equal(a.status, 503); assert.equal(a.reintentable, true);
  assert.equal(f.filas[0].estado, "reservado");
});

test("marcar preparado o entregado NO impide cobrar", async () => {
  for (const estado of ["pendiente", "en_proceso", "listo", "entregado"]) {
    const f = crearFakes();
    const r = await cobrar(f, entrada({ venta: { total: 5000, estado, estado_pago: "pendiente" } }));
    assert.equal(r.ok, true, `estado ${estado} debe poder cobrarse`);
  }
});

test("venta ya pagada: 409 y no llama a Mercado Pago", async () => {
  for (const estado of ["pendiente", "listo", "entregado"]) {
    const f = crearFakes();
    const r = await cobrar(f, entrada({ venta: { total: 5000, estado, estado_pago: "pagado" } }));
    assert.equal(r.ok, false); assert.equal(r.status, 409);
    assert.equal(f.est.llamadasMP, 0); assert.equal(f.filas.length, 0);
  }
});

test("total cambiado: 409 sin reservar", async () => {
  const f = crearFakes();
  const r = await cobrar(f, entrada({ monto: 4000 }));
  assert.equal(r.status, 409); assert.equal(f.filas.length, 0);
});

test("intento activo con otro monto: 409", async () => {
  const f = crearFakes({ perderRespuestaUnaVez: true });
  await cobrar(f); // queda reservado por 5000
  const r = await cobrar(f, entrada({ monto: 6000, venta: { total: 6000, estado: "pendiente", estado_pago: "pendiente" } }));
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.equal(f.ordenesEnMP(), 1);
});

test("negocios distintos con el mismo id de venta no se bloquean entre sí", async () => {
  const f = crearFakes();
  const [a, b] = await Promise.all([cobrar(f, entrada({ restauranteId: "rest-A" })), cobrar(f, entrada({ restauranteId: "rest-B" }))]);
  assert.notEqual(a.orderId, b.orderId);
  assert.equal(f.ordenesEnMP(), 2);
});
