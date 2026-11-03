#!/usr/bin/env node
// Simulador local de Mercado Pago Point (Orders API) para pruebas en navegador. NO es Mercado Pago, NO cobra nada.
// Uso:  node scripts/simulador-point.mjs        (escucha SOLO en 127.0.0.1:4010; cambia con SIM_PORT)
//       POS:  MP_SIMULADOR_URL=http://127.0.0.1:4010  (+ MP_WEBHOOK_SECRET de PRUEBA; ver docs/PRUEBA_NAVEGADOR.md)
// Panel: http://127.0.0.1:4010/   Solo acepta tokens "TEST-…" (rechaza cualquier token real con 401).
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const PUERTO = Number(process.env.SIM_PORT || 4010);
const TERMINAL = process.env.SIM_TERMINAL || "TERM-FICTICIA";

const FINALES = ["processed", "failed", "canceled", "expired"];
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const leer = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });
const vista = (o) => ({ id: o.id, status: o.status, type: "point", external_reference: o.external_reference, transactions: o.transactions });

export function crearServidor() {
  // Estado propio de cada servidor (así las pruebas no se contaminan entre sí).
  const ordenes = new Map();      // id -> orden
  const porClave = new Map();     // X-Idempotency-Key -> id  (misma clave => misma orden, como Mercado Pago)
  const registro = [];            // bitácora de llamadas (para evidencia)
  let proxima = "normal";         // escenario de la PRÓXIMA creación (se consume)
  let n = 0;
  const log = (m) => { registro.push({ t: new Date().toISOString(), ...m }); if (registro.length > 500) registro.shift(); };
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x"); const ruta = u.pathname;
    if (req.socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return json(res, 403, { error: "solo local" });

    // ---- panel y control (sin token) ----
    if (req.method === "GET" && ruta === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(PANEL); }
    if (ruta === "/__estado") return json(res, 200, { proxima, ordenes: [...ordenes.values()], llamadas: registro.slice(-60), total_ordenes: ordenes.size });
    if (req.method === "POST" && ruta === "/__proxima") { const b = await leer(req); proxima = b.escenario || "normal"; return json(res, 200, { proxima }); }
    if (req.method === "POST" && ruta === "/__reiniciar") { ordenes.clear(); porClave.clear(); registro.length = 0; proxima = "normal"; return json(res, 200, { ok: true }); }
    const mt = ruta.match(/^\/__orden\/([^/]+)$/);
    if (req.method === "POST" && mt) {
      const o = ordenes.get(mt[1]); if (!o) return json(res, 404, { error: "no existe" });
      const b = await leer(req);
      if (!["created", "at_terminal", ...FINALES].includes(b.estado)) return json(res, 400, { error: "estado inválido" });
      if (FINALES.includes(o.status) && b.estado !== o.status) return json(res, 409, { error: "la orden ya está en estado final" });
      o.status = b.estado; log({ evento: "estado", id: o.id, estado: o.status }); return json(res, 200, vista(o));
    }
    if (req.method === "POST" && ruta === "/__webhook") {   // envía un webhook FIRMADO al POS (como lo haría Mercado Pago)
      const b = await leer(req); const secreto = b.secreto || process.env.SIM_WEBHOOK_SECRET;
      if (!secreto || !b.orderId || !b.posUrl) return json(res, 400, { error: "orderId, posUrl y secreto (o SIM_WEBHOOK_SECRET) son obligatorios" });
      if (b.firmaInvalida !== true) { /* firma válida por defecto */ }
      const ts = String(Date.now()), rid = randomUUID();
      const v1 = b.firmaInvalida ? "0".repeat(64) : createHmac("sha256", secreto).update(`id:${String(b.orderId).toLowerCase()};request-id:${rid};ts:${ts};`).digest("hex");
      try {
        const r = await fetch(`${b.posUrl.replace(/\/$/, "")}/api/point/webhook?data.id=${encodeURIComponent(b.orderId)}`, {
          method: "POST", headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid }, body: JSON.stringify({ type: "order", data: { id: b.orderId } }) });
        log({ evento: "webhook", orderId: b.orderId, firmaInvalida: !!b.firmaInvalida, respuestaPOS: r.status });
        return json(res, 200, { respuestaPOS: r.status });
      } catch (e) { return json(res, 502, { error: String(e.message) }); }
    }

    // ---- API simulada de Mercado Pago (exige token TEST-) ----
    const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!tok.startsWith("TEST-")) { log({ evento: "rechazado_token_no_test", ruta }); return json(res, 401, { message: "El simulador solo acepta tokens TEST-…" }); }
    if (req.method === "GET" && ruta === "/terminals/v1/list") return json(res, 200, { data: { terminals: [{ id: TERMINAL, operating_mode: "PDV" }] } });

    if (req.method === "POST" && ruta === "/v1/orders") {
      const clave = req.headers["x-idempotency-key"]; const b = await leer(req);
      if (!clave) return json(res, 400, { errors: [{ code: "idempotency_key_required" }] });
      const escenario = proxima; proxima = "normal";
      log({ evento: "crear", escenario, clave: String(clave).slice(0, 8), monto: b?.transactions?.payments?.[0]?.amount });
      if (escenario === "error_500") return json(res, 500, { errors: [{ code: "internal_error" }] });                       // NO crea la orden
      if (escenario === "cola_ocupada") return json(res, 409, { errors: [{ code: "already_queued_order_on_terminal" }] });  // NO crea la orden
      let o = ordenes.get(porClave.get(clave));
      if (!o) {
        o = { id: `ORD-SIM-${String(++n).padStart(4, "0")}`, status: "created", external_reference: b.external_reference, transactions: { payments: [{ amount: b?.transactions?.payments?.[0]?.amount }] }, terminal: b?.config?.point?.terminal_id };
        ordenes.set(o.id, o); porClave.set(clave, o.id);
      }
      if (escenario === "perder_respuesta") { log({ evento: "respuesta_perdida", id: o.id }); req.socket.destroy(); return; }  // la orden SÍ existe; la respuesta nunca llega
      return json(res, 201, vista(o));
    }
    const mo = ruta.match(/^\/v1\/orders\/([^/]+)$/);
    if (req.method === "GET" && mo) { const o = ordenes.get(mo[1]); log({ evento: "consulta", id: mo[1], status: o?.status }); return o ? json(res, 200, vista(o)) : json(res, 404, { errors: [{ code: "not_found" }] }); }
    return json(res, 404, { error: "ruta no simulada", ruta });
  });
}

const PANEL = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Simulador Point (PRUEBA)</title>
<style>body{font:15px system-ui;margin:16px;max-width:900px;color:#0b1f3a}h1{font-size:20px}.t{background:#ffefd5;border:1px solid #f59e0b;padding:8px 12px;border-radius:8px}button,select,input{font:inherit;padding:8px 12px;margin:3px;border-radius:8px;border:1px solid #94a3b8;background:#fff;min-height:40px}button{background:#1d4ed8;color:#fff;border:0}button.o{background:#ea580c}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left;font-size:14px}pre{background:#f1f5f9;padding:8px;overflow:auto;max-height:260px}</style>
<h1>Simulador Mercado Pago Point — SOLO PRUEBAS</h1><p class="t">No es Mercado Pago. No se cobra nada. Solo acepta tokens TEST-.</p>
<p>Próxima creación de orden: <select id="esc"><option value="normal">normal</option><option value="perder_respuesta">perder respuesta (la orden se crea, el POS no recibe respuesta)</option><option value="error_500">error 500 (no crea orden)</option><option value="cola_ocupada">máquina con cobro pendiente (409)</option></select> <button onclick="prox()">Fijar</button> <span id="p"></span></p>
<p>Webhook → POS: <input id="pos" value="http://localhost:3000" size="24"> secreto de prueba: <input id="sec" type="password" size="16" placeholder="MP_WEBHOOK_SECRET de PRUEBA"> <label><input type="checkbox" id="mala" style="min-height:0"> firma inválida</label></p>
<table><thead><tr><th>Orden</th><th>Estado</th><th>Monto</th><th>Referencia</th><th>Acciones</th></tr></thead><tbody id="o"></tbody></table>
<p><button class="o" onclick="fetch('/__reiniciar',{method:'POST'}).then(r)">Reiniciar simulador</button></p><h3>Bitácora</h3><pre id="l"></pre>
<script>const $=(i)=>document.getElementById(i);const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});
function prox(){post('/__proxima',{escenario:$('esc').value}).then(r)}
function est(id,e){post('/__orden/'+id,{estado:e}).then(r)}
async function wh(id){const x=await post('/__webhook',{orderId:id,posUrl:$('pos').value,secreto:$('sec').value,firmaInvalida:$('mala').checked}).then(r=>r.json());alert('Respuesta del POS: '+JSON.stringify(x));r()}
async function r(){const d=await fetch('/__estado').then(x=>x.json());$('p').textContent='(actual: '+d.proxima+')';
$('o').innerHTML=d.ordenes.map(o=>'<tr><td>'+o.id+'</td><td><b>'+o.status+'</b></td><td>'+(o.transactions.payments[0].amount)+'</td><td>'+o.external_reference+'</td><td>'+['at_terminal','processed','failed','canceled','expired'].map(e=>'<button onclick="est(\\''+o.id+'\\',\\''+e+'\\')">'+e+'</button>').join('')+'<button class="o" onclick="wh(\\''+o.id+'\\')">enviar webhook</button></td></tr>').join('')||'<tr><td colspan=5>Sin órdenes</td></tr>';
$('l').textContent=d.llamadas.map(x=>JSON.stringify(x)).join('\\n')}
r();setInterval(r,2500)</script>`;

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("simulador-point.mjs")) {
  crearServidor().listen(PUERTO, "127.0.0.1", () => console.log(`Simulador Point (PRUEBA) en http://127.0.0.1:${PUERTO}  — no cobra nada`));
}
