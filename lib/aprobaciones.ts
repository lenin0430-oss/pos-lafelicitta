// Aprobación de administrador, de UN SOLO USO, ligada a negocio + empleado + importe + operación (tabla aprobaciones_operacion de 07b).
// El navegador solo recibe un token opaco; en la base se guarda su hash. Un booleano "ya aprobado" enviado por el navegador no vale nada.
import { createHash, randomBytes } from "crypto";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export const TTL_APROBACION_S = 300;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const huellaGasto = (categoria: string, descripcion: string) => sha(`gasto|${categoria.trim().toLowerCase()}|${descripcion.trim()}`);

export async function emitirAprobacion(db: Db, a: { empresa_id: string; tipo: string; actor: string; aprobador: string; monto: number; huella: string }, ahora = Date.now()): Promise<{ ok: true; token: string; expira_s: number } | { ok: false }> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await db.from("aprobaciones_operacion").insert({ token_hash: sha(token), ...a, expira_en: new Date(ahora + TTL_APROBACION_S * 1000).toISOString() });
  return error ? { ok: false } : { ok: true, token, expira_s: TTL_APROBACION_S };
}

export async function consumirAprobacion(db: Db, token: unknown, a: { empresa_id: string; tipo: string; actor: string; monto: number; huella: string }): Promise<boolean> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return false;
  const { data, error } = await db.rpc("consumir_aprobacion", { p_token_hash: sha(token), p_empresa: a.empresa_id, p_tipo: a.tipo, p_actor: a.actor, p_monto: a.monto, p_huella: a.huella });
  return !error && data === true;
}
