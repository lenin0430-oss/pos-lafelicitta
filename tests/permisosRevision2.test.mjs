// Pendientes de la revisión de Codex a 8bbb98f. Cada una de sus 3 reproducciones pasa a ser una PROTECCIÓN con control positivo.
import test from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "secreto-de-prueba-para-sesiones-0123456789";
delete process.env.DATOS_CATALOGO; delete process.env.DATOS_CATALOGO_VACIO;
const { crearToken, COOKIE_SESION } = await import("../lib/restaurante.ts");
const { atenderDatos } = await import("../lib/datosServidor.ts");
const { planificar, TABLAS_POR_ID } = await import("../lib/datosAutorizados.ts");
const { verificarCatalogo } = await import("../lib/contextoNegocio.ts");
const { crearDb, rpcsVentas } = await import("./fakeDb.mjs");

const E = "aaaaaaaa-0000-0000-0000-00000000000a";
const garzon = { rol: "garzon", nombre: "Prueba", empresa_id: E }, admin = { rol: "admin", nombre: "Ana", empresa_id: E };
const req = (s, tabla, pasos) => new Request("https://pos.test/api/datos", { method: "POST", headers: { "content-type": "application/json", cookie: `${COOKIE_SESION}=${crearToken(s)}` }, body: JSON.stringify({ tabla, pasos }) });
const cobro = [{ m: "update", a: [{ estado: "listo", metodo_pago: "Efectivo" }] }];

test("P1 (ID exacto): un filtro amplio como neq(id,'no-existe') se rechaza y NO se cobran 51 ventas, incluida la que tiene Point en curso", async () => {
  const ventas = Array.from({ length: 51 }, (_, i) => ({ id: `v${i}`, empresa_id: E, total: 1000, metodo_pago: "", estado: "pendiente", items: [] }));
  const db = crearDb({ ventas, pagos_point: [{ venta_id: "v50", restaurante_id: E, estado: "created" }] }, rpcsVentas());
  for (const filtro of [{ m: "neq", a: ["id", "no-existe"] }, { m: "in", a: ["id", ["v1", "v2"]] }, { m: "gte", a: ["id", "v0"] }, { m: "eq", a: ["estado", "pendiente"] }, { m: "is", a: ["id", null] }]) {
    const r = await atenderDatos(req(garzon, "ventas", [...cobro, filtro]), { db });
    assert.equal(r.status, 400, JSON.stringify(filtro));
  }
  assert.equal(db.T.ventas.filter((v) => v.metodo_pago).length, 0, "ninguna venta cambió");
  const dos = await atenderDatos(req(garzon, "ventas", [...cobro, { m: "eq", a: ["id", "v1"] }, { m: "eq", a: ["id", "v2"] }]), { db });
  assert.equal(dos.status, 400, "dos filtros por id tampoco");
  // control positivo: una venta por id, sin Point → cobra solo esa
  assert.equal((await atenderDatos(req(garzon, "ventas", [...cobro, { m: "eq", a: ["id", "v1"] }]), { db })).status, 200);
  assert.equal(db.T.ventas.filter((v) => v.metodo_pago).length, 1);
  // y la que tiene Point en curso sí se rechaza por id
  assert.equal((await atenderDatos(req(garzon, "ventas", [...cobro, { m: "eq", a: ["id", "v50"] }]), { db })).status, 409);
  assert.equal(db.T.ventas[50].metodo_pago, "");
});
test("P1 (ID exacto): vale para todas las acciones financieras y tablas con dinero/precios (update y delete)", () => {
  const sol = (tabla, ...p) => ({ tabla, pasos: p.map(([m, ...a]) => ({ m, a })) });
  const amplio = ["neq", "id", "x"];
  const casos = [["ventas", ["update", { estado: "listo" }]], ["ventas", ["update", { metodo_pago: "Débito" }]], ["ventas", ["update", { total: 5000, items: [{ nombre: "H", cantidad: 1, precio_unit: 5000 }] }]], ["ventas", ["delete"]], ["productos", ["update", { precio: 5 }]], ["gastos", ["delete"]], ["propinas", ["delete"]], ["aperturas_caja", ["update", { estado: "cerrada" }]]];
  for (const [t, cuerpo] of casos) {
    assert.equal(planificar(admin, sol(t, cuerpo, amplio)).ok, false, `${t} con filtro amplio`);
    assert.equal(planificar(admin, sol(t, cuerpo, ["eq", "id", "uno"])).ok, true, `${t} por id`);
    assert.equal(planificar(admin, sol(t, cuerpo, ["eq", "estado", "x"])).ok, false, `${t} por otra columna`);
  }
  assert.equal(planificar(admin, sol("ventas", ["update", { estado: "listo" }], ["eq", "id", "a"], ["eq", "id", "b"])).ok, false);
  assert.ok(TABLAS_POR_ID.includes("ventas"));
});
test("P1 (cobro vs Point): el cobro manual y la edición ya NO son un update genérico: van por la función transaccional (que bloquea la venta)", async () => {
  const reg = [];
  const db = crearDb({ ventas: [{ id: "v1", empresa_id: E, total: 10000, metodo_pago: "", estado: "pendiente", items: [{ nombre: "Hamburguesa", cantidad: 2, precio_unit: 5000 }] }], pagos_point: [], productos: [{ empresa_id: E, nombre: "Hamburguesa", precio: 5000 }] }, rpcsVentas(reg));
  const original = db.from;
  // La reproducción de Codex: un Point aparece justo cuando el servidor empezaría a escribir la venta.
  db.from = (t) => { const q = original(t); return t !== "ventas" ? q : new Proxy(q, { get: (x, k) => k === "update" ? (...a) => { db.T.pagos_point.push({ venta_id: "v1", restaurante_id: E, estado: "created" }); return x.update(...a); } : x[k] }); };
  const r = await atenderDatos(req(garzon, "ventas", [...cobro, { m: "eq", a: ["id", "v1"] }]), { db });
  assert.equal(r.status, 200);
  assert.equal(db.log.filter((l) => l.tabla === "ventas" && l.op === "update").length, 0, "no se hizo ningún update por separado: la comprobación y la escritura viven en una sola función SQL");
  assert.deepEqual(reg.map((x) => x[0]), ["cobrar_venta_manual"]);
  assert.deepEqual(reg[0][1], { p_empresa: E, p_venta: "v1", p_medio: "Efectivo", p_mixto_suma: null });
  const e = await atenderDatos(req(garzon, "ventas", [{ m: "update", a: [{ total: 10000, items: [{ nombre: "Hamburguesa", cantidad: 2, precio_unit: 5000 }], mesa: "M2" }] }, { m: "eq", a: ["id", "v1"] }]), { db });
  assert.equal(e.status, 409, "ya cobrada: no se edita"); assert.equal(reg.at(-1)[0], "editar_comanda_venta");
});
test("P1 (cobro vs Point): si falta aplicar 07c el cobro falla CERRADO (503), no cae al update genérico", async () => {
  const db = crearDb({ ventas: [{ id: "v1", empresa_id: E, total: 1, metodo_pago: "", items: [] }] }, {});
  const r = await atenderDatos(req(garzon, "ventas", [...cobro, { m: "eq", a: ["id", "v1"] }]), { db });
  assert.equal(r.status, 503); assert.equal(db.T.ventas[0].metodo_pago, "");
});
test("P1 (cobro vs Point): el pago mixto envía la suma a la función para compararla con el total guardado EN la transacción", async () => {
  const reg = [];
  const db = crearDb({ ventas: [{ id: "v1", empresa_id: E, total: 10000, metodo_pago: "", items: [] }] }, rpcsVentas(reg));
  const m = (txt) => atenderDatos(req(garzon, "ventas", [{ m: "update", a: [{ metodo_pago: txt, estado: "listo" }] }, { m: "eq", a: ["id", "v1"] }]), { db });
  assert.equal((await m("Mixto: Efectivo $4.000 + Débito $5.000")).status, 422);
  assert.equal(reg[0][1].p_mixto_suma, 9000);
  assert.equal((await m("Mixto: Efectivo $4.000 + Débito $6.000")).status, 200);
  assert.equal(db.T.ventas[0].metodo_pago, "Mixto: Efectivo $4.000 + Débito $6.000");
});

test("P2 (catálogo): un duplicado INACTIVO con precio histórico ya no sirve para una venta nueva", async () => {
  const db = crearDb({ productos: [{ empresa_id: E, nombre: "Burger", precio: 8500, activo: true, disponible: true }, { empresa_id: E, nombre: "Burger", precio: 7500, activo: false, disponible: false }, { empresa_id: E, nombre: "Burger", precio: 6500, activo: true, disponible: false }, { empresa_id: E, nombre: "Burger", precio: 5500, activo: false, disponible: true }] });
  const linea = (precio_unit) => [{ nombre: "Burger", cantidad: 1, precio_unit }];
  for (const p of [7500, 6500, 5500]) { const r = await verificarCatalogo(db, E, linea(p), []); assert.equal(r.ok, false, String(p)); assert.equal(r.status, 422); }
  assert.equal((await verificarCatalogo(db, E, linea(8500), [])).ok, true, "control positivo: el precio del producto activo");
});
test("P2 (catálogo): sin producto activo con ese nombre se rechaza; el negocio sin catálogo se rechaza salvo permiso explícito", async () => {
  const inactivo = crearDb({ productos: [{ empresa_id: E, nombre: "Antiguo", precio: 1000, activo: false }] });
  assert.equal((await verificarCatalogo(inactivo, E, [{ nombre: "Antiguo", precio_unit: 1000, cantidad: 1 }], [])).ok, false);
  const vacio = crearDb({ productos: [] });
  const r = await verificarCatalogo(vacio, E, [{ nombre: "X", precio_unit: 1, cantidad: 1 }], []); assert.equal(r.ok, false); assert.equal(r.status, 422);
  process.env.DATOS_CATALOGO_VACIO = "permitir";
  try { assert.equal((await verificarCatalogo(vacio, E, [{ nombre: "X", precio_unit: 1, cantidad: 1 }], [])).ok, true); } finally { delete process.env.DATOS_CATALOGO_VACIO; }
});
test("P2 (catálogo): precios vigentes hoy (Pollo broaster 5.500, Pollo al horno 5.000) y nombres repetidos activos (Pabellón 3.500 en Empanadas y 6.490 en Arepas)", async () => {
  const db = crearDb({ productos: [{ empresa_id: E, nombre: "Pollo broaster", precio: 5500, activo: true, disponible: true }, { empresa_id: E, nombre: "Pollo al horno", precio: 5000, activo: true, disponible: true }, { empresa_id: E, nombre: "Pabellón", precio: 3500, activo: true, disponible: true }, { empresa_id: E, nombre: "Pabellón", precio: 6490, activo: true, disponible: true }] });
  const ok = async (n, p) => (await verificarCatalogo(db, E, [{ nombre: n, precio_unit: p, cantidad: 1 }], [])).ok;
  assert.equal(await ok("Pollo broaster", 5500), true); assert.equal(await ok("Pollo al horno", 5000), true);
  assert.equal(await ok("Pollo al horno", 4990), false, "el precio del respaldo antiguo ya no vale");
  assert.equal(await ok("Pabellón", 3500), true); assert.equal(await ok("Pabellón", 6490), true); assert.equal(await ok("Pabellón", 5000), false);
});
test("P2 (catálogo): una línea ya guardada en ESA venta se tolera al editar; no es una excepción global por nombre", async () => {
  const db = crearDb({ productos: [{ empresa_id: E, nombre: "Burger", precio: 8500, activo: true, disponible: true }] });
  const previa = [{ nombre: "Burger", cantidad: 1, precio_unit: 7500 }];
  assert.equal((await verificarCatalogo(db, E, [{ nombre: "Burger", cantidad: 3, precio_unit: 7500 }], previa)).ok, true, "misma línea histórica de esa venta");
  assert.equal((await verificarCatalogo(db, E, [{ nombre: "Burger", cantidad: 1, precio_unit: 7500 }], [])).ok, false, "en otra venta ese precio no vale");
  assert.equal((await verificarCatalogo(db, E, [{ nombre: "Burger", cantidad: 1, precio_unit: 7000 }], previa)).ok, false, "un precio distinto del histórico tampoco");
});
