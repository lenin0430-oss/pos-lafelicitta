import test from "node:test";
import assert from "node:assert/strict";
import { accionAbono, listarPorCobrar, limpiarCliente } from "../lib/abonosServidor.ts";
import { estaAbonada, ventaPuedeCobrarse, estaPagada } from "../lib/estados.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a", OTRA = "bbbbbbbb-0000-4000-8000-00000000000b";
const V = "11111111-1111-4111-8111-111111111111";
const ses = { rol: "garzon", empresa_id: EMP, nombre: "Caja" };

function dbFalsa(respuesta = { data: { ok: true } }) {
  const llamadas = [];
  return { llamadas, from: () => { throw new Error("no debe leer tablas"); }, rpc: async (fn, args) => (llamadas.push([fn, args]), respuesta) };
}

test("abonar: el negocio y el autor salen de la sesión, no del cuerpo", async () => {
  const db = dbFalsa();
  const r = await accionAbono(db, ses, { accion: "abonar", venta_id: V, monto: 6000, medio: "efectivo", cliente: "  Ana \n 0412 ", empresa_id: OTRA, p_por: "otro" });
  assert.equal(r.status, 200);
  assert.deepEqual(db.llamadas, [["registrar_abono", { p_empresa: EMP, p_venta: V, p_monto: 6000, p_medio: "efectivo", p_cliente: "Ana 0412", p_por: "Caja" }]]);
});

test("cobrar_saldo: solo manda venta y medio", async () => {
  const db = dbFalsa();
  await accionAbono(db, ses, { accion: "cobrar_saldo", venta_id: V, medio: "transferencia", monto: 1 });
  assert.deepEqual(db.llamadas, [["cobrar_saldo", { p_empresa: EMP, p_venta: V, p_medio: "transferencia", p_por: "Caja" }]]);
});

test("validación: monto, medio, venta y acción inválidos NO llegan a la base", async () => {
  const db = dbFalsa();
  const malos = [
    { accion: "abonar", venta_id: V, monto: 0, medio: "efectivo" }, { accion: "abonar", venta_id: V, monto: -5, medio: "efectivo" },
    { accion: "abonar", venta_id: V, monto: 10.5, medio: "efectivo" }, { accion: "abonar", venta_id: V, monto: "6000", medio: "efectivo" },
    { accion: "abonar", venta_id: V, monto: 99_000_000, medio: "efectivo" }, { accion: "abonar", venta_id: V, monto: 100 },
    { accion: "abonar", venta_id: V, monto: 100, medio: "point" }, { accion: "abonar", venta_id: V, monto: 100, medio: "cortesia" },
    { accion: "abonar", venta_id: V, monto: 100, medio: "Mixto" }, { accion: "abonar", venta_id: "no-uuid", monto: 100, medio: "efectivo" },
    { accion: "cobrar_saldo", venta_id: V, medio: "qr" }, { accion: "borrar", venta_id: V, medio: "efectivo" }, null, [], "x",
  ];
  for (const b of malos) assert.equal((await accionAbono(db, ses, b)).status, 400, JSON.stringify(b));
  assert.equal(db.llamadas.length, 0);
});

test("códigos de la base → mensajes y estados HTTP", async () => {
  const casos = [["sin_turno", 409, /turno abierto/], ["abono_cubre_todo", 409, /Cobrar saldo/], ["ya_cobrada", 409, /cobrada/], ["venta_no_encontrada", 404, /no encontrada/],
    ["no_abonada", 409, /saldo/], ["point_en_curso", 409, /Point/], ["codigo_nuevo", 400, /rechazada/]];
  for (const [codigo, st, re] of casos) {
    const r = await accionAbono(dbFalsa({ data: { ok: false, codigo, saldo: 6000 } }), ses, { accion: "abonar", venta_id: V, monto: 100, medio: "efectivo" });
    assert.equal(r.status, st, codigo); assert.match(String(r.body.error), re, codigo); assert.equal(r.body.codigo, codigo);
  }
  assert.equal((await accionAbono(dbFalsa({ error: { message: "x" } }), ses, { accion: "abonar", venta_id: V, monto: 100, medio: "efectivo" })).status, 500);
});

test("cliente: texto corto sin caracteres de control", () => {
  assert.equal(limpiarCliente("  María\t\n José "), "María José");
  assert.equal(limpiarCliente(""), null); assert.equal(limpiarCliente(123), null); assert.equal(limpiarCliente("x".repeat(200)).length, 80);
});

function dbLectura({ ventas, abonos }) {
  const filtros = {};
  const mk = (tabla, filas) => { const q = { select: () => q, eq: (c, v) => ((filtros[tabla] ??= []).push([c, v]), q), is: () => q, in: () => q, order: () => q, limit: async () => ({ data: filas }) };
    q.order = () => q; q.then = undefined; return q; };
  return { filtros, from: (t) => { const q = mk(t, t === "ventas" ? ventas : abonos); if (t === "abonos") { q.order = async () => ({ data: abonos }); } return q; } };
}

test("listar por cobrar: saldo = total − abonos, filtra por el negocio de la sesión", async () => {
  const db = dbLectura({
    ventas: [{ id: V, numero: 7, mesa: "Pan de jamón", total: 12000, created_at: "2026-11-16T15:00:00Z" }, { id: "22222222-2222-4222-8222-222222222222", numero: 8, mesa: "Pasapalos", total: 50000, created_at: "2026-11-16T16:00:00Z" }],
    abonos: [{ venta_id: V, monto: 6000, medio: "efectivo", cliente: "Ana", created_at: "2026-11-16T15:01:00Z" }, { venta_id: "22222222-2222-4222-8222-222222222222", monto: 10000, medio: "transferencia", cliente: null, created_at: "2026-11-16T16:01:00Z" }, { venta_id: "22222222-2222-4222-8222-222222222222", monto: 5000, medio: "efectivo", cliente: "Luis", created_at: "2026-11-16T16:30:00Z" }],
  });
  const r = await listarPorCobrar(db, ses);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ventas.map((x) => [x.numero, x.abonado, x.saldo, x.cliente]), [[7, 6000, 6000, "Ana"], [8, 15000, 35000, "Luis"]]);
  assert.deepEqual(db.filtros.ventas, [["empresa_id", EMP], ["estado_pago", "abonada"]]);
  assert.ok(db.filtros.abonos.some(([c, v]) => c === "empresa_id" && v === EMP));
});

test("estados: una venta abonada no se cobra por el camino normal ni cuenta como pagada", () => {
  assert.equal(estaAbonada({ estado_pago: "abonada" }), true);
  assert.equal(ventaPuedeCobrarse({ estado_pago: "abonada" }), false);
  assert.equal(estaPagada({ estado_pago: "abonada" }), false);
});

import { componerCliente, separarCliente } from "../lib/clienteAbono.ts";
import { etiquetaMetodo } from "../lib/reportes.ts";

test("cliente: nombre y teléfono se componen y se separan sin perder nada", () => {
  assert.equal(componerCliente("  Luna ", "0412-555 1234"), "Luna · 0412-555 1234");
  assert.equal(componerCliente("Luna", ""), "Luna");
  assert.equal(componerCliente("", "912345678"), "912345678");
  assert.equal(componerCliente("Ana · x", "abc9123456"), "Ana x · 9123456");
  assert.deepEqual(separarCliente("Luna · 912345678"), { nombre: "Luna", telefono: "912345678" });
  assert.deepEqual(separarCliente("luna"), { nombre: "luna", telefono: "" });
  assert.deepEqual(separarCliente("912345678"), { nombre: "", telefono: "912345678" });
  assert.deepEqual(separarCliente(null), { nombre: "", telefono: "" });
  assert.ok(componerCliente("x".repeat(200), "1".repeat(100)).length <= 80);
});

test("reportes: una venta abonada se etiqueta «Abonada», no «Sin identificar»", () => {
  assert.equal(etiquetaMetodo({ id: "1", total: 1, created_at: "x", estado_pago: "abonada", metodo_pago: "" }), "Abonada (saldo por cobrar)");
  assert.equal(etiquetaMetodo({ id: "1", total: 1, created_at: "x", estado_pago: "sin_identificar", metodo_pago: "" }), "Sin identificar");
});
