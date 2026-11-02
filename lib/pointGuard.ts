// Lógica pura (sin red ni base de datos) para evitar cobros Point duplicados.
// Una orden de Point se crea con expiration_time PT5M; mientras siga viva en la
// terminal no se debe crear otra para la misma venta.

export const VENTANA_ORDEN_VIVA_MS = 5 * 60 * 1000;
export const ESTADOS_ORDEN_VIVA = ["created", "at_terminal"] as const;

export type PagoPointRegistrado = {
  mp_order_id: string | null;
  monto: number;
  estado: string;
  created_at: string;
};

// Devuelve la orden aún viva de esta venta y el mismo monto, o null si hay que crear una nueva.
export function ordenPointReutilizable(
  pagos: PagoPointRegistrado[],
  monto: number,
  ahoraMs: number = Date.now()
): PagoPointRegistrado | null {
  const vivas = pagos
    .filter((p) => p.mp_order_id && p.monto === monto)
    .filter((p) => (ESTADOS_ORDEN_VIVA as readonly string[]).includes(p.estado))
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return Number.isFinite(t) && ahoraMs - t < VENTANA_ORDEN_VIVA_MS;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return vivas[0] ?? null;
}
