// Comprobaciones que necesitan leer la base (estado actual de la venta, catálogo, cobros Point) ANTES de ejecutar un plan.
// Se ejecutan en el servidor con el cliente privilegiado; las condiciones críticas además viajan como filtros del update
// (p. ej. metodo_pago = '' ) para que la comprobación y la escritura sean atómicas.
import { ESTADOS_POINT_TERMINADOS_SIN_COBRO, parseMixto, type Chequeo } from "./reglasNegocio";
import type { Plan } from "./datosAutorizados";

const ACCIONES_SQL = ["ventas.cobro_manual", "ventas.editar_comanda"];
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
  let chequeos = plan.chequeos as Chequeo[];
  // En cobro manual y edición de comanda, "sin medio de pago", "sin Point en curso" y "mixto = total" los hace la función SQL (07c)
  // dentro de la misma transacción que escribe; aquí solo queda el catálogo (que no depende de carreras con cobros).
  if (ACCIONES_SQL.includes(plan.accion)) chequeos = chequeos.filter((c) => c === "catalogo");
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

// Cada línea nueva debe corresponder a un producto ACTIVO y DISPONIBLE del negocio, con su precio vigente (activo !== false y disponible !== false).
// - Un producto inactivo (aunque tenga el mismo nombre y un precio histórico) NO sirve para una venta nueva.
// - Nombres repetidos entre productos activos (p. ej. "Pabellón" en Empanadas y en Arepas) aceptan cualquiera de sus precios VIGENTES.
// - Líneas idénticas (nombre + precio) a las ya guardadas EN ESA VENTA se toleran al editarla; no hay excepción global por nombre.
// - Catálogo vacío: se rechaza (no hay contra qué validar) salvo DATOS_CATALOGO_VACIO=permitir (solo para negocios que aún usan el menú de respaldo).
// DATOS_CATALOGO=suma relaja todo a "total = suma de líneas".
export async function verificarCatalogo(db: Db, empresaId: string, nuevas: any[], previas: any[]): Promise<Veredicto> {
  if ((process.env.DATOS_CATALOGO ?? "estricto") === "suma") return { ok: true, filtrosExtra: [] };
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const antes = new Set(previas.map((l) => `${norm(l.nombre)}|${Number(l.precio_unit)}`));
  if (nuevas.every((l) => antes.has(`${norm(l.nombre)}|${Number(l.precio_unit)}`))) return { ok: true, filtrosExtra: [] };
  const r = await db.from("productos").select("nombre,precio,activo,disponible").eq("empresa_id", empresaId).limit(5000);
  if (r.error) return fallo(500, "Error interno");
  const filas: any[] = r.data ?? [];
  if (filas.length === 5000) return fallo(500, "Catálogo demasiado grande para validar");
  if (filas.length === 0) return process.env.DATOS_CATALOGO_VACIO === "permitir" ? { ok: true, filtrosExtra: [] } : fallo(422, "El negocio no tiene catálogo de productos para validar precios");
  const precios = new Map<string, Set<number>>();
  for (const p of filas) {
    if (p.activo === false || p.disponible === false) continue;
    const k = norm(p.nombre); if (!precios.has(k)) precios.set(k, new Set()); precios.get(k)!.add(Number(p.precio));
  }
  for (const l of nuevas) {
    if (antes.has(`${norm(l.nombre)}|${Number(l.precio_unit)}`)) continue;
    const ps = precios.get(norm(l.nombre));
    if (!ps) return fallo(422, `Producto inexistente o inactivo: ${String(l.nombre).slice(0, 60)}`);
    if (!ps.has(Number(l.precio_unit))) return fallo(422, `El precio de "${String(l.nombre).slice(0, 60)}" no coincide con el catálogo vigente`);
  }
  return { ok: true, filtrosExtra: [] };
}

// Cobro manual y edición de comanda: UNA transacción SQL (07c) que bloquea la venta; ver supabase/07c_cobro_manual_atomico.sql.
const MAPA_SQL: Record<string, { status: number; error: string }> = {
  no_encontrada: { status: 404, error: "Venta no encontrada" },
  ya_cobrada: { status: 409, error: "La venta ya tiene medio de pago" },
  point_en_curso: { status: 409, error: "La venta tiene un cobro con Point en curso o aprobado" },
  mixto_no_suma: { status: 422, error: "El detalle del pago mixto no suma el total de la venta" },
  total_no_coincide: { status: 422, error: "El total no coincide con las líneas del pedido" },
  items_invalidos: { status: 400, error: "items inválidos" },
};
export async function ejecutarAccionSql(db: Db & { rpc: (fn: string, a: Record<string, unknown>) => any }, empresaId: string, plan: Extract<Plan, { ok: true }>) {
  const ventaId = plan.pasos.slice(1).find((p) => p.m === "eq" && p.a[0] === "id" && !plan.reglas.includes(p))?.a[1];
  if (ventaId === undefined) return { status: 400, body: { data: null, error: { message: "Falta el id de la venta", code: "400" } } };
  const c = (plan.pasos[0].a[0] ?? {}) as Record<string, any>;
  const r = plan.accion === "ventas.cobro_manual"
    ? await db.rpc("cobrar_venta_manual", { p_empresa: empresaId, p_venta: String(ventaId), p_medio: c.metodo_pago, p_mixto_suma: parseMixto(c.metodo_pago)?.suma ?? null })
    : await db.rpc("editar_comanda_venta", { p_empresa: empresaId, p_venta: String(ventaId), p_total: c.total, p_items: c.items, p_mesa: c.mesa ?? null, p_mesero: c.mesero ?? null, p_personas: c.personas ?? null });
  if (r.error) {
    const falta = /does not exist|42883|PGRST202|schema cache/i.test(`${r.error.code ?? ""} ${r.error.message ?? ""}`);
    return { status: falta ? 503 : 500, body: { data: null, error: { message: falta ? "Falta aplicar supabase/07c (cobro atómico)" : "Error interno", code: falta ? "503" : "500" } } };
  }
  if (r.data === "ok") return { status: 200, body: { data: [{ id: ventaId }], count: null, status: 200, error: null } };
  const m = MAPA_SQL[String(r.data)] ?? { status: 500, error: "Error interno" };
  return { status: m.status, body: { data: null, error: { message: m.error, code: String(m.status) } } };
}
