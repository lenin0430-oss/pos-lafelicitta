// Rotación coordinada del secreto del bot, probada de extremo a extremo con un bot FALSO local (sin red externa, secretos ficticios).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { secretoBotAceptado, secretoNuevoValido } from "../lib/rotacionSecretoBot.ts";

const ANTIGUO = "antiguo-ficticio-".padEnd(32, "a");
const NUEVO = "nuevo-ficticio-".padEnd(32, "n");

test("fases A/B: el bot acepta actual y anterior; fase C: el anterior se rechaza", () => {
  const faseAB = { actual: NUEVO, anterior: ANTIGUO };
  assert.ok(secretoBotAceptado(NUEVO, faseAB)); assert.ok(secretoBotAceptado(ANTIGUO, faseAB));
  const faseC = { actual: NUEVO };
  assert.ok(secretoBotAceptado(NUEVO, faseC));
  assert.ok(!secretoBotAceptado(ANTIGUO, faseC), "el secreto antiguo debe ser rechazado tras retirarlo");
});
test("secretos vacíos, nulos, cortos o ajenos se rechazan", () => {
  const cfg = { actual: NUEVO, anterior: ANTIGUO };
  for (const x of [undefined, null, "", "corto", NUEVO + "x", "otro-".padEnd(32, "z")]) assert.ok(!secretoBotAceptado(x, cfg), String(x));
  assert.ok(!secretoBotAceptado("corto", { actual: "corto" }), "un secreto configurado demasiado corto nunca vale");
  assert.ok(!secretoBotAceptado("", { actual: "" }));
});
test("el secreto nuevo debe ser largo y distinto del anterior", () => {
  assert.ok(secretoNuevoValido(NUEVO, ANTIGUO)); assert.ok(!secretoNuevoValido(ANTIGUO, ANTIGUO)); assert.ok(!secretoNuevoValido("corto"));
});

// ---- rutas reales del POS contra un bot falso ----
process.env.SESSION_SECRET = "sesion-ficticia-".padEnd(40, "s");
process.env.BOT_EMPRESA_ID = "EMP-1";
const { crearToken } = await import("../lib/restaurante.ts");
const { POST } = await import("../app/api/cierre-whatsapp/route.ts");

function botFalso(cfg) {
  const recibidas = [];
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const ok = secretoBotAceptado(req.headers["x-bot-secret"], cfg.v);
      recibidas.push({ ok, cuerpo: b ? JSON.parse(b) : null });
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" }); res.end(JSON.stringify({ ok }));
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, recibidas, url: `http://127.0.0.1:${srv.address().port}` })));
}
const cookie = (o = {}) => "lf_srv=" + crearToken({ rol: "garzon", nombre: "Ana", empresa_id: "EMP-1", ...o });
const pedir = (headers, cuerpo) => POST(new Request("http://pos.local/api/cierre-whatsapp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(cuerpo) }));

test("coordinación completa POS+bot: antes, durante y después de retirar el secreto anterior", async () => {
  const cfg = { v: { actual: ANTIGUO } };               // estado inicial: bot solo conoce el antiguo
  const bot = await botFalso(cfg); process.env.BOT_URL = bot.url;
  try {
    process.env.BOT_SECRET = ANTIGUO;
    assert.equal((await pedir({ cookie: cookie() }, { turno: 1, ventas_total: 1000 })).status, 200, "antes de rotar");

    cfg.v = { actual: NUEVO, anterior: ANTIGUO };       // fase A: el bot acepta ambos
    assert.equal((await pedir({ cookie: cookie() }, { turno: 2 })).status, 200, "POS aún con el antiguo");
    process.env.BOT_SECRET = NUEVO;                      // fase B: el POS envía el nuevo
    assert.equal((await pedir({ cookie: cookie() }, { turno: 3 })).status, 200, "POS con el nuevo");

    cfg.v = { actual: NUEVO };                           // fase C: el bot retira el antiguo
    assert.equal((await pedir({ cookie: cookie() }, { turno: 4 })).status, 200, "con el nuevo tras retirar el antiguo");
    process.env.BOT_SECRET = ANTIGUO;                    // un POS que siguiera con el antiguo debe fallar
    assert.equal((await pedir({ cookie: cookie() }, { turno: 5 })).status, 502, "el secreto anterior debe ser rechazado por el bot");
    assert.deepEqual(bot.recibidas.map((x) => x.ok), [true, true, true, true, false]);
  } finally { bot.srv.close(); }
});

test("cierre-whatsapp: sin sesión, otra empresa o rol no autorizado NO llegan al bot", async () => {
  const bot = await botFalso({ v: { actual: NUEVO } }); process.env.BOT_URL = bot.url; process.env.BOT_SECRET = NUEVO;
  try {
    assert.equal((await pedir({}, { turno: 1 })).status, 401);
    assert.equal((await pedir({ cookie: "lf_srv=forjada.firma" }, { turno: 1 })).status, 401);
    assert.equal((await pedir({ cookie: cookie({ empresa_id: "OTRA" }) }, { turno: 1 })).status, 403);
    assert.equal((await pedir({ cookie: cookie({ rol: "cocina" }) }, { turno: 1 })).status, 403);
    assert.equal(bot.recibidas.length, 0, "ninguna petición no autorizada debe llegar al bot");
    const r = await pedir({ cookie: cookie() }, { turno: 1, mensaje_custom: "spam", reporte_semanal: true });
    assert.equal(r.status, 200);
    assert.deepEqual(bot.recibidas[0].cuerpo, { turno: 1 }, "el contenido se filtra antes de enviarlo");
  } finally { bot.srv.close(); }
});

test("el POS nunca envía el secreto al cliente ni lo incluye en la respuesta", async () => {
  const bot = await botFalso({ v: { actual: NUEVO } }); process.env.BOT_URL = bot.url; process.env.BOT_SECRET = NUEVO;
  try {
    const r = await pedir({ cookie: cookie() }, { turno: 1 });
    assert.ok(!(await r.text()).includes(NUEVO));
  } finally { bot.srv.close(); }
});
