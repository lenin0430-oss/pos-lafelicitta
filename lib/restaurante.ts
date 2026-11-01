// ÚNICO lugar donde se decide de qué restaurante es la petición.
// Lee una cookie HttpOnly firmada (HMAC) emitida por /api/auth/login.
// Nunca usa headers, query ni body enviados por el cliente.
import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE_SESION = "lf_srv";
export const DURACION_SESION_S = 12 * 60 * 60; // igual que lib/auth.ts

export type SesionServidor = {
  rol: "admin" | "garzon";
  nombre: string;
  empresa_id: string;
  expira: number;
};

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Falta SESSION_SECRET");
  return s;
}

const firmar = (payload: string) => createHmac("sha256", secreto()).update(payload).digest("base64url");

export function crearToken(s: Omit<SesionServidor, "expira">): string {
  const payload = Buffer.from(
    JSON.stringify({ ...s, expira: Date.now() + DURACION_SESION_S * 1000 })
  ).toString("base64url");
  return `${payload}.${firmar(payload)}`;
}

function leerToken(token: string): SesionServidor | null {
  const [payload, firma] = token.split(".");
  if (!payload || !firma) return null;
  const a = Buffer.from(firmar(payload));
  const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s: SesionServidor = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return s.expira > Date.now() && s.empresa_id ? s : null;
  } catch {
    return null;
  }
}

export function sesionDelServidor(req: Request): SesionServidor | null {
  const cookies = req.headers.get("cookie") ?? "";
  const par = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_SESION}=`));
  if (!par) return null;
  try {
    return leerToken(par.slice(COOKIE_SESION.length + 1));
  } catch {
    return null;
  }
}

// Devuelve el restaurante del usuario logueado, o null si no hay sesión válida
// (o si se exige admin y el usuario no lo es).
export async function restauranteDeLaSesion(
  req: Request,
  opts: { soloAdmin?: boolean } = {}
): Promise<string | null> {
  const s = sesionDelServidor(req);
  if (!s) return null;
  if (opts.soloAdmin && s.rol !== "admin") return null;
  return s.empresa_id;
}
