#!/usr/bin/env node
// Comprueba qué puede hacer la LLAVE PÚBLICA (anon) del proyecto de PRUEBAS. No imprime datos ni llaves: solo estado HTTP, código de error y NÚMERO de filas.
// Uso: SUPABASE_URL=https://wcoaulvlicfimdfmwhid.supabase.co SUPABASE_ANON_KEY=<llave pública de prueba> node scripts/prueba-navegador/llave_publica.mjs [etiqueta]
// Se niega a correr contra un proyecto que no sea el de pruebas. Sin escrituras: los intentos de escritura usan un id inexistente o un cuerpo inválido.
const URL_ = process.env.SUPABASE_URL ?? "", KEY = process.env.SUPABASE_ANON_KEY ?? "";
if (!URL_.includes("wcoaulvlicfimdfmwhid")) { console.error("Solo el proyecto de pruebas (wcoaulvlicfimdfmwhid)."); process.exit(2); }
if (!KEY) { console.error("Falta SUPABASE_ANON_KEY (llave pública de pruebas)."); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const NADA = "00000000-0000-0000-0000-000000000000";
const TABLAS = ["usuarios","ventas","gastos","propinas","aperturas_caja","cierres_caja","pagos_point","mp_cuentas","pedidos","pedido_items","configuracion_empresa","mesas","insumos","recetas","intentos_login","aprobaciones_operacion","eventos_seguridad","respaldo_ventas_pre03","respaldo_pagos_point_pre03"];
const RPCS = [["verificar_pin_garzon",{p_pin:"0000"}],["verificar_login_admin",{p_email:"nadie@example.test",p_pin:"0000"}],["registrar_fallo_login",{p_clave:"x",p_max:5,p_ventana_s:60,p_bloqueo_s:60}],["consumir_aprobacion",{}],["cobrar_venta_manual",{}]];
const filas = []; const clasif = (r, cuerpo) => {
  if (r.status === 401 || r.status === 403) return "DENEGADO";
  if (r.status === 404) return "NO_EXISTE_O_OCULTO";
  if (r.ok) return "ABIERTO";
  return cuerpo?.code === "42501" ? "DENEGADO" : "ABIERTO_CON_ERROR_DE_DATOS";
};
async function llamar(m, ruta, body, extra = {}) {
  const r = await fetch(URL_ + ruta, { method: m, headers: { ...H, ...extra }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { r, j };
}
for (const t of TABLAS) {
  const lee = await llamar("GET", `/rest/v1/${t}?select=*&limit=5`);
  const n = Array.isArray(lee.j) ? lee.j.length : null;
  const mod = await llamar("PATCH", `/rest/v1/${t}?id=eq.${NADA}`, { __x: 1 }, { Prefer: "return=minimal" });
  const ins = await llamar("POST", `/rest/v1/${t}`, { __columna_inexistente: 1 }, { Prefer: "return=minimal" });
  filas.push({ objeto: t, leer: clasif(lee.r, lee.j) + (n != null ? ` (${n} filas visibles)` : ""), modificar: clasif(mod.r, mod.j), insertar: clasif(ins.r, ins.j) });
}
for (const [f, args] of RPCS) {
  const x = await llamar("POST", `/rest/v1/rpc/${f}`, args);
  filas.push({ objeto: `rpc ${f}`, leer: clasif(x.r, x.j) + ` [http ${x.r.status}${x.j?.code ? " " + x.j.code : ""}]`, modificar: "-", insertar: "-" });
}
console.log(`# Llave pública · ${process.argv[2] ?? "sin etiqueta"} · ${new Date().toISOString()}`);
console.table(filas);
const abiertos = filas.filter((f) => /ABIERTO/.test(f.leer + f.modificar + f.insertar) || /\((?!0 filas)\d+ filas visibles\)/.test(f.leer));
console.log(abiertos.length ? `ATENCIÓN: ${abiertos.length} objetos con acceso público.` : "Sin acceso público a datos privados.");
process.exit(abiertos.length ? 1 : 0);
