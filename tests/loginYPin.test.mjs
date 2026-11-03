// Login: límite persistente de intentos (por IP y por cuenta) y hash de PIN (modo preparado, sin tocar PIN reales). Datos ficticios.
import test from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "secreto-de-prueba-para-sesiones-0123456789";
const { atenderLogin } = await import("../lib/loginServidor.ts");
const { _limpiarMemoria } = await import("../lib/limiteLogin.ts");
const { hashPin, verificarPinHash } = await import("../lib/pinHash.ts");
const { verificarAdmin, verificarGarzon, buscarAdminPorPin } = await import("../lib/credenciales.ts");
const { crearDb, rpcsSeguridad } = await import("./fakeDb.mjs");

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const PEPPER = "pepper-de-prueba-largo-0123456789-abcdef";
const rpcsLogin = () => ({
  ...rpcsSeguridad(),
  verificar_pin_garzon: ({ p_pin }, T) => ({ data: (T.usuarios.find((u) => u.pin === p_pin && u.rol !== "admin") && { nombre: "Gaston", rol: "garzon", empresa_id: A }) ?? null, error: null }),
  verificar_login_admin: ({ p_email, p_pin }, T) => ({ data: (T.usuarios.find((u) => u.email === p_email && u.pin === p_pin && u.rol === "admin") && { nombre: "Ana", rol: "admin", empresa_id: A }) ?? null, error: null }),
});
const nueva = (rpcs = rpcsLogin()) => crearDb({ usuarios: [{ empresa_id: A, nombre: "Ana", email: "ana@x.test", pin: "9999", rol: "admin" }, { empresa_id: A, nombre: "Gaston", pin: "1234", rol: "garzon" }], eventos_seguridad: [] }, rpcs);
const req = (ip) => new Request("https://pos.test/api/auth/login", { method: "POST", headers: { "x-forwarded-for": ip } });
const admin = (db, ip, pin, email = "ana@x.test") => atenderLogin(req(ip), db, { modo: "admin", email, password: pin });
const garzon = (db, ip, pin) => atenderLogin(req(ip), db, { modo: "pin", pin });

test("LOGIN admin: 5 fallos bloquean la CUENTA (429 + Retry-After) y el PIN correcto tampoco entra durante el bloqueo", async () => {
  const db = nueva();
  for (let i = 0; i < 4; i++) assert.equal((await admin(db, "1.1.1.1", "0000")).status, 401);
  const quinto = await admin(db, "1.1.1.1", "0000"); assert.equal(quinto.status, 429); assert.ok(quinto.retryAfter > 0);
  const bueno = await admin(db, "1.1.1.1", "9999"); assert.equal(bueno.status, 429, "bloqueado: el PIN correcto no se prueba"); assert.equal(bueno.usuario, undefined);
  assert.equal((await admin(db, "2.2.2.2", "9999")).status, 429, "la cuenta sigue bloqueada desde otra IP (no se evade cambiando de IP)");
});
test("LOGIN: control positivo — PIN correcto entra, y un acierto limpia el contador de la cuenta", async () => {
  const db = nueva();
  for (let i = 0; i < 3; i++) await admin(db, "1.1.1.1", "0000");
  const r = await admin(db, "1.1.1.1", "9999"); assert.equal(r.status, 200); assert.equal(r.usuario.rol, "admin");
  for (let i = 0; i < 4; i++) assert.equal((await admin(db, "3.3.3.3", "0000")).status, 401, "el contador de la cuenta empezó de cero");
});
test("LOGIN por PIN (garzón): límite por IP (12 fallos), otra IP no se ve afectada; el bloqueo es persistente (otra 'instancia' = otro objeto db sobre la misma tabla)", async () => {
  const rpcs = rpcsLogin(); const db1 = nueva(rpcs), db2 = nueva(rpcs);   // dos instancias del servidor, mismo almacén
  for (let i = 0; i < 11; i++) assert.equal((await garzon(db1, "9.9.9.9", "0000")).status, 401);
  assert.equal((await garzon(db1, "9.9.9.9", "0001")).status, 429);
  assert.equal((await garzon(db2, "9.9.9.9", "1234")).status, 429, "otra instancia también respeta el bloqueo");
  assert.equal((await garzon(db2, "8.8.8.8", "1234")).status, 200, "otra IP entra normal (sin bloqueo abusivo global)");
});
test("LOGIN: la IP y el PIN nunca se guardan en claro (bitácora y claves)", async () => {
  const rpcs = rpcsLogin(); const db = nueva(rpcs);
  await admin(db, "203.0.113.77", "0000"); await garzon(db, "203.0.113.77", "5678"); await admin(db, "203.0.113.77", "9999");
  const todo = JSON.stringify([db.T.eventos_seguridad, [...rpcs._intentos.keys()]]);
  assert.ok(!todo.includes("203.0.113.77")); assert.ok(!todo.includes("0000") || !/"pin|password/i.test(todo)); assert.ok(!todo.includes("5678")); assert.ok(!todo.includes("ana@x.test"));
  assert.ok(db.T.eventos_seguridad.length >= 3);
});
test("LOGIN: si faltan las funciones de 07b, cae al límite en memoria (sigue limitando) en vez de dejar el login abierto", async () => {
  _limpiarMemoria(); const db = crearDb({ usuarios: [], eventos_seguridad: [] }, { verificar_login_admin: () => ({ data: null, error: null }) });
  let ultimo; for (let i = 0; i < 5; i++) ultimo = await admin(db, "4.4.4.4", "0000");
  assert.equal(ultimo.status, 429);
});
test("LOGIN: solicitudes inválidas no abren nada", async () => {
  const db = nueva();
  assert.equal((await atenderLogin(req("1.1.1.1"), db, { modo: "otro" })).status, 400);
  assert.equal((await atenderLogin(req("1.1.1.1"), db, { modo: "admin", email: "", password: "" })).status, 400);
  assert.equal((await garzon(db, "1.1.1.1", "12345")).status, 401);
});

test("PIN HASH: hash con sal y pepper; verifica el correcto y rechaza lo demás", async () => {
  const h1 = await hashPin("1234", PEPPER), h2 = await hashPin("1234", PEPPER);
  assert.notEqual(h1, h2, "sal distinta"); assert.ok(h1.startsWith("scrypt1$")); assert.ok(!h1.includes("1234"));
  assert.equal(await verificarPinHash("1234", h1, PEPPER), true);
  assert.equal(await verificarPinHash("1235", h1, PEPPER), false);
  assert.equal(await verificarPinHash("1234", h1, PEPPER + "x"), false, "sin el pepper correcto no se verifica");
  assert.equal(await verificarPinHash("1234", "basura", PEPPER), false); assert.equal(await verificarPinHash("1234", null, PEPPER), false);
  await assert.rejects(hashPin("1234", "corto"));
});
test("PIN HASH: modos — legacy no cambia nada; mixto acepta hash o PIN antiguo; hash exige hash", async () => {
  process.env.PIN_PEPPER = PEPPER;
  const hash = await hashPin("4321", PEPPER);
  const db = crearDb({ usuarios: [
    { empresa_id: A, nombre: "Ana", email: "ana@x.test", pin: "9999", pin_hash: null, rol: "admin", activo: true },
    { empresa_id: A, nombre: "Luis", email: "luis@x.test", pin: "", pin_hash: hash, rol: "admin", activo: true },
    { empresa_id: A, nombre: "Gaston", pin: "1234", pin_hash: null, rol: "garzon", activo: true },
    { empresa_id: A, nombre: "Inactivo", pin: "7777", pin_hash: null, rol: "garzon", activo: false }] }, rpcsLogin());
  assert.equal((await verificarAdmin(db, "ana@x.test", "9999", "mixto"))?.nombre, "Ana", "transición: sin hash usa el PIN antiguo");
  assert.equal((await verificarAdmin(db, "luis@x.test", "4321", "mixto"))?.nombre, "Luis");
  assert.equal(await verificarAdmin(db, "luis@x.test", "0000", "mixto"), null);
  assert.equal(await verificarAdmin(db, "ana@x.test", "9999", "hash"), null, "modo hash: sin hash no entra");
  assert.equal((await verificarAdmin(db, "luis@x.test", "4321", "hash"))?.nombre, "Luis");
  assert.equal((await verificarGarzon(db, "1234", "mixto"))?.nombre, "Gaston"); assert.equal(await verificarGarzon(db, "7777", "mixto"), null);
  assert.equal((await verificarAdmin(db, "ana@x.test", "9999", "legacy"))?.nombre, "Ana", "legacy usa la RPC de siempre");
  assert.equal(await buscarAdminPorPin(db, A, "9999", "legacy"), "Ana"); assert.equal(await buscarAdminPorPin(db, A, "4321", "mixto"), "Luis"); assert.equal(await buscarAdminPorPin(db, "otro", "9999", "legacy"), null);
});
