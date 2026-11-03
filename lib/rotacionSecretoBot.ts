// Rotación coordinada del secreto POS -> bot (cabecera x-bot-secret). Lógica pura y probada.
// El bot es otro proyecto: copiar `secretoBotAceptado` allí (o usar la misma regla) y retirar el anterior en la fase C.
//   Fase A (bot acepta actual + anterior): el POS aún envía el secreto ANTERIOR  -> ambos aceptados.
//   Fase B (POS ya envía el NUEVO)        : el bot sigue aceptando ambos.
//   Fase C (bot retira el anterior)       : solo el NUEVO es válido; el anterior debe ser rechazado.
import { createHash, timingSafeEqual } from "crypto";

const MIN = 24;
const huella = (s: string) => createHash("sha256").update(s).digest();
const iguales = (a: string, b: string) => timingSafeEqual(huella(a), huella(b));

export type ConfigSecretosBot = { actual?: string; anterior?: string };

// true solo si `recibido` coincide con el secreto actual o (durante la transición) con el anterior.
export function secretoBotAceptado(recibido: string | null | undefined, cfg: ConfigSecretosBot): boolean {
  if (!recibido) return false;
  let ok = false; // se evalúan ambos para no filtrar cuál coincidió por tiempo
  if (cfg.actual && cfg.actual.length >= MIN) ok = iguales(recibido, cfg.actual) || ok;
  if (cfg.anterior && cfg.anterior.length >= MIN) ok = iguales(recibido, cfg.anterior) || ok;
  return ok;
}

// Un secreto nuevo debe ser distinto del anterior y suficientemente largo.
export function secretoNuevoValido(nuevo: string, anterior?: string): boolean {
  return nuevo.length >= MIN && (!anterior || !iguales(nuevo, anterior));
}
