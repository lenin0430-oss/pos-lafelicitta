// Consumo personal de trabajadores (se descuenta de su pago diario) en el SERVIDOR. Reglas:
//  * Todo se decide en la base (funciones registrar_consumo_personal / descontar_consumos_personal, migración 12) con lo guardado.
//  * Negocio y autor = sesión firmada. El navegador solo dice QUÉ venta, QUÉ trabajador y QUÉ consumos se descontaron.
//  * Un consumo personal NO es un cobro: no mueve la caja. Solo el administrador marca consumos como descontados.
import type { SesionA, RespA } from "./abonosServidor";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;
const err = (status: number, error: string, extra: Record<string, unknown> = {}): RespA => ({ status, body: { ok: false, error, ...extra } });

const MENSAJES: Record<string, [number, string]> = {
  trabajador_invalido: [400, "Escribe el nombre del trabajador"],
  venta_no_encontrada: [404, "Venta no encontrada"],
  ya_cobrada: [409, "Esta venta ya está cobrada o registrada"],
  point_en_curso: [409, "Hay un cobro Point en curso para esta venta"],
  ids_invalidos: [400, "Consumos inválidos"],
  nada_pendiente: [409, "Esos consumos ya estaban descontados"],
};
function desdeRpc(r: any): RespA {
  if (r?.error) return err(500, "No se pudo completar la operación");
  const d = r?.data ?? {};
  if (d.ok) return { status: 200, body: d };
  const [st, msg] = MENSAJES[d.codigo] ?? [400, "Operación rechazada"];
  return err(st, msg, { codigo: d.codigo });
}

// Nombre corto sin caracteres de control. Vacío o no texto → null.
export function limpiarTrabajador(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return t || null;
}
// Misma persona aunque se escriba «juan», «Juan » o «JUAN» (sin tildes).
export const claveTrabajador = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// POST { accion: "registrar", venta_id, trabajador } | { accion: "descontar", ids: [consumo_id, …] } (solo admin)
export async function accionConsumo(db: Db, s: SesionA, b: any): Promise<RespA> {
  if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "Solicitud inválida");
  if (b.accion === "registrar") {
    if (typeof b.venta_id !== "string" || !UUID.test(b.venta_id)) return err(400, "Venta inválida");
    const t = limpiarTrabajador(b.trabajador);
    if (!t) return err(400, MENSAJES.trabajador_invalido[1], { codigo: "trabajador_invalido" });
    return desdeRpc(await db.rpc("registrar_consumo_personal", { p_empresa: s.empresa_id, p_venta: b.venta_id, p_trabajador: t, p_por: s.nombre }));
  }
  if (b.accion === "descontar") {
    if (s.rol !== "admin") return err(403, "Solo el administrador marca consumos como descontados");
    if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > MAX_IDS || !b.ids.every((x: unknown) => typeof x === "string" && UUID.test(x))) return err(400, "Consumos inválidos");
    return desdeRpc(await db.rpc("descontar_consumos_personal", { p_empresa: s.empresa_id, p_ids: Array.from(new Set<string>(b.ids)), p_por: s.nombre }));
  }
  return err(400, "Acción no válida");
}

export type ConsumoPendiente = {
  id: string; venta_id: string; numero: number | null; mesa: string | null; monto: number; fecha: string;
  items: { nombre: string; cantidad: number }[];
};
export type TrabajadorPendiente = { trabajador: string; total: number; cantidad: number; consumos: ConsumoPendiente[] };

// GET: consumos sin descontar del negocio de la sesión, agrupados por trabajador (los más antiguos primero),
// más los nombres ya usados (para sugerirlos al escribir).
export async function listarConsumos(db: Db, s: SesionA): Promise<RespA> {
  const c = await db.from("consumos_personal").select("id,venta_id,trabajador,monto,created_at").eq("empresa_id", s.empresa_id).is("anulado_at", null).is("descontado_at", null).order("created_at", { ascending: true }).limit(500);
  if (c?.error) return err(500, "No se pudo leer los consumos");
  const filas: any[] = c?.data ?? [];
  const n = await db.from("consumos_personal").select("trabajador").eq("empresa_id", s.empresa_id).is("anulado_at", null).order("created_at", { ascending: false }).limit(300);
  const vistos = new Map<string, string>();
  for (const x of n?.data ?? []) if (x?.trabajador && !vistos.has(claveTrabajador(x.trabajador))) vistos.set(claveTrabajador(x.trabajador), x.trabajador);
  const nombres = Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, "es"));
  if (filas.length === 0) return { status: 200, body: { ok: true, trabajadores: [], total: 0, cantidad: 0, nombres } };

  const v = await db.from("ventas").select("id,numero,mesa,items").eq("empresa_id", s.empresa_id).in("id", filas.map((x) => x.venta_id));
  if (v?.error) return err(500, "No se pudo leer las comandas");
  const ventas = new Map<string, any>((v?.data ?? []).map((x: any) => [x.id, x]));

  const grupos = new Map<string, TrabajadorPendiente>();
  for (const f of filas) {
    const venta = ventas.get(f.venta_id);
    const items = Array.isArray(venta?.items) ? venta.items.map((i: any) => ({ nombre: String(i?.nombre ?? ""), cantidad: Number(i?.cantidad) || 1 })) : [];
    const k = claveTrabajador(f.trabajador);
    const g: TrabajadorPendiente = grupos.get(k) ?? { trabajador: f.trabajador, total: 0, cantidad: 0, consumos: [] };
    g.total += f.monto || 0; g.cantidad += 1;
    g.consumos.push({ id: f.id, venta_id: f.venta_id, numero: venta?.numero ?? null, mesa: venta?.mesa ?? null, monto: f.monto || 0, fecha: f.created_at, items });
    grupos.set(k, g);
  }
  const trabajadores = Array.from(grupos.values()).sort((a, b) => a.trabajador.localeCompare(b.trabajador, "es"));
  return { status: 200, body: { ok: true, trabajadores, total: trabajadores.reduce((t, g) => t + g.total, 0), cantidad: filas.length, nombres } };
}
