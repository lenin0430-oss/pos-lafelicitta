// Caso de uso "registrar gasto": validación y autorización en el SERVIDOR.
// - importe, categoría y descripción validados; autor = sesión; fecha = servidor; negocio = cookie firmada.
// - garzón con monto >= umbral: exige una aprobación de administrador de un solo uso ligada a negocio, empleado, importe y operación.
import { consumirAprobacion, huellaGasto } from "./aprobaciones";
import { gastoRequiereAprobacion, validarGasto } from "./reglasNegocio";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type RespGasto = { status: number; body: { ok: boolean; error?: string } };

export async function registrarGasto(db: Db, s: { rol: "admin" | "garzon"; empresa_id: string; nombre: string }, b: unknown): Promise<RespGasto> {
  const g = validarGasto(b);
  if (!g.ok) return { status: g.status, body: { ok: false, error: g.error } };
  const { categoria, descripcion, monto, afecto_caja, pagado_por } = g.valor;
  const cat = categoria.toLowerCase().split(" /")[0].trim();
  if (gastoRequiereAprobacion(s.rol, monto)) {
    const usada = await consumirAprobacion(db, (b as any).aprobacion, { empresa_id: s.empresa_id, tipo: "gasto", actor: s.nombre, monto, huella: huellaGasto(categoria, descripcion) });
    if (!usada) return { status: 403, body: { ok: false, error: "Este gasto requiere la aprobación vigente de un administrador" } };
  }
  // El turno lo asigna la base al insertar (trigger, serializado con el cierre): no se lee aparte ni se envía apertura_id.
  const { error } = await db.from("gastos").insert({ empresa_id: s.empresa_id, categoria: cat, descripcion, monto, cajero: s.nombre, afecto_caja, ...(pagado_por ? { pagado_por } : {}), created_at: new Date().toISOString() });
  if (error) return { status: 500, body: { ok: false, error: "No se pudo registrar el gasto" } };
  return { status: 200, body: { ok: true } };
}

// Deuda con trabajadores que pagaron gastos con su dinero (migración 13).
export async function reembolsosPendientes(db: Db, s: { empresa_id: string }) {
  const { data, error } = await db.rpc("reembolsos_pendientes", { p_empresa: s.empresa_id });
  if (error) return { status: 500, body: { ok: false, error: "No se pudo leer lo pendiente" } };
  return { status: 200, body: { ok: true, pendientes: Array.isArray(data) ? data : [] } };
}

const MSG_REEMBOLSO: Record<string, [number, string]> = {
  persona_requerida: [400, "Indica a quién se le devuelve"],
  nada_pendiente: [409, "No hay nada pendiente por devolver a esa persona"],
  sin_turno: [409, "No hay turno abierto: ábrelo en «Cierre» para pagar desde la caja"],
  turno_cerrado: [409, "El turno ya está cerrado"],
};
// Devuelve TODO lo pendiente a una persona: retiro de caja en el turno abierto + registro de la devolución (atómico en la base).
export async function pagarReembolso(db: Db, s: { rol: "admin" | "garzon"; empresa_id: string; nombre: string }, b: unknown) {
  if (s.rol !== "admin") return { status: 403, body: { ok: false, error: "Solo el administrador puede pagar devoluciones" } };
  const persona = b && typeof (b as any).persona === "string" ? (b as any).persona.trim().slice(0, 60) : "";
  if (!persona) return { status: 400, body: { ok: false, error: "Indica a quién se le devuelve" } };
  const { data, error } = await db.rpc("reembolso_pagar", { p_empresa: s.empresa_id, p_persona: persona, p_por: s.nombre });
  if (error) return { status: 500, body: { ok: false, error: "No se pudo registrar la devolución" } };
  if (!data?.ok) { const m = MSG_REEMBOLSO[data?.codigo] ?? [400, "No se pudo registrar la devolución"]; return { status: m[0], body: { ok: false, error: m[1] } }; }
  return { status: 200, body: { ok: true, persona: data.persona, monto: data.monto } };
}
