// Reglas puras (sin red ni base de datos) del cobro Point.

export const ESTADOS_ORDEN_ACTIVA = ["reservado", "created", "at_terminal"] as const;
export const ESTADOS_ORDEN_FINAL = ["processed", "canceled", "expired", "failed"] as const;

export type ResultadoMP =
  | { ok: true; orden: { id: string; status: string } }
  | { ok: false; status: number; code?: string };

// ¿Es incierto si Mercado Pago creó la orden? (red caída, timeout, 5xx, 408, 429).
// En ese caso NO se cierra el intento: se reintenta con la MISMA clave de idempotencia.
export function esFalloAmbiguo(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
