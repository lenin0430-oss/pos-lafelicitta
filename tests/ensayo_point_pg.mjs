// Ensayo con DOS conexiones reales a PostgreSQL LOCAL y un proveedor Point SIMULADO (sin red, sin Mercado Pago, datos ficticios).
// Usa la orquestación REAL de lib/pointCobro.ts (transpilada) con puertos que hablan SQL contra la base con 03-modelo + 04 + 04b + 07c.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { iniciarCobroPoint } from "./pointCobro.mjs";
const run = promisify(execFile);
const DB = "orq_" + process.pid, E = "aaaaaaaa-0000-0000-0000-00000000000a", V = "11111111-1111-1111-1111-111111111111";
const SQLDIR = process.env.SQLDIR ?? ".";
const base = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=0", "-v", "VERBOSITY=verbose"];
const sh = (db, sql) => execFileSync("psql", [...base, "-d", db, "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const psql = async (sql) => { try { const r = await run("psql", [...base, "-d", DB, "-c", sql]); return { out: r.stdout.trim(), err: r.stderr }; } catch (e) { return { out: "", err: String(e.stderr ?? e.message) }; } };
let fallos = 0; const ok = (m) => console.log("  OK   " + m); const ko = (m) => { console.log("  FALLA " + m); fallos++; };
const igual = (m, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : ko(`${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`));

function preparar() {
  sh("postgres", `drop database if exists ${DB}`); sh("postgres", `create database ${DB}`);
  sh(DB, `create table ventas (id uuid primary key, empresa_id uuid, total integer, metodo_pago text default '', estado text default 'pendiente', estado_pago text not null default 'pendiente', pagado_at timestamptz, items jsonb default '[]', mesa text, mesero text, personas int);
          create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text not null, restaurante_id text, monto int default 1, estado text default 'reservado', mp_order_id text unique, updated_at timestamptz, detalle text);
          insert into ventas (id,empresa_id,total,items,mesa) values ('${V}','${E}',10000,'[{"nombre":"H","cantidad":2,"precio_unit":5000}]','M1');`);
  for (const f of ["04_pagos_point_reserva.sql", "04b_pagos_point_aislamiento.sql", "07c_cobro_manual_atomico.sql"]) execFileSync("psql", ["-X", "-q", "-d", DB, "-f", `${SQLDIR}/${f}`], { stdio: "ignore" });
}
const cols = "id, venta_id, monto, estado, mp_order_id, clave_idempotencia, referencia_externa";
const puertoPagos = {
  async reservar({ restauranteId, ventaId, monto }) {
    const id = crypto.randomUUID(), ref = `venta_${ventaId}_${id.slice(0, 8)}`.slice(0, 64);
    const r = await psql(`insert into pagos_point (id, restaurante_id, venta_id, monto, estado, referencia_externa) values ('${id}','${restauranteId}','${ventaId}',${monto},'reservado','${ref}') returning row_to_json((select x from (select ${cols}) x))`);
    if (r.out) return { reserva: JSON.parse(r.out.split("\n")[0]), creada: true };
    const m = r.err.match(/ERROR:\s+(\w{5}):\s+(.*)/);
    if (m && m[1] === "23505") { const ex = await psql(`select row_to_json((select x from (select ${cols}) x)) from pagos_point where restaurante_id='${restauranteId}' and venta_id='${ventaId}' and estado in ('reservado','created','at_terminal') order by id limit 1`); return { reserva: JSON.parse(ex.out), creada: false }; }
    const e = new Error(m ? m[2] : r.err); e.code = m ? m[1] : undefined; throw e;     // misma forma que PostgREST: { code, message }
  },
  async guardarOrden(id, o) { await psql(`update pagos_point set mp_order_id='${o.mp_order_id}', estado='${o.estado}' where id='${id}'`); },
  async cerrar(id, estado, detalle) { await psql(`update pagos_point set estado='${estado}', detalle='${detalle}' where id='${id}'`); },
};
function proveedor() {
  const llamadas = [], ordenes = new Map();
  return { llamadas, ordenes, async crearOrden({ clave, referencia, monto }) {
    llamadas.push({ clave, monto });
    if (!ordenes.has(clave)) ordenes.set(clave, { id: "ORD_" + ordenes.size, status: "created", monto, referencia });   // idempotente: misma clave → misma orden
    return { ok: true, orden: ordenes.get(clave) };
  } };
}
const entrada = (monto, total) => ({ restauranteId: E, ventaId: V, monto, terminalId: "T1", venta: { total, estado: "pendiente", estado_pago: "pendiente" } });
const editar = (seg) => run("psql", [...base, "-d", DB, "-c", `begin; select editar_comanda_venta('${E}','${V}',15000,'[{"nombre":"H","cantidad":3,"precio_unit":5000}]'::jsonb); select pg_sleep(${seg}); commit`]);

console.log("== Escenario 1: el servidor leyó total=10000; otra transacción edita la venta a 15000 (confirma a los 1,5 s) mientras se reserva por 10000");
preparar(); { const mp = proveedor();
  const ed = editar(1.5); await new Promise((r) => setTimeout(r, 400));
  const r = await iniciarCobroPoint(puertoPagos, mp, entrada(10000, 10000)); await ed;
  igual("respuesta 409 estable", [r.ok, r.status], [false, 409]); ok("mensaje: " + r.error);
  igual("CERO llamadas al proveedor", mp.llamadas.length, 0);
  igual("ninguna reserva queda en la base", (await psql("select count(*) from pagos_point")).out, "0");
  igual("la venta quedó con el total nuevo", (await psql(`select total from ventas where id='${V}'`)).out, "15000"); }

console.log("== Escenario 2: terminó la edición y el cliente pide el total NUEVO (15000)");
{ const mp = proveedor();
  const r = await iniciarCobroPoint(puertoPagos, mp, entrada(15000, 15000));
  igual("cobro iniciado", [r.ok, r.status], [true, 200]); igual("UNA llamada al proveedor por 15000", mp.llamadas.map((l) => l.monto), [15000]);
  igual("reserva por 15000 con orden guardada", (await psql("select monto||'/'||mp_order_id is not null from pagos_point")).out, "t");
  const r2 = await iniciarCobroPoint(puertoPagos, mp, entrada(15000, 15000));
  igual("reintento idempotente: misma orden, sin segunda reserva", [r2.ok, r2.orderId === r.orderId, (await psql("select count(*) from pagos_point")).out], [true, true, "1"]);
  igual("una sola clave de idempotencia usada", new Set(mp.llamadas.map((l) => l.clave)).size, 1); }

console.log("== Escenario 3: reserva ANTES de la edición — gana la reserva (venta 10000); la edición espera y luego se rechaza");
preparar(); { const mp = proveedor();
  const reservaLenta = run("psql", [...base, "-d", DB, "-c", `begin; insert into pagos_point (restaurante_id, venta_id, monto, estado) values ('${E}','${V}',10000,'reservado'); select pg_sleep(1.5); commit`]);
  await new Promise((r) => setTimeout(r, 400));
  const ed = await psql(`select editar_comanda_venta('${E}','${V}',15000,'[{"nombre":"H","cantidad":3,"precio_unit":5000}]'::jsonb)`); await reservaLenta;
  igual("la edición responde point_en_curso", ed.out, "point_en_curso"); igual("total intacto 10000", (await psql(`select total from ventas where id='${V}'`)).out, "10000"); }

console.log("== Escenario 4: el cobro manual gana; la reserva Point se rechaza con 409 'ya cobrada' y NO llega al proveedor");
preparar(); { const mp = proveedor();
  const manual = run("psql", [...base, "-d", DB, "-c", `begin; select cobrar_venta_manual('${E}','${V}','Efectivo'); select pg_sleep(1.5); commit`]);
  await new Promise((r) => setTimeout(r, 400));
  const r = await iniciarCobroPoint(puertoPagos, mp, entrada(10000, 10000)); await manual;
  igual("409 «ya está cobrada»", [r.ok, r.status, r.error], [false, 409, "La venta ya está cobrada"]); igual("cero llamadas al proveedor", mp.llamadas.length, 0);
  igual("queda pagada en efectivo y sin reservas", (await psql(`select metodo_pago||'/'||estado_pago||'/'||(select count(*) from pagos_point) from ventas where id='${V}'`)).out, "Efectivo/pagado/0"); }

sh("postgres", `drop database ${DB}`);
console.log(fallos ? `\nRESULTADO: ${fallos} FALLA(S)` : "\nRESULTADO: TODO OK"); process.exit(fallos);
