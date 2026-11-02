// Pruebas de los hallazgos de la revisión de Codex (4a617fa): gastos con aprobación en el servidor y ventas limitadas por campo/acción.
// Cada prueba negativa tiene su control positivo. Datos ficticios; sin red.
import test from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "secreto-de-prueba-para-sesiones-0123456789";
const { crearToken, COOKIE_SESION } = await import("../lib/restaurante.ts");
const { atenderDatos } = await import("../lib/datosServidor.ts");
const { planificar } = await import("../lib/datosAutorizados.ts");
const { registrarGasto } = await import("../lib/gastosServidor.ts");
const { aprobarGasto } = await import("../lib/verificarPinAdmin.ts");
const { _limpiarMemoria } = await import("../lib/limiteLogin.ts");
const { crearDb, rpcsSeguridad } = await import("./fakeDb.mjs");

const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b";
const garzon = { rol: "garzon", empresa_id: A, nombre: "Gaston" }, admin = { rol: "admin", empresa_id: A, nombre: "Ana" };
const cookie = (s) => `${COOKIE_SESION}=${crearToken(s)}`;
const sol = (tabla, ...pasos) => ({ tabla, pasos: pasos.map(([m, ...a]) => ({ m, a })) });
const req = (cuerpo, s) => new Request("https://pos.test/api/datos", { method: "POST", headers: { cookie: cookie(s), "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
const linea = (nombre, cantidad, precio_unit) => ({ nombre, cantidad, precio_unit });
const venta = (x = {}) => ({ numero: 7, mesa: "M1", mesero: "Caja", personas: 2, metodo_pago: "", total: 10000, items: [linea("Hamburguesa", 2, 5000)], estado: "pendiente", ...x });
const base = () => crearDb({
  productos: [{ empresa_id: A, nombre: "Hamburguesa", precio: 5000 }, { empresa_id: A, nombre: "Pollo broaster", precio: 5500 }, { empresa_id: A, nombre: "Pollo al horno", precio: 5000 }, { empresa_id: B, nombre: "Hamburguesa", precio: 1 }],
  ventas: [{ id: "v1", empresa_id: A, total: 10000, metodo_pago: "", estado: "pendiente", items: [linea("Hamburguesa", 2, 5000)] },
           { id: "vpagada", empresa_id: A, total: 5000, metodo_pago: "Efectivo", estado: "listo", items: [] },
           { id: "vpoint", empresa_id: A, total: 5000, metodo_pago: "Point", estado: "listo", items: [] },
           { id: "vpp", empresa_id: A, total: 5000, metodo_pago: "", estado: "pendiente", items: [] },
           { id: "vB", empresa_id: B, total: 5000, metodo_pago: "", estado: "pendiente", items: [] }],
  pagos_point: [{ venta_id: "vpp", estado: "created" }],
  usuarios: [{ empresa_id: A, nombre: "Ana", rol: "admin", pin: "9999", activo: true }, { empresa_id: B, nombre: "Beto", rol: "admin", pin: "1111", activo: true }],
  aperturas_caja: [{ id: "ap1", empresa_id: A, estado: "abierta", created_at: "2026-11-02T10:00:00Z" }],
  gastos: [], propinas: [], aperturas: [], aprobaciones_operacion: [], intentos_login: [], eventos_seguridad: [],
}, rpcsSeguridad());
const datos = (db, s, x) => atenderDatos(req(x, s), { db });

// ---------------- GASTOS ----------------
test("GASTOS: la petición directa de $100.000 como garzón (sin PIN) ya NO funciona por ninguna vía", async () => {
  const db = base();
  // vía genérica de la puerta de datos
  const r = await datos(db, garzon, sol("gastos", ["insert", { monto: 100000, descripcion: "prueba local" }]));
  assert.equal(r.status, 403); assert.equal(db.T.gastos.length, 0);
  // vía del caso de uso, sin aprobación / con aprobación inventada
  for (const aprobacion of [undefined, "", "inventada-inventada-inventada-1234", "true"]) {
    const g = await registrarGasto(db, garzon, { categoria: "insumos", descripcion: "prueba", monto: 100000, ...(aprobacion === undefined ? {} : { aprobacion }) });
    assert.equal(g.status, 403, String(aprobacion));
  }
  assert.equal(db.T.gastos.length, 0, "ningún gasto se registró");
});
test("GASTOS: control positivo — con PIN de admin válido se emite una aprobación y el gasto se registra con autor y fecha del servidor", async () => {
  const db = base();
  const ap = await aprobarGasto(db, garzon, { pin: "9999", categoria: "Insumos / Ingredientes", descripcion: "Compra de pollo", monto: 100000 });
  assert.equal(ap.status, 200); assert.ok(ap.body.aprobacion);
  assert.ok(!JSON.stringify(db.T.aprobaciones_operacion).includes(ap.body.aprobacion), "en la base solo queda el hash del token");
  const g = await registrarGasto(db, garzon, { categoria: "Insumos / Ingredientes", descripcion: "Compra de pollo", monto: 100000, aprobacion: ap.body.aprobacion, cajero: "otro", created_at: "2000-01-01" }).catch((e) => e);
  assert.equal(g.status, 400, "campos extra (cajero/created_at) se rechazan en vez de aceptarse");
  const g2 = await registrarGasto(db, garzon, { categoria: "Insumos / Ingredientes", descripcion: "Compra de pollo", monto: 100000, aprobacion: ap.body.aprobacion });
  assert.equal(g2.status, 200);
  const fila = db.T.gastos[0];
  assert.equal(fila.cajero, "Gaston"); assert.equal(fila.empresa_id, A); assert.equal(fila.monto, 100000); assert.equal(fila.apertura_id, "ap1"); assert.equal(fila.categoria, "insumos");
  assert.ok(Date.now() - new Date(fila.created_at).getTime() < 5000);
});
test("GASTOS: la aprobación es de un solo uso y solo vale para ESE negocio, empleado, importe y operación", async () => {
  const db = base();
  const pedir = async (s, g) => (await aprobarGasto(db, s, { pin: "9999", ...g })).body.aprobacion;
  const g = { categoria: "insumos", descripcion: "Compra A", monto: 50000 };
  const t = await pedir(garzon, g);
  for (const mala of [{ ...g, monto: 50001 }, { ...g, descripcion: "Compra B" }]) assert.equal((await registrarGasto(db, garzon, { ...mala, aprobacion: t })).status, 403);
  assert.equal((await registrarGasto(db, { ...garzon, nombre: "Pedro" }, { ...g, aprobacion: t })).status, 403, "otro empleado");
  assert.equal((await registrarGasto(db, { ...garzon, empresa_id: B }, { ...g, aprobacion: t })).status, 403, "otro negocio");
  assert.equal(db.T.gastos.length, 0);
  assert.equal((await registrarGasto(db, garzon, { ...g, aprobacion: t })).status, 200);
  assert.equal((await registrarGasto(db, garzon, { ...g, aprobacion: t })).status, 403, "reuso");
  assert.equal(db.T.gastos.length, 1);
  const vencida = await pedir(garzon, g); db.T.aprobaciones_operacion.at(-1).expira_en = new Date(Date.now() - 1000).toISOString();
  assert.equal((await registrarGasto(db, garzon, { ...g, aprobacion: vencida })).status, 403, "vencida");
});
test("GASTOS: el PIN de un admin de OTRO negocio no aprueba; PIN malo no emite nada; importe y datos inválidos se rechazan", async () => {
  const db = base();
  assert.equal((await aprobarGasto(db, garzon, { pin: "1111", categoria: "x", descripcion: "y", monto: 50000 })).status, 401);
  assert.equal((await aprobarGasto(db, garzon, { pin: "0000", categoria: "x", descripcion: "y", monto: 50000 })).status, 401);
  assert.equal(db.T.aprobaciones_operacion.length, 0);
  for (const monto of [0, -5, 1.5, "100000", 1e12, null]) assert.equal((await registrarGasto(db, admin, { categoria: "x", descripcion: "y", monto })).status, 400, String(monto));
  assert.equal((await registrarGasto(db, admin, { categoria: "x", descripcion: "", monto: 100 })).status, 400);
});
test("GASTOS: el umbral — garzón bajo $30.000 y admin sin aprobación siguen funcionando", async () => {
  const db = base();
  assert.equal((await registrarGasto(db, garzon, { categoria: "x", descripcion: "y", monto: 29999 })).status, 200);
  assert.equal((await registrarGasto(db, garzon, { categoria: "x", descripcion: "y", monto: 30000 })).status, 403);
  assert.equal((await registrarGasto(db, admin, { categoria: "x", descripcion: "y", monto: 500000 })).status, 200);
});
test("GASTOS: PIN de admin con límite persistente (5 fallos → 429) y el PIN correcto tampoco pasa mientras dure el bloqueo", async () => {
  const db = base();
  for (let i = 0; i < 4; i++) assert.equal((await aprobarGasto(db, garzon, { pin: "0000", categoria: "x", descripcion: "y", monto: 50000 })).status, 401);
  assert.equal((await aprobarGasto(db, garzon, { pin: "0000", categoria: "x", descripcion: "y", monto: 50000 })).status, 429);
  assert.equal((await aprobarGasto(db, garzon, { pin: "9999", categoria: "x", descripcion: "y", monto: 50000 })).status, 429);
  assert.equal((await aprobarGasto(db, { ...garzon, nombre: "Otro" }, { pin: "9999", categoria: "x", descripcion: "y", monto: 50000 })).status, 200, "otro empleado no queda bloqueado");
});

// ---------------- VENTAS ----------------
test("VENTAS: la actualización arbitraria de Codex (total -100, estado listo, metodo_pago Point) se rechaza; solo acciones válidas pasan", async () => {
  const db = base();
  const r = await datos(db, garzon, sol("ventas", ["update", { total: -100, estado: "listo", metodo_pago: "Point" }], ["eq", "id", "v1"]));
  assert.equal(r.status, 403);
  for (const c of [{ total: 1 }, { metodo_pago: "Point", estado: "listo" }, { estado: "cancelado" }, { estado: "listo", metodo_pago: "Efectivo", total: 1 }, { descuento: 10 }, { empresa_id: B }, { items: [], total: 0 }, { created_at: "2000-01-01" }]) {
    const x = await datos(db, garzon, sol("ventas", ["update", c], ["eq", "id", "v1"]));
    assert.ok([400, 403].includes(x.status), JSON.stringify(c) + " → " + x.status);
  }
  assert.equal(db.T.ventas[0].total, 10000); assert.equal(db.T.ventas[0].metodo_pago, "");
  // controles positivos: las acciones legítimas de la app
  assert.equal((await datos(db, garzon, sol("ventas", ["update", { estado: "en_proceso" }], ["eq", "id", "v1"]))).status, 200);
  assert.equal((await datos(db, garzon, sol("ventas", ["update", { metodo_pago: "Efectivo", estado: "listo" }], ["eq", "id", "v1"]))).status, 200);
  assert.equal(db.T.ventas[0].metodo_pago, "Efectivo"); assert.equal(db.T.ventas[0].estado, "listo");
});
test("VENTAS: cobro manual — no se puede cobrar dos veces, ni sobre Point en curso/aprobado, ni 'Point' a mano, ni otro negocio", async () => {
  const db = base();
  const cobro = (id, mp = "Efectivo") => datos(db, garzon, sol("ventas", ["update", { metodo_pago: mp, estado: "listo" }], ["eq", "id", id]));
  assert.equal((await cobro("vpagada", "Débito")).status, 409, "ya pagada"); assert.equal(db.T.ventas[1].metodo_pago, "Efectivo");
  assert.equal((await cobro("v1")).status, 200);
  assert.equal(db.log.filter((l) => l.tabla === "ventas" && l.op === "update").at(-1).filtros.some((f) => f[0] === "eq" && f[1] === "metodo_pago" && f[2] === ""), true, "el filtro atómico 'sin medio de pago' viaja en el update");
  db.T.ventas[0].metodo_pago = "";
  assert.equal((await cobro("vpp")).status, 409, "cobro Point en curso");
  assert.equal((await cobro("v1", "Point")).status, 403); assert.equal((await cobro("v1", "point")).status, 403); assert.equal((await cobro("v1", "Mercado Pago")).status, 403);
  await cobro("vB"); assert.equal(db.T.ventas.find((v) => v.id === "vB").metodo_pago, "", "otro negocio intacto");
  const p = db.T.pagos_point; p[0].estado = "canceled"; assert.equal((await cobro("vpp")).status, 200, "Point cancelado no bloquea el cobro manual");
});
test("VENTAS: pago mixto — debe sumar el total guardado en la base (no el que diga el navegador)", async () => {
  const db = base();
  const m = (txt) => datos(db, garzon, sol("ventas", ["update", { metodo_pago: txt, estado: "listo" }], ["eq", "id", "v1"]));
  assert.equal((await m("Mixto: Efectivo $4.000 + Débito $5.000")).status, 422);
  assert.equal((await m("Mixto: Efectivo $10.000")).status, 400, "un solo medio no es mixto");
  assert.equal((await m("Mixto: Bitcoin $5.000 + Débito $5.000")).status, 400);
  assert.equal((await m("Mixto: Efectivo $5.000 + Efectivo $5.000")).status, 400);
  assert.equal(db.T.ventas[0].metodo_pago, "");
  assert.equal((await m("Mixto: Efectivo $4.000 + Débito $6.000")).status, 200);
  assert.equal(db.T.ventas[0].metodo_pago, "Mixto: Efectivo $4.000 + Débito $6.000");
});
test("VENTAS: corregir medio de pago — solo admin, nunca sobre ni hacia Point", async () => {
  const db = base();
  const fix = (s, id, mp) => datos(db, s, sol("ventas", ["update", { metodo_pago: mp }], ["eq", "id", id]));
  assert.equal((await fix(garzon, "vpagada", "Débito")).status, 403);
  assert.equal((await fix(admin, "vpoint", "Efectivo")).status, 409, "cobrada con Point");
  assert.equal((await fix(admin, "vpagada", "Point")).status, 403);
  assert.equal(db.T.ventas[2].metodo_pago, "Point"); assert.equal(db.T.ventas[1].metodo_pago, "Efectivo");
  assert.equal((await fix(admin, "vpagada", "Débito")).status, 200); assert.equal(db.T.ventas[1].metodo_pago, "Débito");
});
test("VENTAS: crear — el total sale de las líneas, estado y pago iniciales fijos, fecha del servidor; el catálogo manda en los precios", async () => {
  const db = base();
  const crear = (x) => datos(db, garzon, sol("ventas", ["insert", venta(x)], ["select"], ["single"]));
  assert.equal((await crear({ total: 1 })).status, 422, "total distinto de la suma");
  assert.equal((await crear({ total: 2, items: [linea("Hamburguesa", 2, 1)] })).status, 422, "precio manipulado vs catálogo");
  assert.equal((await crear({ items: [linea("Cena gratis", 2, 5000)] })).status, 422, "producto fuera de catálogo");
  assert.equal((await crear({ estado: "listo" })).status, 403); assert.equal((await crear({ metodo_pago: "Efectivo" })).status, 403);
  assert.equal((await crear({ total: -5, items: [linea("Hamburguesa", -1, 5)] })).status, 400);
  assert.equal((await crear({ descuento: 99 })).status, 403);
  assert.equal(db.T.ventas.length, 5, "nada se insertó");
  const ok = await crear({ created_at: "2000-01-01" }); assert.equal(ok.status, 200);   // la app envía created_at, pero el servidor lo reemplaza
  const f = db.T.ventas.at(-1); assert.equal(f.empresa_id, A); assert.equal(f.estado, "pendiente"); assert.equal(f.metodo_pago, ""); assert.equal(f.total, 10000);
  assert.ok(Date.now() - new Date(f.created_at).getTime() < 5000);
});
test("VENTAS: precios vigentes — Pollo broaster $5.500 y Pollo al horno $5.000 se aceptan; los precios anteriores de respaldo se rechazan", async () => {
  const db = base();
  const crear = (items) => datos(db, garzon, sol("ventas", ["insert", venta({ items, total: items.reduce((s, l) => s + l.cantidad * l.precio_unit, 0) })]));
  assert.equal((await crear([linea("Pollo broaster", 1, 5500), linea("Pollo al horno", 1, 5000)])).status, 200);
  assert.equal((await crear([linea("Pollo al horno", 1, 4990)])).status, 422);
  assert.equal((await crear([linea("pollo broaster", 1, 5500)])).status, 200, "nombre sin distinguir mayúsculas");
});
test("VENTAS: editar comanda — solo antes de cobrar, líneas existentes toleradas aunque el precio cambie, sin Point en curso", async () => {
  const db = base();
  const edit = (id, x) => datos(db, garzon, sol("ventas", ["update", x], ["eq", "id", id]));
  assert.equal((await edit("v1", { total: 1, items: [linea("Hamburguesa", 2, 5000)] })).status, 422);
  assert.equal((await edit("v1", { total: 15000, items: [linea("Hamburguesa", 2, 5000), linea("Pollo broaster", 1, 5000)] })).status, 422, "precio de línea nueva distinto del catálogo");
  assert.equal((await edit("v1", { total: 15500, items: [linea("Hamburguesa", 2, 5000), linea("Pollo broaster", 1, 5500)], mesa: "M2" })).status, 200);
  assert.equal(db.T.ventas[0].mesa, "M2");
  db.T.productos[0].precio = 6000; // el catálogo sube: la comanda ya enviada con 5000 sigue pudiendo editarse
  assert.equal((await edit("v1", { total: 15500, items: [linea("Hamburguesa", 2, 5000), linea("Pollo broaster", 1, 5500)] })).status, 200);
  assert.equal((await edit("vpagada", { total: 1, items: [linea("Hamburguesa", 1, 1)] })).status, 409, "pagada: no se edita");
  assert.equal(db.T.ventas[1].total, 5000);
  assert.equal((await edit("vpp", { total: 5000, items: [linea("Hamburguesa", 1, 5000)] })).status, 409, "Point en curso");
});
test("PROPINAS y CAJA: autor y fecha del servidor, campos limitados, venta del mismo negocio", async () => {
  const db = base();
  const prop = (x) => datos(db, garzon, sol("propinas", ["insert", { empleado: "Ana", monto: 1000, metodo_pago: "Efectivo", ...x }]));
  assert.equal((await prop({ monto: -1 })).status, 400); assert.equal((await prop({ monto: 1.5 })).status, 400); assert.equal((await prop({ extra: 1 })).status, 403);
  assert.equal((await prop({ venta_id: "vB" })).status, 403, "venta de otro negocio");
  assert.equal((await prop({ cajero: "Suplantado", venta_id: "v1" })).status, 200);
  assert.equal(db.T.propinas[0].cajero, "Gaston");
  assert.equal((await datos(db, garzon, sol("propinas", ["delete"], ["eq", "id", "x"]))).status, 403);
  const cierre = (x) => datos(db, admin, sol("cierres_caja", ["insert", { ventas_total: 100, efectivo_fisico: 50, diferencia: -50, ...x }]));
  assert.equal((await cierre({})).status, 200); assert.equal((await cierre({ ventas_total: "1; drop" })).status, 400); assert.equal((await cierre({ extra: 1 })).status, 403);
  assert.equal((await datos(db, admin, sol("aperturas_caja", ["update", { estado: "abierta", monto_inicial: 1e9 }], ["eq", "id", "ap1"]))).status, 403);
  assert.equal((await datos(db, admin, sol("aperturas_caja", ["update", { estado: "cerrada" }], ["eq", "id", "ap1"]))).status, 200);
});
test("PRODUCTOS (admin): solo campos y rangos válidos; el garzón no cambia precios", async () => {
  const db = base();
  const upd = (s, x) => datos(db, s, sol("productos", ["update", x], ["eq", "id", "p1"]));
  assert.equal((await upd(garzon, { precio: 1 })).status, 403);
  assert.equal((await upd(admin, { precio: -1 })).status, 400); assert.equal((await upd(admin, { precio: "5000" })).status, 400); assert.equal((await upd(admin, { secreto: 1 })).status, 403);
  assert.equal((await upd(admin, { precio: 5500 })).status, 200);
});
test("planificar: las reglas de campos también se aplican sin base de datos (reproducciones de Codex)", () => {
  const p = (s, x) => planificar(s, x);
  assert.equal(p(garzon, sol("gastos", ["insert", { monto: 100000, descripcion: "prueba local" }])).ok, false);
  const v = p(garzon, sol("ventas", ["update", { total: -100, estado: "listo", metodo_pago: "Point" }], ["eq", "id", "venta-ficticia"])); assert.equal(v.ok, false); assert.equal(v.status, 403);
});
