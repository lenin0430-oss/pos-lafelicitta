// Reportes y cierre: separa "ventas registradas", "cobros recibidos" y "saldo pendiente".
//  - Registrada: comanda creada en el período (created_at).
//  - Cobro recibido: venta con estado_pago='pagado' cuya fecha de cobro cae en el período.
//    Fecha de cobro = pagado_at; en el histórico anterior a la migración pagado_at es NULL y se usa created_at.
//  - Saldo pendiente: ventas registradas en el período aún con estado_pago='pendiente'.
// Un cobro se cuenta UNA vez: intervalos [desde, hasta) y deduplicación por id.

export type VentaRep = {
  id: string;
  total: number;
  metodo_pago?: string | null;
  estado?: string | null;
  estado_pago?: string | null;
  pagado_at?: string | null;
  created_at: string;
};

const ms = (v: string | number | Date) => new Date(v).getTime();

export const fechaCobro = (v: VentaRep) => v.pagado_at || v.created_at;

export function cobrosDelPeriodo<T extends VentaRep>(ventas: T[], desde: string | number | Date, hasta?: string | number | Date | null): T[] {
  const d = ms(desde);
  const h = hasta == null ? Infinity : ms(hasta);
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const v of ventas) {
    if (v.estado_pago !== "pagado" || vistos.has(v.id)) continue;
    const t = ms(fechaCobro(v));
    if (!(t >= d && t < h)) continue;
    vistos.add(v.id);
    out.push(v);
  }
  return out;
}

export function etiquetaMetodo(v: VentaRep): string {
  const m = (v.metodo_pago ?? "").trim();
  if (v.estado_pago === "sin_identificar" || (!m && v.estado_pago !== "pendiente")) return "Sin identificar";
  return m || "—";
}

const suma = (a: VentaRep[]) => a.reduce((s, v) => s + (v.total || 0), 0);

export type ResumenPeriodo = {
  registradas: { cantidad: number; total: number };
  cobrado: { cantidad: number; total: number };
  pendiente: { cantidad: number; total: number };
  cortesias: { cantidad: number; total: number };
  sinIdentificar: { cantidad: number; total: number };
};

// ventasCreadas: ventas con created_at en el período. posiblesCobros: ventas con cobro en el período
// (pueden haberse creado antes; se deduplican por id con las anteriores).
export function resumenPeriodo(
  ventasCreadas: VentaRep[],
  posiblesCobros: VentaRep[],
  desde: string | number | Date,
  hasta?: string | number | Date | null
): ResumenPeriodo {
  const d = ms(desde);
  const h = hasta == null ? Infinity : ms(hasta);
  const registradas = ventasCreadas.filter((v) => ms(v.created_at) >= d && ms(v.created_at) < h);
  const porEstado = (e: string) => registradas.filter((v) => (v.estado_pago ?? "pendiente") === e);
  const cobros = cobrosDelPeriodo([...registradas, ...posiblesCobros], desde, hasta);
  const resumen = (a: VentaRep[]) => ({ cantidad: a.length, total: suma(a) });
  return {
    registradas: resumen(registradas),
    cobrado: resumen(cobros),
    pendiente: resumen(porEstado("pendiente")),
    cortesias: resumen(porEstado("cortesia")),
    sinIdentificar: resumen(porEstado("sin_identificar")),
  };
}
