import test from "node:test";
import assert from "node:assert/strict";
import { accionConsumo, listarConsumos, limpiarTrabajador, claveTrabajador } from "../lib/consumoPersonalServidor.ts";
import { esConsumoPersonal, ventaPuedeCobrarse, estaPagada } from "../lib/estados.ts";
import { resumirCobros } from "../lib/cierre.ts";
import { resumenPeriodo, etiquetaMetodo } from "../lib/reportes.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a", OTRA = "bbbbbbbb-0000-4000-8000-00000000000b";
const V = "11111111-1111-4111-8111-111111111111", C1 = "33333333-3333-4333-8333-333333333333", C2 = "44444444-4444-4444-8444-444444444444";
const caja = { rol: "garzon", empresa_id: EMP, nombre: "Caja" };
const admin = { rol: "admin", empresa_id: EMP, nombre: "Lenin" };

function dbFalsa(respuesta = { data: { ok: true } }) {
  const llamadas = [];
  return { llamadas, from: () => { throw new Error("no debe leer tablas"); }, rpc: async (fn, args) => (llamadas.push([fn, args]), respuesta) };
}

test("registrar: el negocio y el autor salen de la sesión, no del cuerpo", async () => {
  const db = dbFalsa();
  const r = await accionConsumo(db, caja, { accion: "registrar", venta_id: V, trabajador: "  Juan \n Pérez ", empresa_id: OTRA, p_por: "otro", monto: 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(db.llamadas, [["registrar_consumo_personal", { p_empresa: EMP, p_venta: V, p_trabajador: "Juan Pérez", p_por: "Caja" }]]);
});

test("registrar: venta o trabajador inválidos NO llegan a la base", async () => {
  const db = dbFalsa();
  for (const b of [{ accion: "registrar", venta_id: V }, { accion: "registrar", venta_id: V, trabajador: "   " }, { accion: "registrar", venta_id: V, trabajador: 5 },
    { accion: "registrar", venta_id: "no-uuid", trabajador: "Juan" }, { accion: "borrar", venta_id: V, trabajador: "Juan" }, null, [], "x"]) {
    assert.equal((await accionConsumo(db, caja, b)).status, 400, JSON.stringify(b));
  }
  assert.equal(db.llamadas.length, 0);
});

test("descontar: solo el administrador; la cajera recibe 403 y nada llega a la base", async () => {
  const db = dbFalsa();
  assert.equal((await accionConsumo(db, caja, { accion: "descontar", ids: [C1] })).status, 403);
  assert.equal(db.llamadas.length, 0);
  const r = await accionConsumo(db, admin, { accion: "descontar", ids: [C1, C1, C2], empresa_id: OTRA });
  assert.equal(r.status, 200);
  assert.deepEqual(db.llamadas, [["descontar_consumos_personal", { p_empresa: EMP, p_ids: [C1, C2], p_por: "Lenin" }]]);
});

test("descontar: ids vacíos, no-uuid o demasiados no llegan a la base", async () => {
  const db = dbFalsa();
  for (const ids of [[], ["x"], [C1, 5], "no-lista", undefined, Array.from({ length: 201 }, () => C1)]) assert.equal((await accionConsumo(db, admin, { accion: "descontar", ids })).status, 400);
  assert.equal(db.llamadas.length, 0);
});

test("códigos de la base → mensajes y estados HTTP", async () => {
  const casos = [["ya_cobrada", 409, /cobrada/], ["venta_no_encontrada", 404, /no encontrada/], ["point_en_curso", 409, /Point/], ["trabajador_invalido", 400, /nombre/], ["nada_pendiente", 409, /descontados/], ["codigo_nuevo", 400, /rechazada/]];
  for (const [codigo, st, re] of casos) {
    const r = await accionConsumo(dbFalsa({ data: { ok: false, codigo } }), admin, { accion: "registrar", venta_id: V, trabajador: "Juan" });
    assert.equal(r.status, st, codigo); assert.match(String(r.body.error), re, codigo);
  }
  assert.equal((await accionConsumo(dbFalsa({ error: { message: "x" } }), admin, { accion: "registrar", venta_id: V, trabajador: "Juan" })).status, 500);
});

test("nombre: sin caracteres de control, corto, y 'juan' = 'Juan ' = 'JUAN'", () => {
  assert.equal(limpiarTrabajador("  María\t\n José "), "María José");
  assert.equal(limpiarTrabajador(""), null); assert.equal(limpiarTrabajador(1), null); assert.equal(limpiarTrabajador("x".repeat(200)).length, 60);
  assert.equal(claveTrabajador("  JUAN "), claveTrabajador("juan")); assert.equal(claveTrabajador("José"), claveTrabajador("jose"));
});

function dbLectura({ consumos, ventas }) {
  const filtros = {};
  const mk = (tabla, filas) => { const q = { select: () => q, eq: (c, v) => ((filtros[tabla] ??= []).push([c, v]), q), is: () => q, in: async () => ({ data: filas }), order: () => q, limit: async () => ({ data: filas }) }; return q; };
  return { filtros, from: (t) => mk(t, t === "ventas" ? ventas : consumos) };
}

test("listar: agrupa por trabajador (sin importar mayúsculas), suma montos y filtra por el negocio de la sesión", async () => {
  const db = dbLectura({
    consumos: [
      { id: C1, venta_id: V, trabajador: "Juan", monto: 2300, created_at: "2026-11-16T17:40:00Z" },
      { id: C2, venta_id: "22222222-2222-4222-8222-222222222222", trabajador: "juan ", monto: 1500, created_at: "2026-11-16T18:00:00Z" },
      { id: "55555555-5555-4555-8555-555555555555", venta_id: "66666666-6666-4666-8666-666666666666", trabajador: "María", monto: 800, created_at: "2026-11-16T18:10:00Z" },
    ],
    ventas: [{ id: V, numero: 2170, mesa: "Mesa 1", items: [{ nombre: "Perro caliente", cantidad: 1 }, { nombre: "Coca-Cola Lata", cantidad: 1 }] }],
  });
  const r = await listarConsumos(db, caja);
  assert.equal(r.status, 200);
  assert.equal(r.body.cantidad, 3); assert.equal(r.body.total, 4600);
  assert.equal(r.body.trabajadores.length, 2);
  const juan = r.body.trabajadores.find((t) => claveTrabajador(t.trabajador) === "juan");
  assert.equal(juan.total, 3800); assert.equal(juan.cantidad, 2);
  assert.deepEqual(juan.consumos[0].items, [{ nombre: "Perro caliente", cantidad: 1 }, { nombre: "Coca-Cola Lata", cantidad: 1 }]);
  assert.ok(db.filtros.consumos_personal.every(([c, v]) => c === "empresa_id" && v === EMP));
  assert.ok(db.filtros.ventas.some(([c, v]) => c === "empresa_id" && v === EMP));
});

test("listar: sin consumos pendientes → lista vacía", async () => {
  const r = await listarConsumos(dbLectura({ consumos: [], ventas: [] }), caja);
  assert.deepEqual([r.status, r.body.cantidad, r.body.total, r.body.trabajadores], [200, 0, 0, []]);
});

// ── Lo que importa para la caja: un consumo personal NO es un cobro ──
const venta = (id, total, extra = {}) => ({ id, total, metodo_pago: "Efectivo", estado: "listo", estado_pago: "pagado", created_at: "2026-11-16T15:00:00Z", pagado_at: "2026-11-16T15:05:00Z", ...extra });
const CP = { metodo_pago: "Consumo personal", estado_pago: "consumo_personal", pagado_at: null };

test("caja: el consumo personal no suma a efectivo, débito, transferencia ni total del cierre", () => {
  const r = resumirCobros([venta("a", 5000), venta("b", 2300, CP), venta("c", 1500, CP)], "2026-11-16T00:00:00Z");
  assert.equal(r.total, 5000); assert.equal(r.efectivo, 5000); assert.equal(r.cantidad, 1);
  assert.equal(r.debito + r.transferencia + r.qr, 0);
});

test("estados: el consumo personal no es pagado ni se puede cobrar de nuevo", () => {
  const v = { estado_pago: "consumo_personal" };
  assert.ok(esConsumoPersonal(v)); assert.ok(!estaPagada(v)); assert.ok(!ventaPuedeCobrarse(v));
  assert.ok(!esConsumoPersonal({ estado_pago: "pagado" }));
});

test("reportes: se cuenta aparte y no aparece como cobrado ni como saldo pendiente", () => {
  const creadas = [venta("1", 1000), venta("2", 2300, CP), venta("3", 500, { estado_pago: "pendiente", metodo_pago: "", pagado_at: null })];
  const r = resumenPeriodo(creadas, [], "2026-11-16T00:00:00Z", "2026-11-17T00:00:00Z");
  assert.deepEqual(r.consumoPersonal, { cantidad: 1, total: 2300 });
  assert.deepEqual(r.cobrado, { cantidad: 1, total: 1000 });
  assert.deepEqual(r.pendiente, { cantidad: 1, total: 500 });
  assert.match(etiquetaMetodo(creadas[1]), /Consumo personal/);
});
