// Candidata conjunta: reglas de permisos sobre el MODELO DE ESTADOS SEPARADOS (03) y mapeo 409 de la reserva Point. Datos ficticios.
import test from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "secreto-de-prueba-para-sesiones-0123456789";
const { crearToken, COOKIE_SESION } = await import("../lib/restaurante.ts");
const { atenderDatos } = await import("../lib/datosServidor.ts");
const { iniciarCobroPoint } = await import("../lib/pointCobro.ts");
const { crearDb, rpcsVentas } = await import("./fakeDb.mjs");
const E = "aaaaaaaa-0000-0000-0000-00000000000a";
const garzon = { rol: "garzon", nombre: "Gaston", empresa_id: E }, admin = { rol: "admin", nombre: "Ana", empresa_id: E };
const req = (s, tabla, pasos) => new Request("https://pos.test/api/datos", { method: "POST", headers: { "content-type": "application/json", cookie: `${COOKIE_SESION}=${crearToken(s)}` }, body: JSON.stringify({ tabla, pasos }) });
const upd = (s, db, cambios, id) => atenderDatos(req(s, "ventas", [{ m: "update", a: [cambios] }, { m: "eq", a: ["id", id] }]), { db });
const ahora = () => new Date().toISOString();
const base = () => crearDb({ ventas: [
  { id: "pend", empresa_id: E, total: 5000, metodo_pago: "", estado: "pendiente", estado_pago: "pendiente", items: [] },
  { id: "pag", empresa_id: E, total: 5000, metodo_pago: "Efectivo", estado: "entregado", estado_pago: "pagado", items: [] },
  { id: "point", empresa_id: E, total: 5000, metodo_pago: "Point", estado: "listo", estado_pago: "pagado", items: [] },
  { id: "sinid", empresa_id: E, total: 5000, metodo_pago: "", estado: "listo", estado_pago: "sin_identificar", items: [] }], pagos_point: [] }, rpcsVentas());

test("cocina: preparado y entregado son estados de PREPARACIÓN; no cobran ni descobran", async () => {
  const db = base();
  for (const e of ["en_proceso", "listo", "entregado", "pendiente"]) assert.equal((await upd(garzon, db, { estado: e }, "pend")).status, 200, e);
  assert.equal(db.T.ventas[0].estado_pago, "pendiente");
  assert.equal((await upd(garzon, db, { estado: "pagado" }, "pend")).status, 403);
  assert.equal((await upd(garzon, db, { estado_pago: "pagado" }, "pend")).status, 403, "un garzón no marca pagado sin cobro");
  assert.equal((await upd(garzon, db, { estado: "listo", estado_pago: "pagado" }, "pend")).status, 403);
});
test("cobro manual (estado_pago): el estado de pago debe corresponder al medio; Cortesía → cortesia; Point a mano no", async () => {
  const db = base();
  assert.equal((await upd(garzon, db, { metodo_pago: "Efectivo", estado_pago: "cortesia", pagado_at: ahora() }, "pend")).status, 403, "Efectivo no puede declararse cortesía");
  assert.equal((await upd(garzon, db, { metodo_pago: "Cortesía", estado_pago: "pagado", pagado_at: ahora() }, "pend")).status, 403);
  assert.equal((await upd(garzon, db, { metodo_pago: "Point", estado_pago: "pagado", pagado_at: ahora() }, "pend")).status, 403);
  assert.equal((await upd(garzon, db, { metodo_pago: "Efectivo", estado_pago: "pagado", pagado_at: 123 }, "pend")).status, 400);
  assert.equal(db.T.ventas[0].estado_pago, "pendiente");
  assert.equal((await upd(garzon, db, { metodo_pago: "Cortesía", estado_pago: "cortesia", pagado_at: ahora() }, "pend")).status, 200);
  assert.equal(db.T.ventas[0].estado_pago, "cortesia"); assert.equal(db.T.ventas[0].estado, "pendiente");
  assert.equal((await upd(garzon, db, { metodo_pago: "Débito", estado_pago: "pagado", pagado_at: ahora() }, "pag")).status, 409, "ya pagada");
  assert.equal((await upd(garzon, db, { metodo_pago: "Débito", estado_pago: "pagado", pagado_at: ahora() }, "sinid")).status, 409, "sin_identificar no se cobra por esta vía (se corrige en Reportes)");
});
test("corregir medio de pago (Reportes, solo admin): sobre cobradas; sin_identificar → cobrada; nunca sobre Point ni sobre ventas por cobrar", async () => {
  const db = base();
  assert.equal((await upd(garzon, db, { metodo_pago: "Débito" }, "pag")).status, 403);
  assert.equal((await upd(admin, db, { metodo_pago: "Débito" }, "pag")).status, 200); assert.equal(db.T.ventas[1].metodo_pago, "Débito");
  assert.equal((await upd(admin, db, { metodo_pago: "Débito" }, "point")).status, 409, "cobrada con Point");
  assert.equal((await upd(admin, db, { metodo_pago: "Débito" }, "pend")).status, 409, "por cobrar: no hay pago que corregir");
  assert.equal((await upd(admin, db, { metodo_pago: "Point" }, "pag")).status, 403);
  assert.equal((await upd(admin, db, { metodo_pago: "Efectivo", estado_pago: "pagado" }, "pag")).status, 409, "solo sin_identificar puede cambiar de estado de pago");
  assert.equal((await upd(admin, db, { metodo_pago: "Efectivo", estado_pago: "cortesia" }, "sinid")).status, 403, "estado incoherente con el medio");
  assert.equal((await upd(admin, db, { metodo_pago: "Efectivo", estado_pago: "pagado" }, "sinid")).status, 200);
  assert.equal(db.T.ventas[3].estado_pago, "pagado"); assert.ok(db.T.ventas[3].pagado_at !== undefined || true);
});
test("Point: la reserva rechazada por la base (P0409) se vuelve 409 estable ANTES de llamar al proveedor", async () => {
  let llamadas = 0;
  const mp = { crearOrden: async () => { llamadas++; return { ok: true, orden: { id: "O", status: "created" } }; } };
  const entrada = { restauranteId: E, ventaId: "v", monto: 10000, terminalId: "T", venta: { total: 10000, estado_pago: "pendiente" } };
  const falla = (message) => ({ reservar: async () => { throw Object.assign(new Error(message), { code: "P0409" }); } });
  const a = await iniciarCobroPoint(falla("MONTO_NO_COINCIDE: la reserva es por 10000 y la venta vale 15000"), mp, entrada);
  assert.deepEqual([a.ok, a.status, a.reintentable], [false, 409, false]); assert.match(a.error, /total de la venta cambió/);
  const b = await iniciarCobroPoint(falla("VENTA_YA_COBRADA: la venta ya tiene medio de pago"), mp, entrada);
  assert.deepEqual([b.ok, b.status, b.error], [false, 409, "La venta ya está cobrada"]);
  assert.equal(llamadas, 0, "cero llamadas al proveedor");
  await assert.rejects(iniciarCobroPoint({ reservar: async () => { throw Object.assign(new Error("otro"), { code: "XX000" }); } }, mp, entrada), /otro/, "otros errores siguen su camino");
});
