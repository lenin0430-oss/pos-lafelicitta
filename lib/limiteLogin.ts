// Límite PERSISTENTE de intentos fallidos (tabla intentos_login de supabase/07b, compartida por todas las instancias del servidor).
// - Por IP (hash) y por cuenta (hash del correo / empleado). Bloqueo progresivo (cada bloqueo dura el doble, tope 24 h).
// - El éxito limpia el contador de la CUENTA, no el de la IP.
// - Nunca se guarda el PIN ni la IP en claro.
// - Si la base aún no tiene las funciones de 07b, se usa un respaldo en memoria (menos fuerte: por instancia) y se avisa en el log.
import { createHmac } from "crypto";

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };
export type Politica = { max: number; ventanaS: number; bloqueoS: number };
export const POLITICAS = {
  ip: { max: 12, ventanaS: 900, bloqueoS: 600 } as Politica,       // 12 fallos / 15 min por IP → 10 min (luego 20, 40 …)
  cuenta: { max: 5, ventanaS: 900, bloqueoS: 900 } as Politica,    // 5 fallos / 15 min por cuenta → 15 min (luego 30, 60 …)
  pinAdminGasto: { max: 5, ventanaS: 900, bloqueoS: 900 } as Politica,
};

export const hashClave = (valor: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "sin-secreto").update(valor).digest("hex").slice(0, 32);
export function ipDeLaPeticion(req: Request): string {
  const h = req.headers;
  const v = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? (h.get("x-forwarded-for") ?? "").split(",")[0];
  return (v ?? "").trim().slice(0, 64) || "desconocida";
}

// --- respaldo en memoria (solo si faltan las funciones SQL) ---
const mem = new Map<string, { n: number; ini: number; hasta: number; bloqueos: number }>();
let avisado = false;
export const _limpiarMemoria = () => mem.clear();
function memFallo(clave: string, p: Politica, ahora: number): number | null {
  let r = mem.get(clave);
  if (!r || (r.ini + p.ventanaS * 1000 < ahora && r.hasta < ahora)) r = { n: 0, ini: ahora, hasta: 0, bloqueos: r?.bloqueos ?? 0 };
  r.n++;
  if (r.n >= p.max && r.hasta < ahora) { r.hasta = ahora + Math.min(p.bloqueoS * 2 ** Math.min(r.bloqueos, 8), 86400) * 1000; r.bloqueos++; r.n = 0; r.ini = ahora; }
  mem.set(clave, r);
  return r.hasta > ahora ? r.hasta : null;
}
const sinFuncion = (e: any) => !!e && /does not exist|42883|PGRST202|Could not find the function|schema cache/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
function avisar() { if (!avisado) { avisado = true; console.warn("limiteLogin: faltan las funciones de supabase/07b; usando límite en memoria (por instancia). Aplicar 07b."); } }

// Devuelve segundos restantes de bloqueo (la mayor entre las claves) o 0.
export async function segundosBloqueado(db: Rpc, claves: string[], ahora = Date.now()): Promise<number> {
  let max = 0;
  for (const c of claves) {
    const r = await db.rpc("login_bloqueado_hasta", { p_clave: c });
    let hasta: number | null = null;
    if (r.error) { if (!sinFuncion(r.error)) throw new Error("limiteLogin: " + (r.error.message ?? "error")); avisar(); const m = mem.get(c); hasta = m && m.hasta > ahora ? m.hasta : null; }
    else if (r.data) hasta = new Date(r.data).getTime();
    if (hasta && hasta > ahora) max = Math.max(max, Math.ceil((hasta - ahora) / 1000));
  }
  return max;
}

// Cuenta un fallo en cada clave. Devuelve segundos de bloqueo resultantes (0 = no bloqueado).
export async function registrarFallo(db: Rpc, claves: { clave: string; politica: Politica }[], ahora = Date.now()): Promise<number> {
  let max = 0;
  for (const { clave, politica } of claves) {
    const r = await db.rpc("registrar_fallo_login", { p_clave: clave, p_max: politica.max, p_ventana_s: politica.ventanaS, p_bloqueo_s: politica.bloqueoS });
    let hasta: number | null = null;
    if (r.error) { if (!sinFuncion(r.error)) throw new Error("limiteLogin: " + (r.error.message ?? "error")); avisar(); hasta = memFallo(clave, politica, ahora); }
    else if (r.data) hasta = new Date(r.data).getTime();
    if (hasta && hasta > ahora) max = Math.max(max, Math.ceil((hasta - ahora) / 1000));
  }
  return max;
}

export async function limpiarCuenta(db: Rpc, clave: string) {
  mem.delete(clave);
  const r = await db.rpc("limpiar_intentos_login", { p_clave: clave });
  if (r.error && !sinFuncion(r.error)) throw new Error("limiteLogin: " + (r.error.message ?? "error"));
}

// Bitácora sin PIN ni datos personales (hash de IP). Mejor esfuerzo: nunca debe romper el login.
export async function evento(db: { from: (t: string) => any }, e: { tipo: string; resultado: string; empresa_id?: string | null; actor?: string | null; ip_hash?: string | null }) {
  try { await db.from("eventos_seguridad").insert({ tipo: e.tipo, resultado: e.resultado, empresa_id: e.empresa_id ?? null, actor: e.actor ?? null, ip_hash: e.ip_hash ?? null }); } catch { /* tabla ausente: se ignora */ }
}
