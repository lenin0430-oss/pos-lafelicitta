// Cocina: una comanda sigue visible hasta que se marca "entregado", esté o no pagada y por antigua que sea.
export const ESTADOS_VISIBLES_COCINA = ["pendiente", "en_proceso", "listo"] as const;
export const UMBRAL_ANTIGUA_H = 12;

// Una comanda archivada (06) solo sale de la pantalla; su estado no cambia y no se considera entregada.
export const visibleEnCocina = (v: { estado?: string | null; cocina_archivada_at?: string | null }) =>
  !v.cocina_archivada_at && (ESTADOS_VISIBLES_COCINA as readonly string[]).includes(v.estado ?? "pendiente");

// Solo etiqueta; NUNCA oculta.
export function antiguedad(createdAt: string, ahora: number = Date.now()) {
  const horas = Math.max(0, (ahora - new Date(createdAt).getTime()) / 3_600_000);
  return { horas, antigua: horas >= UMBRAL_ANTIGUA_H };
}
