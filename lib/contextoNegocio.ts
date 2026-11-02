// Comprobaciones que necesitan leer la base (estado actual de la venta, catálogo, cobros Point) ANTES de ejecutar un plan.
// Se ejecutan en el servidor con el cliente privilegiado; las condiciones críticas además viajan como filtros del update
// (p. ej. metodo_pago = '' ) para que la comprobación y la escritura sean atómicas.
import { ESTADOS_POINT_TERMINADOS_SIN_COBRO, parseMixto, type Chequeo } from "./reglasNegocio";
import type { Plan } from "./datosAutorizados";

type Db = { from: (t: string) => any };
export type Veredicto = { ok: true; filtrosExtra: { m: string; a: unknown[] }[] } | { ok: false; status: number; error: string };
const fallo = (status: number, error: string): Veredicto => ({ ok: false, status, error });

// Pasos de filtro del plan (todo lo que no es el cuerpo ni modificadores) para localizar las filas afectadas.
function filtrosDelPlan(plan: Extract<Plan, { ok: true }>) {
  // Se excluyen los filtros que agregó la regla de negocio (p. ej. "sin medio de pago"): aquí se buscan las filas que PIDIÓ el navegador,
  // para poder responder 409 con motivo en vez de un "0 filas actualizadas" silencioso.
  return plan.pasos.slice(1).filter((p) => !plan.reglas.includes(p) && ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"].includes(p.m));
}
function aplicar(q: any, pasos: { m: string; a: unknown[] }[]) { for (const p of pasos) q = q[p.m](...p.a); return q; }

export async function verificarContexto(db: Db, empresaId: string, plan: Extract<Plan, { ok: true }>): Promise<Veredicto> {
  const chequeos = plan.chequeos as Chequeo[];
  if (chequeos.length === 0) return { ok: true, filtrosExtra: [] };
  const extra: { m: string; a: unknown[] }[] = [];

  if (plan.tabla === "ventas" && plan.operacion === "update") {
    const r = await aplicar(db.from("ventas").select("id,total,metodo_pago,estado,items").limit(50), filtrosDelPlan(plan));
    if (r.error) return fallo(500, "Error interno");
    const filas: any[] = r.data ?? [];
    if (filas.length === 0) return { ok: true, filtrosExtra: [] }; // nada que cambiar
    const cuerpo = (plan.pasos[0].a[0] ?? {}) as Record<string, unknown>;
    if (chequeos.includes("venta_no_point") && filas.some((f) => String(f.metodo_pago ?? "").toLowerCase() === "point")) return fallo(409, "La venta fue cobrada con Point y no se puede modificar");
    if (chequeos.includes("venta_sin_cobro")) {
      if (filas.some((f) => f.metodo_pago)) return fallo(409, "La venta ya tiene medio de pago");
      const ids = filas.map((f) => f.id);
      const pp = await db.from("pagos_point").select("estado").in("venta_id", ids.map(String)).limit(200);
      if (pp.error) return fallo(500, "Error interno");
      if ((pp.data ?? []).some((x: any) => !ESTADOS_POINT_TERMINADOS_SIN_COBRO.includes(String(x.estado).toLowerCase()))) return fallo(409, "La venta tiene un cobro con Point en curso o aprobado");
    }
    if (chequeos.includes("total_coincide_mixto")) {
      const pm = parseMixto(cuerpo.metodo_pago);
      if (!pm || filas.some((f) => Number(f.total) !== pm.suma)) return fallo(422, "El detalle del pago mixto no suma el total de la venta");
      if (filas.length === 1) extra.push({ m: "eq", a: ["total", filas[0].total] }); // si el total cambia en medio, el update no aplica
    }
    if (chequeos.includes("catalogo")) {
      const nuevas = (cuerpo.items ?? []) as any[];
      const antiguas = filas.flatMap((f) => (Array.isArray(f.items) ? f.items : []));
      const v = await verificarCatalogo(db, empresaId, nuevas, antiguas);
      if (!v.ok) return v;
    }
    return { ok: true, filtrosExtra: extra };
  }

  if (plan.tabla === "ventas" && plan.operacion === "insert" && chequeos.includes("catalogo")) {
    const filas = (plan.pasos[0].a[0] ?? []) as any;
    for (const f of Array.isArray(filas) ? filas : [filas]) {
      const v = await verificarCatalogo(db, empresaId, f.items ?? [], []);
      if (!v.ok) return v;
    }
    return { ok: true, filtrosExtra: [] };
  }

  if (plan.tabla === "propinas" && chequeos.includes("venta_del_negocio")) {
    const fila = plan.pasos[0].a[0] as any;
    const r = await db.from("ventas").select("id").eq("empresa_id", empresaId).eq("id", String(fila.venta_id)).maybeSingle();
    if (r.error) return fallo(500, "Error interno");
    if (!r.data) return fallo(403, "La venta indicada no pertenece al negocio");
  }
  return { ok: true, filtrosExtra: [] };
}

// Cada línea debe existir en el catálogo del negocio con su precio vigente. Líneas idénticas a las ya guardadas se toleran
// (editar una comanda vieja no debe fallar porque el precio cambió después). DATOS_CATALOGO=suma relaja a "solo total = suma de líneas".
export async function verificarCatalogo(db: Db, empresaId: string, nuevas: any[], previas: any[]): Promise<Veredicto> {
  if ((process.env.DATOS_CATALOGO ?? "estricto") === "suma") return { ok: true, filtrosExtra: [] };
  const r = await db.from("productos").select("nombre,precio").eq("empresa_id", empresaId).limit(5000);
  if (r.error) return fallo(500, "Error interno");
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const precios = new Map<string, Set<number>>();
  for (const p of r.data ?? []) { const k = norm(p.nombre); if (!precios.has(k)) precios.set(k, new Set()); precios.get(k)!.add(Number(p.precio)); }
  if (precios.size === 0) return { ok: true, filtrosExtra: [] }; // negocio sin catálogo en la base (usa el menú de respaldo): no hay contra qué comparar
  const antes = new Set(previas.map((l) => `${norm(l.nombre)}|${Number(l.precio_unit)}`));
  for (const l of nuevas) {
    if (antes.has(`${norm(l.nombre)}|${Number(l.precio_unit)}`)) continue;
    const ps = precios.get(norm(l.nombre));
    if (!ps) return fallo(422, `Producto fuera del catálogo: ${String(l.nombre).slice(0, 60)}`);
    if (!ps.has(Number(l.precio_unit))) return fallo(422, `El precio de "${String(l.nombre).slice(0, 60)}" no coincide con el catálogo vigente`);
  }
  return { ok: true, filtrosExtra: [] };
}
