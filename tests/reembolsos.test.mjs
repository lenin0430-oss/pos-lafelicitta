import test from "node:test";
import assert from "node:assert/strict";
import { validarGasto } from "../lib/reglasNegocio.ts";
import { pagarReembolso } from "../lib/gastosServidor.ts";

test("gasto pagado por un trabajador nunca sale de la caja", () => {
  const r = validarGasto({ categoria: "Insumos", descripcion: "tomates", monto: 5000, afecto_caja: true, pagado_por: "  Adriana   Cáceres " });
  assert.equal(r.ok, true);
  assert.equal(r.valor.afecto_caja, false);
  assert.equal(r.valor.pagado_por, "Adriana Cáceres");
});

test("gasto normal sigue igual", () => {
  const r = validarGasto({ categoria: "Insumos", descripcion: "x", monto: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.valor.afecto_caja, true);
  assert.equal(r.valor.pagado_por, null);
});

test("pagar devolución: solo admin y traduce errores", async () => {
  const db = (res) => ({ from: () => ({}), rpc: async () => ({ data: res, error: null }) });
  const g = await pagarReembolso(db({ ok: true }), { rol: "garzon", empresa_id: "e", nombre: "Caja" }, { persona: "Jesús" });
  assert.equal(g.status, 403);
  const s = await pagarReembolso(db({ ok: false, codigo: "sin_turno" }), { rol: "admin", empresa_id: "e", nombre: "Admin" }, { persona: "Jesús" });
  assert.equal(s.status, 409);
  const ok = await pagarReembolso(db({ ok: true, persona: "Jesús", monto: 3000 }), { rol: "admin", empresa_id: "e", nombre: "Admin" }, { persona: "Jesús" });
  assert.equal(ok.body.monto, 3000);
});
