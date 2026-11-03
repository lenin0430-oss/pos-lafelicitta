#!/usr/bin/env node
// Prueba de la LLAVE PÚBLICA (anon) del proyecto de PRUEBAS. Dos modos separados. Nunca imprime llaves ni filas (solo clasificación, código y NÚMERO de filas).
//
//   inventario (por defecto): SOLO LECTURA. GET sobre tablas y RPC de consulta (verificar_pin_garzon, verificar_login_admin, login_bloqueado_hasta).
//   escrituras  (--escrituras + CONFIRMO_ESCRITURAS_PRUEBA=SI): OPERACIONES VÁLIDAS que pueden ESCRIBIR si el acceso está abierto (INSERT/PATCH/DELETE/RPC de escritura)
//               con datos ficticios marcados "e2e-llave-publica" sobre el negocio A de la semilla. Al final imprime el SQL de comprobación de persistencia que se
//               ejecuta con credenciales de servicio en el editor SQL de pruebas (la API REST no comparte la transacción de una conexión SQL).
//
// Uso: SUPABASE_URL=https://wcoaulvlicfimdfmwhid.supabase.co SUPABASE_ANON_KEY=<llave pública de prueba> node scripts/prueba-navegador/llave_publica.mjs [--escrituras] [etiqueta]
//
// Clasificación por sonda:  DENEGADO (401/403 o 42501)  ·  ABIERTO (la operación válida se ejecutó / hay filas visibles)  ·  INCONCLUSO (cualquier otra cosa:
// columna o tabla inexistente, firma RPC incorrecta, 404, error de validación o de datos, 200 sin filas, clave inválida). INCONCLUSO NO prueba ni permiso ni denegación.
// Veredicto global: ABIERTO en un objeto privado → salida 1. Si no hay ABIERTO pero hay INCONCLUSO o falta un objeto esperado → «VERIFICACIÓN INCOMPLETA», salida 3.
// Solo si TODAS las sondas esperadas son DENEGADO → salida 0.
const ORIGEN_PRUEBAS = "https://wcoaulvlicfimdfmwhid.supabase.co";
const args = process.argv.slice(2); const ESCRIBIR = args.includes("--escrituras"); const etiqueta = args.find((a) => !a.startsWith("--")) ?? "sin etiqueta";
const KEY = process.env.SUPABASE_ANON_KEY ?? "";

// 1) Destino: origen EXACTO, antes de transmitir ninguna llave.
let u; try { u = new URL(process.env.SUPABASE_URL ?? ""); } catch { console.error("SUPABASE_URL inválida."); process.exit(2); }
if (u.origin !== ORIGEN_PRUEBAS || u.username || u.password || u.port || !["", "/"].includes(u.pathname) || u.search || u.hash) { console.error(`Destino no permitido: solo ${ORIGEN_PRUEBAS} (sin usuario, puerto, ruta ni parámetros).`); process.exit(2); }
// 2) Clave: debe ser la pública prevista, nunca de servicio.
if (!KEY) { console.error("Falta SUPABASE_ANON_KEY (llave pública de pruebas)."); process.exit(2); }
function rolDeClave(k) {
  if (k.startsWith("sb_publishable_")) return "anon"; if (k.startsWith("sb_secret_")) return "service_role";
  const p = k.split("."); if (p.length !== 3) return null;
  try { return JSON.parse(Buffer.from(p[1], "base64url").toString("utf8")).role ?? null; } catch { return null; }
}
if (rolDeClave(KEY) !== "anon") { console.error("La clave no es una llave pública (anon/publishable). No se transmite."); process.exit(2); }
if (ESCRIBIR && process.env.CONFIRMO_ESCRITURAS_PRUEBA !== "SI") { console.error("Las pruebas de escritura requieren CONFIRMO_ESCRITURAS_PRUEBA=SI."); process.exit(2); }

const A = "e2e00000-0000-4000-8000-00000000000a", VENTA_A1 = "e2e50000-0000-4000-8000-0000000000a1", USR_A2 = "e2e10000-0000-4000-8000-0000000000a2";
const MARCA = "e2e-llave-publica";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const PUBLICAS = new Set(["productos", "categorias", "empresas"]);          // lectura pública por diseño (07); sus ESCRITURAS deben estar denegadas
const TABLAS = ["usuarios","ventas","gastos","propinas","aperturas_caja","cierres_caja","pagos_point","mp_cuentas","pedidos","pedido_items","configuracion_empresa","mesas","insumos","recetas","stock_insumos","stock_compras","stock_movimientos","intentos_login","aprobaciones_operacion","eventos_seguridad","respaldo_ventas_pre03","respaldo_pagos_point_pre03","productos","categorias","empresas"];
const INCONCLUSOS = new Set(["42703","PGRST204","PGRST202","PGRST205","42883","42P01","23502","23503","23505","23514","22P02","PGRST100","PGRST102","PGRST301","PGRST303"]);

async function llamar(m, ruta, body, extra = {}) {
  let r; try { r = await fetch(ORIGEN_PRUEBAS + ruta, { method: m, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { return { st: 0, j: null, red: true }; }
  let j = null; try { j = await r.json(); } catch {} return { st: r.status, j };
}
// → [clase, detalle]
function clasificar({ st, j, red }, tipo) {
  if (red || st === 0) return ["INCONCLUSO", "sin respuesta"];
  const code = j?.code ?? "";
  if (INCONCLUSOS.has(code) || st === 404) return ["INCONCLUSO", `http ${st}${code ? " " + code : ""}`];
  if (code === "42501" || st === 403 || (st === 401 && !code)) return ["DENEGADO", `http ${st}${code ? " " + code : ""}`];
  if (st === 401) return ["INCONCLUSO", `http 401 ${code}`];
  if (st >= 200 && st < 300) {
    const n = Array.isArray(j) ? j.length : null;
    if (tipo === "leer") return n > 0 ? ["ABIERTO", `${n} filas visibles`] : ["INCONCLUSO", "200 sin filas (no prueba aislamiento)"];
    if (tipo === "modificar" || tipo === "borrar") return n > 0 ? ["ABIERTO", `${n} filas afectadas`] : ["INCONCLUSO", "200 sin filas afectadas"];
    if (tipo === "insertar") return st === 201 ? ["ABIERTO", "fila creada"] : ["INCONCLUSO", `http ${st}`];
    if (tipo === "rpc") return ["ABIERTO", "función ejecutada"];
  }
  return ["INCONCLUSO", `http ${st}${code ? " " + code : ""}`];
}
const filas = [];
function reg(objeto, op, esperado, [clase, detalle]) { filas.push({ objeto, operacion: op, esperado, resultado: clase, detalle }); }

// ---------- Inventario (solo lectura) ----------
for (const t of TABLAS) {
  const r = await llamar("GET", `/rest/v1/${t}?select=*&limit=3`);
  const [c, d] = clasificar(r, "leer");
  if (PUBLICAS.has(t)) reg(t, "leer", "público por diseño", c === "ABIERTO" ? ["PUBLICO_POR_DISENO", d] : [c, d]);
  else reg(t, "leer", "DENEGADO", [c, d]);
}
for (const [f, a] of [["verificar_pin_garzon", { p_pin: "0000" }], ["verificar_login_admin", { p_email: "nadie@example.test", p_pin: "0000" }], ["login_bloqueado_hasta", { p_clave: MARCA }]]) {
  reg(`rpc ${f}`, "ejecutar (lectura)", "DENEGADO", clasificar(await llamar("POST", `/rest/v1/rpc/${f}`, a), "rpc"));
}

// ---------- Escrituras con datos válidos y ficticios (opcional) ----------
if (ESCRIBIR) {
  const ID = (n) => `e2e90000-0000-4000-8000-00000000${n}`;
  const inserts = {
    gastos: { id: ID("0001"), categoria: MARCA, descripcion: MARCA, monto: 1, empresa_id: A },
    propinas: { id: ID("0002"), empresa_id: A, empleado: MARCA, monto: 1 },
    aperturas_caja: { id: ID("0003"), fecha: "2026-01-01", monto_inicial: 1, cajero: MARCA, estado: "abierta", empresa_id: A },
    ventas: { id: ID("0004"), numero: 99001, mesa: MARCA, total: 1, items: [{ nombre: MARCA, cantidad: 1, precio_unit: 1 }], estado: "pendiente", empresa_id: A },
    usuarios: { id: ID("0005"), empresa_id: A, nombre: MARCA, email: `${MARCA}@example.test`, rol: "garzon", activo: true, pin: "0000" },
    pagos_point: { id: ID("0006"), venta_id: VENTA_A1, restaurante_id: A, monto: 5500, estado: "failed" },
    productos: { id: ID("0007"), empresa_id: A, nombre: MARCA, precio: 1, disponible: true, activo: true },
  };
  for (const [t, fila] of Object.entries(inserts)) reg(t, "insertar", "DENEGADO", clasificar(await llamar("POST", `/rest/v1/${t}`, fila, { Prefer: "return=representation" }), "insertar"));
  const mods = [["ventas", `id=eq.${VENTA_A1}`, { nota: MARCA }], ["usuarios", `id=eq.${USR_A2}`, { nombre: MARCA }], ["productos", `empresa_id=eq.${A}&nombre=eq.E2E%20Bebida%20A`, { precio: 1 }], ["gastos", `id=eq.${ID("0001")}`, { descripcion: MARCA + "-mod" }]];
  for (const [t, f, b] of mods) reg(t, "modificar", "DENEGADO", clasificar(await llamar("PATCH", `/rest/v1/${t}?${f}`, b, { Prefer: "return=representation" }), "modificar"));
  for (const t of Object.keys(inserts)) reg(t, "borrar (solo fila marcada)", "DENEGADO", clasificar(await llamar("DELETE", `/rest/v1/${t}?id=eq.${inserts[t].id}`, undefined, { Prefer: "return=representation" }), "borrar"));
  const rpcs = [["registrar_fallo_login", { p_clave: MARCA, p_max: 5, p_ventana_s: 60, p_bloqueo_s: 60 }], ["limpiar_intentos_login", { p_clave: MARCA }],
    ["consumir_aprobacion", { p_token_hash: MARCA, p_empresa: A, p_tipo: "gasto", p_actor: MARCA, p_monto: 1, p_huella: MARCA }],
    ["cobrar_venta_manual", { p_empresa: A, p_venta: VENTA_A1, p_medio: "Efectivo", p_mixto_suma: null }]];
  for (const [f, a] of rpcs) reg(`rpc ${f}`, "ejecutar (escritura)", "DENEGADO", clasificar(await llamar("POST", `/rest/v1/rpc/${f}`, a), "rpc"));
}

console.log(`# Llave pública · ${etiqueta} · modo ${ESCRIBIR ? "inventario + escrituras" : "inventario (solo lectura)"} · ${new Date().toISOString()}`);
console.table(filas);
const abiertos = filas.filter((f) => f.resultado === "ABIERTO");
const inconclusos = filas.filter((f) => f.resultado === "INCONCLUSO");
const esperados = filas.filter((f) => f.esperado === "DENEGADO");
const ok = esperados.every((f) => f.resultado === "DENEGADO");
if (ESCRIBIR) console.log(`\nPersistencia (ejecutar con credenciales de servicio en el SQL de pruebas):\n  select 'gastos' t, count(*) from gastos where categoria='${MARCA}' union all select 'propinas', count(*) from propinas where empleado='${MARCA}' union all select 'ventas', count(*) from ventas where mesa='${MARCA}' or nota='${MARCA}' union all select 'usuarios', count(*) from usuarios where nombre='${MARCA}' union all select 'intentos_login', count(*) from intentos_login where clave='${MARCA}';\n  Si algo aparece, el acceso estaba abierto: borrar las filas marcadas y restaurar la venta ${VENTA_A1} desde el respaldo.`);
if (abiertos.some((f) => f.esperado === "DENEGADO")) { console.log(`\nACCESO PÚBLICO ABIERTO en ${abiertos.length} sondas.`); process.exit(1); }
if (!ok) { console.log(`\nVERIFICACIÓN INCOMPLETA: ${inconclusos.length} sondas inconclusas (error de columna/firma, objeto ausente, 404 o respuesta sin filas). No es un aprobado.`); process.exit(3); }
console.log(`\nAPROBADO: las ${esperados.length} sondas esperadas fueron DENEGADAS (${ESCRIBIR ? "lectura y escritura" : "solo lectura: no demuestra denegación de escrituras"}).`);
