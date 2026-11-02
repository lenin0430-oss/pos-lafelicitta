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
  const { categoria, descripcion, monto, afecto_caja } = g.valor;
  const cat = categoria.toLowerCase().split(" /")[0].trim();
  if (gastoRequiereAprobacion(s.rol, monto)) {
    const usada = await consumirAprobacion(db, (b as any).aprobacion, { empresa_id: s.empresa_id, tipo: "gasto", actor: s.nombre, monto, huella: huellaGasto(categoria, descripcion) });
    if (!usada) return { status: 403, body: { ok: false, error: "Este gasto requiere la aprobación vigente de un administrador" } };
  }
  const ap = await db.from("aperturas_caja").select("id").eq("empresa_id", s.empresa_id).eq("estado", "abierta").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("gastos").insert({ empresa_id: s.empresa_id, categoria: cat, descripcion, monto, cajero: s.nombre, apertura_id: ap?.data?.id ?? null, afecto_caja, created_at: new Date().toISOString() });
  if (error) return { status: 500, body: { ok: false, error: "No se pudo registrar el gasto" } };
  return { status: 200, body: { ok: true } };
}
