// Estados separados (ver supabase/03_estados_separados.sql):
//  - ventas.estado      = preparación / entrega (cocina). "entregado" retira la comanda de cocina.
//  - ventas.estado_pago = estado financiero (caja, Point, cierre, reportes).
// Regla: marcar preparado o entregado NUNCA cobra ni descobra una venta; cobrar NUNCA retira una comanda de cocina.

export const ESTADOS_PREPARACION = ["pendiente", "en_proceso", "listo", "entregado"] as const;
// pendiente = por cobrar · pagado = cobro recibido · cortesia = sin cobro por decisión del negocio
// sin_identificar = histórico anterior a la migración: tenía estado de cocina "listo" pero ningún método de pago registrado
export const ESTADOS_PAGO = ["pendiente", "pagado", "cortesia", "sin_identificar"] as const;

export type VentaEstados = {
  estado?: string | null;
  estado_pago?: string | null;
};

export const esCortesia = (metodo?: string | null) => /^cortes[ií]a$/i.test((metodo ?? "").trim());

export function estaPagada(v: VentaEstados): boolean {
  return v.estado_pago === "pagado";
}

// Se puede cobrar solo lo que está por cobrar, sin importar si cocina lo tiene pendiente, listo o entregado.
export function ventaPuedeCobrarse(v: VentaEstados): boolean {
  return (v.estado_pago ?? "pendiente") === "pendiente";
}

// Estado financiero que corresponde al registrar un cobro manual con ese método.
export function estadoPagoParaMetodo(metodo?: string | null): "pagado" | "cortesia" {
  return esCortesia(metodo) ? "cortesia" : "pagado";
}
