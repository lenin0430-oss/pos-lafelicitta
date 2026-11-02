import test from "node:test";
import assert from "node:assert/strict";
import { cobrosDelPeriodo, resumenPeriodo, etiquetaMetodo } from "../lib/reportes.ts";
import { resumirCobros } from "../lib/cierre.ts";
import { visibleEnCocina, antiguedad } from "../lib/cocina.ts";
import { estadoPagoParaMetodo, ventaPuedeCobrarse, estaPagada } from "../lib/estados.ts";
import { cronAutorizado, autorizarCierreWhatsapp } from "../lib/seguridadBot.ts";

const v = (id, total, o = {}) => ({ id, total, metodo_pago: "Efectivo", estado: "pendiente", estado_pago: "pagado", created_at: "2026-11-01T10:00:00Z", pagado_at: null, ...o });
const T1 = "2026-11-01T00:00:00Z", T2 = "2026-11-02T00:00:00Z", T3 = "2026-11-03T00:00:00Z";

test("cierre: venta creada en un turno y cobrada en el siguiente cuenta en el siguiente, una sola vez", () => {
  const venta = v("a", 5000, { created_at: "2026-11-01T22:00:00Z", pagado_at: "2026-11-02T01:00:00Z" });
  assert.equal(resumirCobros([venta], T1, T2).total, 0);
  assert.equal(resumirCobros([venta], T1, T2).cantidad, 0);
  assert.equal(resumirCobros([venta], T2, T3).total, 5000);
  assert.equal(resumirCobros([venta, venta], T2, T3).cantidad, 1, "duplicados por id");
});
test("cierre: intervalo semiabierto [desde,hasta)", () => {
  const en = v("b", 1000, { pagado_at: T2 });
  assert.equal(resumirCobros([en], T1, T2).cantidad, 0);
  assert.equal(resumirCobros([en], T2, T3).cantidad, 1);
});
test("cierre: pendiente, cortesía y sin identificar no suman; histórico sin pagado_at usa created_at", () => {
  const r = resumirCobros([v("c", 100, { estado_pago: "pendiente" }), v("d", 100, { estado_pago: "cortesia" }), v("e", 100, { estado_pago: "sin_identificar", metodo_pago: "" }), v("f", 700, { created_at: "2026-11-01T12:00:00Z" })], T1);
  assert.equal(r.total, 700); assert.equal(r.efectivo, 700);
});
test("cierre: estado de cocina no influye", () => {
  for (const e of ["pendiente", "en_proceso", "listo", "entregado"]) assert.equal(resumirCobros([v("g", 900, { estado: e })], T1).total, 900);
});
test("reportes: registradas, cobrado y pendiente separados; cobro de venta anterior entra como cobrado", () => {
  const creadas = [v("1", 1000, { created_at: "2026-11-02T10:00:00Z", pagado_at: "2026-11-02T10:05:00Z" }),
    v("2", 2000, { created_at: "2026-11-02T11:00:00Z", estado_pago: "pendiente", metodo_pago: "" }),
    v("3", 3000, { created_at: "2026-11-02T12:00:00Z", estado_pago: "sin_identificar", metodo_pago: "" }),
    v("4", 400, { created_at: "2026-11-02T13:00:00Z", estado_pago: "cortesia", metodo_pago: "Cortesía" })];
  const antiguo = v("9", 5000, { created_at: "2026-10-30T10:00:00Z", pagado_at: "2026-11-02T15:00:00Z" });
  const r = resumenPeriodo(creadas, [antiguo, creadas[0]], T2, T3);
  assert.deepEqual(r.registradas, { cantidad: 4, total: 6400 });
  assert.deepEqual(r.cobrado, { cantidad: 2, total: 6000 });
  assert.deepEqual(r.pendiente, { cantidad: 1, total: 2000 });
  assert.deepEqual(r.sinIdentificar, { cantidad: 1, total: 3000 });
  assert.deepEqual(r.cortesias, { cantidad: 1, total: 400 });
});
test("etiqueta: sin identificar", () => {
  assert.equal(etiquetaMetodo(v("x", 1, { estado_pago: "sin_identificar", metodo_pago: "" })), "Sin identificar");
  assert.equal(etiquetaMetodo(v("y", 1)), "Efectivo");
});
test("cocina: visible hasta 'entregado', sin importar pago ni antigüedad; la antigua solo se etiqueta", () => {
  for (const e of ["pendiente", "en_proceso", "listo"]) assert.ok(visibleEnCocina({ estado: e }));
  assert.ok(!visibleEnCocina({ estado: "entregado" }));
  const a = antiguedad("2026-11-01T00:00:00Z", Date.parse("2026-11-02T00:00:00Z"));
  assert.ok(a.antigua); assert.equal(a.horas, 24);
  assert.ok(!antiguedad("2026-11-01T20:00:00Z", Date.parse("2026-11-02T00:00:00Z")).antigua);
});
test("estados: cobrar solo con pendiente; cortesía no es cobro", () => {
  assert.ok(ventaPuedeCobrarse({ estado_pago: "pendiente" })); assert.ok(ventaPuedeCobrarse({}));
  for (const e of ["pagado", "cortesia", "sin_identificar"]) assert.ok(!ventaPuedeCobrarse({ estado_pago: e }));
  assert.equal(estadoPagoParaMetodo("Cortesía"), "cortesia"); assert.equal(estadoPagoParaMetodo("Efectivo"), "pagado");
  assert.ok(estaPagada({ estado_pago: "pagado" })); assert.ok(!estaPagada({ estado_pago: "cortesia" }));
});
const S = (o = {}) => ({ empresa_id: "E1", rol: "admin", ...o });
const cfg = { empresaPermitida: "E1", botConfigurado: true };
test("cron: solo Bearer exacto con secreto largo", () => {
  const s = "x".repeat(32);
  assert.ok(cronAutorizado(`Bearer ${s}`, s));
  assert.ok(!cronAutorizado(`Bearer ${s}x`, s)); assert.ok(!cronAutorizado(null, s));
  assert.ok(!cronAutorizado("Bearer corto", "corto")); assert.ok(!cronAutorizado(`Bearer ${s}`, undefined));
});
test("cierre-whatsapp: 401 sin sesión, 503 sin configurar, 403 otra empresa o rol, 400 cuerpo inválido", () => {
  assert.equal(autorizarCierreWhatsapp(null, {}, cfg).status, 401);
  assert.equal(autorizarCierreWhatsapp(S(), {}, { botConfigurado: false, empresaPermitida: "E1" }).status, 503);
  assert.equal(autorizarCierreWhatsapp(S({ empresa_id: "OTRA" }), {}, cfg).status, 403);
  assert.equal(autorizarCierreWhatsapp(S({ rol: "cocina" }), {}, cfg).status, 403);
  assert.equal(autorizarCierreWhatsapp(S(), "texto", cfg).status, 400);
});
test("cierre-whatsapp: whitelist descarta mensaje_custom y reporte_semanal; conserva formas reales", () => {
  const r = autorizarCierreWhatsapp(S({ rol: "garzon" }), { turno: 2, cajero: "Ana", mensaje_custom: "spam", reporte_semanal: true, evil: 1,
    gastos_turno: [{ categoria: "Gas", monto: 1000 }], propinas_por_empleado: [{ empleado: "Luis", monto: 500 }] }, cfg);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.payload).sort(), ["cajero", "gastos_turno", "propinas_por_empleado", "turno"]);
  assert.deepEqual(r.payload.gastos_turno, [{ categoria: "Gas", monto: 1000 }]);
});
