// Hash de PIN preparado para una migración COORDINADA (no cambia ningún PIN real por sí solo).
// scrypt (memoria-dura) sobre HMAC-SHA256(pepper, pin), con sal aleatoria de 16 bytes. El "pepper" vive en una variable de entorno
// del servidor (PIN_PEPPER), NUNCA en la base: una filtración de la base por sí sola no permite adivinar PIN de 4 dígitos fuera de línea.
// Límite honesto: un PIN de 4 dígitos tiene solo 10.000 combinaciones; el hash protege contra lectura de la base, y el límite de intentos
// y un PIN/contraseña más largo para administradores protegen contra adivinar en línea.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";

const N = 16384, R = 8, P = 1, LLAVE = 32;
const derivar = (pin: string, pepper: string, sal: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((ok, ko) => scrypt(createHmac("sha256", pepper).update(pin).digest(), sal, LLAVE, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? ko(e) : ok(k))));

export function pepperValido(p: unknown): p is string { return typeof p === "string" && p.length >= 32; }

export async function hashPin(pin: string, pepper: string): Promise<string> {
  if (!pepperValido(pepper)) throw new Error("PIN_PEPPER debe tener al menos 32 caracteres");
  const sal = randomBytes(16);
  const h = await derivar(pin, pepper, sal);
  return ["scrypt1", N, R, P, sal.toString("base64"), h.toString("base64")].join("$");
}

export async function verificarPinHash(pin: string, guardado: unknown, pepper: string): Promise<boolean> {
  if (typeof guardado !== "string" || !pepperValido(pepper)) return false;
  const [v, n, r, p, sal, h] = guardado.split("$");
  if (v !== "scrypt1" || !sal || !h) return false;
  try {
    const esperado = Buffer.from(h, "base64");
    const obtenido = await derivar(pin, pepper, Buffer.from(sal, "base64"), Number(n), Number(r), Number(p));
    return esperado.length === obtenido.length && timingSafeEqual(esperado, obtenido);
  } catch { return false; }
}
