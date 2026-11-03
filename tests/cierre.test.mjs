import test from "node:test";
import assert from "node:assert/strict";
import { resumirVentasPagadas } from "../lib/cierre.ts";
import { ventaPuedeCobrarse, estaPagada } from "../lib/estados.ts";

const v = (o) => ({ total: 1000, metodo_pago: "Efectivo", estado: "pendiente", estado_pago: "pagado", ...o });

test("el estado de preparación/entrega no cambia el cierre de una venta pagada", () => {
  const base = resumirVentasPagadas([v({ estado: "pendiente" })]);
  for (const estado of ["pendiente", "en_proceso", "listo", "entregado"]) {
    assert.deepEqual(resumirVentasPagadas([v({ estado })]), base, estado);
  }
  assert.equal(base.total, 1000); assert.equal(base.cantidad, 1);
});

test("ventas sin pagar no entran al cierre (aunque estén listas o entregadas)", () => {
  const r = resumirVentasPagadas([v({ estado_pago: "pendiente", estado: "entregado" }), v({ estado_pago: "pendiente", estado: "listo", metodo_pago: "" })]);
  assert.equal(r.total, 0); assert.equal(r.cantidad, 0);
});

test("pasar de pendiente a entregado no quita la venta pagada del cierre", () => {
  const serie = ["pendiente", "en_proceso", "listo", "entregado"].map((estado) => resumirVentasPagadas([v({ estado }), v({ estado, total: 2500, metodo_pago: "Débito" })]).total);
  assert.deepEqual(serie, [3500, 3500, 3500, 3500]);
});

test("Point (Mercado Pago) se suma al total y a un grupo del cierre", () => {
  const r = resumirVentasPagadas([v({ metodo_pago: "Point", total: 7000, estado: "entregado" })]);
  assert.equal(r.total, 7000); assert.equal(r.qr, 7000);
});

test("métodos y pagos mixtos", () => {
  const r = resumirVentasPagadas([
    v({ metodo_pago: "Efectivo", total: 1000 }), v({ metodo_pago: "Débito", total: 2000 }),
    v({ metodo_pago: "Transferencia", total: 3000 }), v({ metodo_pago: "Mixto: Efectivo $1.000 + Débito $4.000", total: 5000 }),
  ]);
  assert.deepEqual([r.efectivo, r.debito, r.transferencia, r.total], [2000, 6000, 3000, 11000]);
});

test("ventaPuedeCobrarse / estaPagada", () => {
  for (const estado of ["pendiente", "en_proceso", "listo", "entregado"]) {
    assert.equal(ventaPuedeCobrarse({ estado, estado_pago: "pendiente" }), true);
    assert.equal(ventaPuedeCobrarse({ estado, estado_pago: "pagado" }), false);
    assert.equal(estaPagada({ estado, estado_pago: "pagado" }), true);
  }
});
