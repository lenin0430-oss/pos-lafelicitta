import test from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "secreto-de-prueba-para-sesiones-0123456789";
const { crearToken, COOKIE_SESION } = await import("../lib/restaurante.ts");
const { atenderDatos } = await import("../lib/datosServidor.ts");
const { verificarPinAdmin, _limpiar, MAX_INTENTOS } = await import("../lib/verificarPinAdmin.ts");
const { crearClienteDatos } = await import("../lib/clienteDatos.ts");

const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b";
const cookie = (rol, emp = A) => `${COOKIE_SESION}=${crearToken({ rol, nombre: "Pruebas", empresa_id: emp })}`;
const grabador = () => { const reg = []; const db = { from: (t) => { const rec = { t, pasos: [] }; reg.push(rec); const q = new Proxy({}, { get: (_x, m) => m === "then" ? (ok) => ok({ data: [], error: null, status: 200 }) : (...a) => (rec.pasos.push([m, ...a]), q) }); return q; } }; return { db, reg }; };
const req = (cuerpo, { c, ct = "application/json", extra = {} } = {}) => new Request("https://pos.test/api/datos", { method: "POST", headers: { ...(c ? { cookie: c } : {}), "content-type": ct, ...extra }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });
const sel = { tabla: "ventas", pasos: [{ m: "select", a: ["*"] }] };

test("sin cookie, cookie manipulada o vencida: 401 y la base ni se toca", async () => {
  const { db, reg } = grabador();
  assert.equal((await atenderDatos(req(sel), { db })).status, 401);
  const c = cookie("garzon"); const mala = c.slice(0, -3) + "xxx";
  assert.equal((await atenderDatos(req(sel, { c: mala }), { db })).status, 401);
  const forj = `${COOKIE_SESION}=${Buffer.from(JSON.stringify({ rol: "admin", empresa_id: B, nombre: "x", expira: Date.now() + 1e6 })).toString("base64url")}.firmafalsa`;
  assert.equal((await atenderDatos(req(sel, { c: forj }), { db })).status, 401);
  assert.equal(reg.length, 0);
});
test("el negocio y el rol salen de la cookie: un garzón de A siempre consulta A", async () => {
  const { db, reg } = grabador();
  const r = await atenderDatos(req(sel, { c: cookie("garzon") }), { db }); assert.equal(r.status, 200);
  assert.deepEqual(reg[0].pasos.at(-1), ["eq", "empresa_id", A]);
  const r2 = await atenderDatos(req({ tabla: "ventas", pasos: [{ m: "select", a: ["*"] }, { m: "eq", a: ["empresa_id", B] }] }, { c: cookie("garzon") }), { db });
  assert.equal(r2.status, 403); assert.equal(reg.length, 1, "la solicitud rechazada no llegó a la base");
});
test("un garzón no puede administrar aunque lo pida el navegador", async () => {
  const { db, reg } = grabador();
  for (const s of [{ tabla: "productos", pasos: [{ m: "update", a: [{ precio: 1 }] }, { m: "eq", a: ["id", "p"] }] }, { tabla: "usuarios", pasos: [{ m: "select", a: ["*"] }] }, { tabla: "ventas", pasos: [{ m: "delete", a: [] }, { m: "eq", a: ["id", "v"] }] }])
    assert.equal((await atenderDatos(req(s, { c: cookie("garzon") }), { db })).status, 403);
  assert.equal(reg.length, 0);
});
test("CSRF: solo JSON y mismo origen", async () => {
  const { db, reg } = grabador(); const c = cookie("admin");
  assert.equal((await atenderDatos(req(JSON.stringify(sel), { c, ct: "text/plain" }), { db })).status, 415);
  assert.equal((await atenderDatos(req(sel, { c, extra: { "sec-fetch-site": "cross-site" } }), { db })).status, 403);
  assert.equal((await atenderDatos(req(sel, { c, extra: { origin: "https://malo.example" } }), { db })).status, 403);
  assert.equal((await atenderDatos(req(sel, { c, extra: { origin: "https://pos.test", "sec-fetch-site": "same-origin" } }), { db })).status, 200);
  assert.equal(reg.length, 1);
});
test("cuerpo inválido o enorme se rechaza", async () => {
  const { db } = grabador(); const c = cookie("admin");
  assert.equal((await atenderDatos(req("{no es json", { c }), { db })).status, 400);
  assert.equal((await atenderDatos(req("x".repeat(300000), { c }), { db })).status, 413);
});
test("la puerta de plataforma solo se abre con PLATAFORMA_EMPRESA_ID", async () => {
  const { db } = grabador(); const s = { tabla: "empresas", pasos: [{ m: "insert", a: [{ nombre: "N" }] }] };
  assert.equal((await atenderDatos(req(s, { c: cookie("admin") }), { db })).status, 403);
  assert.equal((await atenderDatos(req(s, { c: cookie("admin") }), { db, plataformaEmpresaId: A })).status, 200);
  assert.equal((await atenderDatos(req(s, { c: cookie("garzon") }), { db, plataformaEmpresaId: A })).status, 403);
});

test("PIN de admin: se verifica en el servidor, con límite de intentos, sin devolver datos", async () => {
  _limpiar(); let consultas = 0;
  const db = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => (consultas++, { data: consultas === 1 ? null : { nombre: "Dueña" } }) }) }) }) }) }) };
  const s = { empresa_id: A, nombre: "Caja" };
  assert.equal((await verificarPinAdmin(db, s, "abcd")).status, 400);
  assert.equal((await verificarPinAdmin(db, s, "1234")).status, 401);
  const ok = await verificarPinAdmin(db, s, "1234"); assert.deepEqual(ok, { status: 200, body: { ok: true, nombre: "Dueña" } });
  _limpiar(); db.from = () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) });
  for (let i = 0; i < MAX_INTENTOS; i++) assert.equal((await verificarPinAdmin(db, s, "0000")).status, 401);
  assert.equal((await verificarPinAdmin(db, s, "0000")).status, 429);
});

test("cliente del navegador: con sesión todo va a /api/datos; sin sesión solo la carta pública va directo; canal de tiempo real es nulo", async () => {
  const envios = [], directo = [];
  globalThis.fetch = async (url, init) => { envios.push({ url, cuerpo: JSON.parse(init.body) }); return new Response(JSON.stringify({ data: [{ id: 1 }], error: null, count: null }), { status: 200 }); };
  const real = { from: (t) => { const q = new Proxy({}, { get: (_x, m) => m === "then" ? (ok) => ok({ data: ["directo"], error: null }) : (...a) => (directo.push([t, m, ...a]), q) }); return q; } };
  let sesion = false; const c = crearClienteDatos(real, () => sesion);
  assert.deepEqual((await c.from("empresas").select("id").eq("slug", "x").maybeSingle()).data, ["directo"]);   // pantalla de login (sin sesión)
  assert.equal((await c.from("ventas").select("*")).error?.code ?? null, null);                                 // privada: siempre servidor
  assert.equal(envios.length, 1); assert.equal(envios[0].url, "/api/datos"); assert.equal(envios[0].cuerpo.tabla, "ventas");
  assert.equal(directo.filter((d) => d[0] === "ventas").length, 0, "una tabla privada nunca va directo");
  sesion = true; await c.from("productos").select("*"); assert.equal(envios.length, 2, "con sesión también la carta va por el servidor");
  await c.from("empresas").insert({ nombre: "x" }); assert.equal(envios.length, 3, "escribir nunca va directo");
  const canal = c.channel("x").on("a", {}, () => {}).subscribe(); assert.ok(canal); c.removeChannel(canal);
  globalThis.fetch = async () => { throw new Error("red"); }; assert.equal((await c.from("ventas").select("*")).error.code, "red");
});
