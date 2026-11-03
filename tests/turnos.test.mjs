import test from "node:test";
import assert from "node:assert/strict";
import { medioDesdeOrden } from "../lib/medioPoint.ts";
import { accionTurno, estadoTurno, historialTurnos } from "../lib/turnosServidor.ts";
import { esProvisional, textoDiferenciaEfectivo, folioTexto, etiquetaFolio } from "../lib/turnosVista.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a", OTRA = "bbbbbbbb-0000-4000-8000-00000000000b";
const T1 = "11111111-1111-4111-8111-111111111111", CL = "22222222-2222-4222-8222-222222222222";
const VISTO = { efectivo: 19090, debito: 64500, credito: 0, transferencia: 16400, qr: 3000, por_conciliar: 0 };
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
  assert.deepEqual(db.llamadas.at(-1), ["turno_abrir", { p_empresa: EMP, p_fondo: 1000, p_cajero: "Cajera ficticia", p_clave: null }]);
});

test("abrir: la clave de reintento (UUID) se reenvía; una clave inválida se descarta", async () => {
  const db = dbFalsa();
  await accionTurno(db, ses, { accion: "abrir", fondo: 0, clave: CL });
  assert.equal(db.llamadas.at(-1)[1].p_clave, CL);
  await accionTurno(db, ses, { accion: "abrir", fondo: 0, clave: "no-es-uuid" });
  assert.equal(db.llamadas.at(-1)[1].p_clave, null);
});

test("historial de cierres pide el folio numero_cierre", async () => {
  let cols = "";
  const q = { select: (c) => ((cols = cols || c), q), eq: () => q, order: () => q, limit: async () => ({ data: [] }), in: async () => ({ data: [] }) };
  const db = { from: () => q };
  await historialTurnos(db, ses);
  assert.match(cols, /numero_cierre/);
});

test("folios: etiquetas con ceros; históricos sin folio no muestran nada", () => {
  assert.equal(folioTexto(7), "0007"); assert.equal(etiquetaFolio("Cierre", 12), "Cierre N° 0012");
  assert.equal(etiquetaFolio("Turno", null), ""); assert.equal(folioTexto(undefined), "");
});

test("ya abierto → 409 con el id del turno", async () => {
  const db = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "ya_abierto", turno_id: T1 } }) });
  const r = await accionTurno(db, ses, { accion: "abrir", fondo: 0 });
  assert.equal(r.status, 409); assert.equal(r.body.turno_id, T1);
});

test("turno de otro negocio o inexistente → 404 sin llamar a la base", async () => {
  const db = dbFalsa();
  const otra = { ...ses, empresa_id: OTRA };
  for (const a of [{ accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO }, { accion: "retiro", turno_id: T1, monto: 1, motivo: "x" }]) {
    assert.equal((await accionTurno(db, otra, a)).status, 404);
  }
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: "no-uuid", clave: CL })).status, 404);
  assert.equal(db.llamadas.length, 0);
});

test("presentar arqueo: exige clave; valida montos; solo manda lo contado", async () => {
  const db = dbFalsa();
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, contados: { efectivo: 1 }, esperado_visto: VISTO })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: -5 }, esperado_visto: VISTO })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1e12 }, esperado_visto: VISTO })).status, 400);
  const r = await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, notas: "n", contados: { efectivo: 10000, debito: 64500, esperado: 99, efectivo_esperado: 1 }, esperado_visto: VISTO });
  assert.equal(r.status, 200);
  const [fn, args] = db.llamadas.at(-1);
  assert.equal(fn, "turno_presentar_arqueo");
  assert.deepEqual(args.p_esperado_visto, VISTO);
  assert.deepEqual(args.p_contados, { efectivo: 10000, debito: 64500 }); // campos ajenos descartados
});

test("reintento de presentación con la misma clave devuelve 200 repetido; otra clave → 409", async () => {
  const rep = dbFalsa({ rpc: () => ({ data: { ok: true, repetido: true } }) });
  assert.equal((await accionTurno(rep, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO })).body.repetido, true);
  const ya = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "ya_cerrado" } }) });
  assert.equal((await accionTurno(ya, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO })).status, 409);
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

test("presentación del administrador sin resumen → 400; resumen cambiado → 409", async () => {
  const db = dbFalsa();
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 } })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: { efectivo: 1 } })).status, 400);
  const nuevo = { esperado: { efectivo: 20000 } };
  const ch = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "resumen_cambio", resumen: nuevo } }) });
  const r = await accionTurno(ch, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO });
  assert.equal(r.status, 409); assert.deepEqual(r.body.resumen, nuevo);
});

test("Point por confirmar: comanda, mesa, hora y referencia para distinguirlos", async () => {
  const V1 = "44444444-4444-4444-8444-444444444444", V2 = "55555555-5555-4555-8555-555555555555";
  const tablas = {
    aperturas_caja: [{ id: T1, empresa_id: EMP, modelo: "v2", estado: "abierta" }],
    cobros_turno: [{ id: "c1", venta_id: V1, monto: 4500, proveedor: "point", created_at: "2026-11-03T15:01:00Z", turno_id: T1, medio: "por_conciliar" },
                   { id: "c2", venta_id: V2, monto: 4500, proveedor: "point", created_at: "2026-11-03T15:07:00Z", turno_id: T1, medio: "por_conciliar" }],
    ventas: [{ id: V1, empresa_id: EMP, numero: 31, mesa: "4", mesero: "Ana" }, { id: V2, empresa_id: EMP, numero: 32, mesa: "Llevar", mesero: "Ana" }, { id: "x", empresa_id: OTRA, numero: 99 }],
    pagos_point: [{ venta_id: V1, restaurante_id: EMP, mp_order_id: "ORD01ABCDEFGH", referencia_externa: null }, { venta_id: V2, restaurante_id: EMP, mp_order_id: "ORD02ZZZZ1234", referencia_externa: null }],
  };
  const from = (t) => { const f = []; let inn = null; const q = {
    select: () => q, eq: (c, v) => (f.push([c, v]), q), is: () => q, not: () => q, neq: () => q, order: () => q, limit: () => q, in: (c, vs) => (inn = [c, vs], q),
    maybeSingle: async () => ({ data: (tablas[t] ?? []).find((r) => f.every(([c, v]) => r[c] === v)) ?? null }),
    then: (ok) => ok({ data: (tablas[t] ?? []).filter((r) => f.every(([c, v]) => r[c] === v) && (!inn || inn[1].includes(r[inn[0]]))) }) }; return q; };
  const r = await estadoTurno({ from, rpc: async () => ({ data: { turno: {}, esperado: {} } }) }, ses);
  const [a, b] = r.body.por_conciliar;
  assert.deepEqual([a.comanda, a.mesa, a.referencia], [31, "4", "ABCDEFGH"]);
  assert.deepEqual([b.comanda, b.mesa, b.referencia], [32, "Llevar", "ZZZZ1234"]);
  assert.notEqual(a.hora, b.hora);
  assert.ok(Array.isArray(r.body.point_confirmados));
});

test("esperado negativo (−1000) con contado 0 se acepta; contado negativo sigue rechazado", async () => {
  const db = dbFalsa();
  const neg = { ...VISTO, efectivo: -1000 };
  const r = await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 0 }, esperado_visto: neg });
  assert.equal(r.status, 200);
  assert.deepEqual(db.llamadas.at(-1)[1].p_esperado_visto, neg);
  assert.deepEqual(db.llamadas.at(-1)[1].p_contados, { efectivo: 0 });
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: -1 }, esperado_visto: neg })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 0 }, esperado_visto: { ...neg, efectivo: 1.5 } })).status, 400);
  assert.equal((await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 0 }, esperado_visto: { ...neg, efectivo: "x" } })).status, 400);
});

test("corregir conciliación: errores de la base se traducen sin detalle interno", async () => {
  for (const [codigo, st] of [["no_es_point", 409], ["medio_informado_por_point", 409], ["ya_conciliado", 409]]) {
    const db = dbFalsa({ rpc: () => ({ data: { ok: false, codigo } }) });
    const r = await accionTurno(db, ses, { accion: "conciliar", turno_id: T1, cobro_id: CL, medio: "debito" });
    assert.equal(r.status, st); assert.equal(r.body.codigo, codigo);
  }
});

test("error de base no filtra detalle", async () => {
  const db = dbFalsa({ rpc: () => ({ error: { message: "secreto interno" } }) });
  const r = await accionTurno(db, ses, { accion: "abrir", fondo: 1 });
  assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.body).includes("secreto"));
});

test("estado sin turno devuelve turno null", async () => {
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) }), rpc: async () => ({}) };
  assert.deepEqual((await estadoTurno(db, ses)).body, { ok: true, turno: null, rol: "admin" });
});

test("diferencia PROVISIONAL mientras haya Point por confirmar; definitiva si no", () => {
  const con = { pendientes: { cobros_por_conciliar: 2 }, esperado: { por_conciliar: 11000 } };
  const sin = { pendientes: { cobros_por_conciliar: 0 }, esperado: { por_conciliar: 0 } };
  assert.equal(esProvisional(con), true); assert.equal(esProvisional(sin), false); assert.equal(esProvisional(null), false);
  assert.equal(esProvisional({ pendientes: { cobros_por_conciliar: 0 }, esperado: { por_conciliar: 500 } }), true);
  assert.match(textoDiferenciaEfectivo(-9090, true), /PROVISIONAL: −\$9\.090/);
  assert.doesNotMatch(textoDiferenciaEfectivo(-9090, true), /[Ff]alta/);
  assert.match(textoDiferenciaEfectivo(-9090, false), /Faltan \$9\.090/);
  assert.equal(textoDiferenciaEfectivo(0, false), "Cuadra");
  assert.match(textoDiferenciaEfectivo(500, true), /PROVISIONAL: \+\$500/);
});

test("historial entrega la instantánea guardada (resumen) y los contados originales para reimprimir", async () => {
  const guardado = { turno: { id: T1 }, fondo: 1000, esperado: { efectivo: 19090 } };
  const tablas = {
    cierres_turno: [{ id: "k1", empresa_id: EMP, cierre_at: "2026-11-03T03:40:00Z", resumen: guardado, con_pendientes: false }],
    cierres_turno_medios: [{ cierre_id: "k1", medio: "efectivo", esperado: 19090, contado: 10000, diferencia: -9090 }],
  };
  const from = (t) => { const f = []; let inn = null; const q = { select: () => q, eq: (c, v) => (f.push([c, v]), q), order: () => q, limit: () => q, in: (c, vs) => (inn = [c, vs], q),
    then: (ok) => ok({ data: (tablas[t] ?? []).filter((r) => f.every(([c, v]) => r[c] === v) && (!inn || inn[1].includes(r[inn[0]]))) }) }; return q; };
  const r = await historialTurnos({ from, rpc: async () => ({}) }, ses);
  assert.deepEqual(r.body.cierres[0].resumen, guardado);                       // se reimprime con lo guardado
  assert.deepEqual(r.body.cierres[0].medios[0], tablas.cierres_turno_medios[0]);
  const otra = await historialTurnos({ from, rpc: async () => ({}) }, { ...ses, empresa_id: OTRA });
  assert.deepEqual(otra.body.cierres, []);                                      // otro negocio no ve este cierre
});

// ---- Reglas del dueño: cierre bloqueado por pendientes; sin cobros sin turno ----
import { agruparBloqueos, etiquetaBloqueo, RUTA_BLOQUEO } from "../lib/turnosVista.ts";
import { iniciarCobroPoint } from "../lib/pointCobro.ts";
import { ejecutarPlan } from "../lib/datosAutorizados.ts";

const BLOQ = [
  { tipo: "comanda_sin_entregar", venta_id: "v1", numero: 101, mesa: "Mesa 4", monto: 5000, motivo: "Comanda sin entregar (pendiente)", ir: "cocina" },
  { tipo: "venta_sin_cobrar", venta_id: "v1", numero: 101, mesa: "Mesa 4", monto: 5000, motivo: "Venta sin cobrar", ir: "caja" },
  { tipo: "point_en_proceso", venta_id: "v2", numero: 102, mesa: null, monto: 8000, motivo: "Pago Point en proceso (at_terminal)", ir: "caja" },
  { tipo: "cobro_medio_sin_confirmar", venta_id: "v3", numero: 103, mesa: "Mesa 2", monto: 1200, motivo: "Cobro con medio por confirmar", ir: "cierre" },
];
test("cierre bloqueado por la base → 409 con la lista (n.º, mesa, monto, motivo) y sin cerrar nada", async () => {
  const db = dbFalsa({ rpc: () => ({ data: { ok: false, codigo: "bloqueado", bloqueos: BLOQ } }) });
  const r = await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO });
  assert.equal(r.status, 409); assert.equal(r.body.ok, false); assert.equal(r.body.codigo, "bloqueado");
  assert.deepEqual(r.body.bloqueos, BLOQ);
  assert.match(r.body.error, /No se puede cerrar el turno/);
});
test("la presentación valida pendientes en la base y no acepta un campo de forzar desde el navegador", async () => {
  const db = dbFalsa();
  await accionTurno(db, ses, { accion: "presentar_arqueo", turno_id: T1, clave: CL, contados: { efectivo: 1 }, esperado_visto: VISTO, bloqueos: [], sin_bloqueos: true, forzar: true });
  const [fn, args] = db.llamadas.at(-1);
  assert.equal(fn, "turno_presentar_arqueo");
  assert.deepEqual(Object.keys(args).sort(), ["p_clave", "p_contados", "p_empresa", "p_esperado_visto", "p_notas", "p_por", "p_turno"], "ningún campo de 'forzar' llega a la base");
});
test("presentación del bloqueo: agrupado por motivo, con número, mesa, monto y acción para ir a resolver", () => {
  const g = agruparBloqueos(BLOQ);
  assert.deepEqual(g.map((x) => [x.tipo, x.items.length]), [["comanda_sin_entregar", 1], ["venta_sin_cobrar", 1], ["point_en_proceso", 1], ["cobro_medio_sin_confirmar", 1]]);
  assert.equal(etiquetaBloqueo(BLOQ[0]), "Comanda #101 · mesa Mesa 4 · $5.000 — Comanda sin entregar (pendiente)");
  assert.match(etiquetaBloqueo(BLOQ[2]), /^Comanda #102 · \$8\.000 — Pago Point en proceso/);
  for (const b of BLOQ) assert.ok(RUTA_BLOQUEO[b.ir].href, "cada bloqueo tiene a dónde ir");
  assert.deepEqual(agruparBloqueos(null), []);
});
test("Point sin turno abierto (P0413): 409 'sin_turno' ANTES de llamar al proveedor", async () => {
  let llamadas = 0;
  const mp = { crearOrden: async () => { llamadas++; return { ok: true, orden: { id: "O", status: "created" } }; } };
  const entrada = { restauranteId: EMP, ventaId: "v", monto: 10000, terminalId: "T", venta: { total: 10000, estado_pago: "pendiente" } };
  const pagos = { reservar: async () => { throw Object.assign(new Error("SIN_TURNO_ABIERTO"), { code: "P0413" }); } };
  const r = await iniciarCobroPoint(pagos, mp, entrada);
  assert.deepEqual([r.ok, r.status, r.codigo, r.reintentable], [false, 409, "sin_turno", false]);
  assert.match(r.error, /Abre el turno/);
  assert.equal(llamadas, 0, "cero llamadas al proveedor");
});
test("cobro manual sin turno (P0413) llega al navegador con un mensaje claro y el mismo código", async () => {
  const q = { eq() { return q; }, then(res) { res({ data: null, error: { code: "P0413", message: "SIN_TURNO_ABIERTO" }, status: 400 }); } };
  const db = { from: () => ({ update: () => q }) };
  const r = await ejecutarPlan(db, { tabla: "ventas", pasos: [{ m: "update", a: [{}] }, { m: "eq", a: ["id", "x"] }] });
  assert.equal(r.error.code, "P0413"); assert.match(r.error.message, /No hay un turno abierto/);
});
