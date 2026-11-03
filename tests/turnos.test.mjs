import test from "node:test";
import assert from "node:assert/strict";
import { medioDesdeOrden } from "../lib/medioPoint.ts";
import { accionTurno, estadoTurno } from "../lib/turnosServidor.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a", OTRA = "bbbbbbbb-0000-4000-8000-00000000000b";
const T1 = "11111111-1111-4111-8111-111111111111", CL = "22222222-2222-4222-8222-222222222222";
const ses = { rol: "admin", empresa_id: EMP, nombre: "Cajera ficticia" };

// Base simulada: aperturas_caja con un turno v2 de EMP; registra las llamadas RPC.
function dbFalsa({ rpc = () => ({ data: { ok: true } }) } = {}) {
  const llamadas = [];
  const filas = { aperturas_caja: [{ id: T1, empresa_id: EMP, modelo: "v2", estado: "abierta" }], cobros_turno: [{ id: CL, turno_id: T1 }] };
  const from = (t) => {
    const f = [];
    const q = { select: () => q, eq: (c, v) => (f.push([c, v]), q), is: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: (filas[t] ?? []).find((r) => f.every(([c, v]) => r[c] === v)) ?? null }) };
    return q;
  };
  return { llamadas, from, rpc: async (fn, args) => (llamadas.push([fn, args]), rpc(fn, args)) };
}

test("medio Point: solo valores conocidos; lo demás queda por conciliar", () => {
  const o = (type, n = 1) => ({ transactions: { payments: Array.from({ length: n }, () => ({ payment_method: { type } })) } });
  assert.equal(medioDesdeOrden(o("credit_card")), "credito");
  assert.equal(medioDesdeOrden(o("debit_card")), "debito");
  assert.equal(medioDesdeOrden(o("qr")), "qr");
  assert.equal(medioDesdeOrden(o("account_money")), null);
  assert.equal(medioDesdeOrden(o("credit_card", 2)), null);
  assert.equal(medioDesdeOrden({}), null);
  assert.equal(medioDesdeOrden(null), null);
});

test("abrir: fondo entero ≥ 0; el negocio sale de la sesión, no del cuerpo", async () => {
  const db = dbFalsa();
  assert.equal((await accionTurno(db, ses, { accion: "abrir", fondo: -1 })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "abrir", fondo: 10.5 })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "abrir", fondo: "1000" })).status, 400);
  const r = await accionTurno(db, ses, { accion: "abrir", fondo: 1000, empresa_id: OTRA });
  assert.equal(r.status, 200);
  assert.deepEqual(db.llamadas.at(-1), ["turno_abrir", { p_empresa: EMP, p_fondo: 1000, p_cajero: "Cajera ficticia" }]);
});

test("ya abierto → 409 con el id del turno", async () => {
  const db = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "ya_abierto", turno_id: T1 } }) });
  const r = await accionTurno(db, ses, { accion: "abrir", fondo: 0 });
  assert.equal(r.status, 409); assert.equal(r.body.turno_id, T1);
});

test("turno de otro negocio o inexistente → 404 sin llamar a la base", async () => {
  const db = dbFalsa();
  const otra = { ...ses, empresa_id: OTRA };
  for (const a of [{ accion: "cerrar", turno_id: T1, clave: CL, contados: { efectivo: 1 } }, { accion: "retiro", turno_id: T1, monto: 1, motivo: "x" }]) {
    assert.equal((await accionTurno(db, otra, a)).status, 404);
  }
  assert.equal((await accionTurno(db, ses, { accion: "cerrar", turno_id: "no-uuid", clave: CL })).status, 404);
  assert.equal(db.llamadas.length, 0);
});

test("cerrar: exige clave; valida montos; solo manda lo contado", async () => {
  const db = dbFalsa();
  assert.equal((await accionTurno(db, ses, { accion: "cerrar", turno_id: T1, contados: { efectivo: 1 } })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "cerrar", turno_id: T1, clave: CL, contados: { efectivo: -5 } })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "cerrar", turno_id: T1, clave: CL, contados: { efectivo: 1e12 } })).status, 400);
  const r = await accionTurno(db, ses, { accion: "cerrar", turno_id: T1, clave: CL, notas: "n", contados: { efectivo: 10000, debito: 64500, esperado: 99, efectivo_esperado: 1 } });
  assert.equal(r.status, 200);
  const [fn, args] = db.llamadas.at(-1);
  assert.equal(fn, "turno_cerrar");
  assert.deepEqual(args.p_contados, { efectivo: 10000, debito: 64500 }); // campos ajenos descartados
});

test("reintento de cierre con la misma clave devuelve 200 repetido; otra clave → 409", async () => {
  const rep = dbFalsa({ rpc: () => ({ data: { ok: true, repetido: true } }) });
  assert.equal((await accionTurno(rep, ses, { accion: "cerrar", turno_id: T1, clave: CL, contados: { efectivo: 1 } })).body.repetido, true);
  const ya = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "ya_cerrado" } }) });
  assert.equal((await accionTurno(ya, ses, { accion: "cerrar", turno_id: T1, clave: CL, contados: { efectivo: 1 } })).status, 409);
});

test("retiro y conciliación: validación y pertenencia", async () => {
  const db = dbFalsa();
  assert.equal((await accionTurno(db, ses, { accion: "retiro", turno_id: T1, monto: 0, motivo: "x" })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "retiro", turno_id: T1, monto: 10000, motivo: " Entrega ", entregado_a: "Adriana" })).status, 200);
  assert.equal(db.llamadas.at(-1)[1].p_motivo, "Entrega");
  assert.equal((await accionTurno(db, ses, { accion: "conciliar", turno_id: T1, cobro_id: "33333333-3333-4333-8333-333333333333", medio: "efectivo" })).status, 404);
  assert.equal((await accionTurno(db, ses, { accion: "conciliar", turno_id: T1, cobro_id: CL, medio: "efectivo" })).status, 200);
  assert.equal((await accionTurno(db, ses, { accion: "zzz", turno_id: T1 })).status, 400);
});

test("error de base no filtra detalle", async () => {
  const db = dbFalsa({ rpc: () => ({ error: { message: "secreto interno" } }) });
  const r = await accionTurno(db, ses, { accion: "abrir", fondo: 1 });
  assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.body).includes("secreto"));
});

test("estado sin turno devuelve turno null", async () => {
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) }), rpc: async () => ({}) };
  assert.deepEqual((await estadoTurno(db, ses)).body, { ok: true, turno: null });
});
