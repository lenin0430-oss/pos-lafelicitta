// El PIN de un administrador autoriza UNA operación concreta: se emite una aprobación de un solo uso (lib/aprobaciones.ts).
// Límite persistente de intentos por negocio+empleado (lib/limiteLogin.ts); el PIN nunca se registra.
import { buscarAdminPorPin } from "./credenciales";
import { emitirAprobacion, huellaGasto } from "./aprobaciones";
import { POLITICAS, evento, registrarFallo, segundosBloqueado } from "./limiteLogin";
import { validarGasto } from "./reglasNegocio";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type Resp = { status: number; body: { ok: boolean; aprobacion?: string; expira_s?: number; error?: string } };

export async function aprobarGasto(db: Db, s: { empresa_id: string; nombre: string }, b: any): Promise<Resp> {
  const pin = b?.pin;
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) return { status: 400, body: { ok: false, error: "PIN inválido" } };
  const g = validarGasto({ categoria: b.categoria, descripcion: b.descripcion, monto: b.monto });
  if (!g.ok) return { status: 400, body: { ok: false, error: g.error } };
  const clave = `pin-admin:${s.empresa_id}:${s.nombre}`;
  const espera = await segundosBloqueado(db, [clave]);
  if (espera) return { status: 429, body: { ok: false, error: "Demasiados intentos. Espera unos minutos." } };
  const aprobador = await buscarAdminPorPin(db, s.empresa_id, pin);
  if (!aprobador) {
    const e2 = await registrarFallo(db, [{ clave, politica: POLITICAS.pinAdminGasto }]);
    await evento(db, { tipo: "aprobacion_gasto", resultado: "pin_incorrecto", empresa_id: s.empresa_id, actor: s.nombre });
    return e2 ? { status: 429, body: { ok: false, error: "Demasiados intentos. Espera unos minutos." } } : { status: 401, body: { ok: false, error: "PIN admin incorrecto" } };
  }
  const em = await emitirAprobacion(db, { empresa_id: s.empresa_id, tipo: "gasto", actor: s.nombre, aprobador, monto: g.valor.monto, huella: huellaGasto(g.valor.categoria, g.valor.descripcion) });
  if (!em.ok) return { status: 503, body: { ok: false, error: "Aprobaciones no disponibles (falta aplicar supabase/07b)" } };
  await evento(db, { tipo: "aprobacion_gasto", resultado: "ok", empresa_id: s.empresa_id, actor: s.nombre });
  return { status: 200, body: { ok: true, aprobacion: em.token, expira_s: em.expira_s } };
}
