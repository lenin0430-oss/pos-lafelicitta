// Estados separados (ver supabase/03_estados_separados.sql):
//  - ventas.estado      = preparación / entrega  (cocina)
//  - ventas.estado_pago = estado financiero      (caja, Point, cierre)
// Regla: marcar preparado o entregado NUNCA cobra ni descobra una venta.

export const ESTADOS_PREPARACION = ["pendiente", "en_proceso", "listo", "entregado"] as const;
export const ESTADOS_PAGO = ["pendiente", "pagado"] as const;

export type VentaEstados = {
  estado?: string | null;
  estado_pago?: string | null;
};

export function estaPagada(v: VentaEstados): boolean {
  return v.estado_pago === "pagado";
}

// Se puede cobrar mientras no esté pagada, sin importar si está pendiente, en proceso, lista o entregada.
export function ventaPuedeCobrarse(v: VentaEstados): boolean {
  return !estaPagada(v);
}
