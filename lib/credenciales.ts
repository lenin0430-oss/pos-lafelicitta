// Verificación de credenciales con tres modos (PIN_MODO):
//   legacy (por defecto): igual que hoy — funciones RPC verificar_pin_garzon / verificar_login_admin (PIN en la columna `pin`).
//   mixto:  usa usuarios.pin_hash cuando existe y, si el usuario aún no tiene hash, compara con la columna `pin` (transición sin cortes).
//   hash:   solo usuarios.pin_hash (cuando todos los PIN ya fueron migrados y la columna `pin` vaciada).
// Ningún modo cambia PIN reales: la migración la hace scripts/migrar-pins-a-hash.mjs, con confirmación explícita.
import { timingSafeEqual } from "crypto";
import { hashPin, verificarPinHash } from "./pinHash";

export type Usuario = { nombre: string; rol: string; empresa_id: string };
type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type Modo = "legacy" | "mixto" | "hash";
export const modoPin = (): Modo => (["mixto", "hash"].includes(process.env.PIN_MODO ?? "") ? (process.env.PIN_MODO as Modo) : "legacy");
const pepper = () => process.env.PIN_PEPPER ?? "";
const igual = (a: unknown, b: string) => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const MAX_CANDIDATOS = 200;

async function coincide(u: any, pin: string, modo: Modo): Promise<boolean> {
  if (u.pin_hash) return verificarPinHash(pin, u.pin_hash, pepper());
  if (modo === "mixto") return igual(u.pin, pin);
  return false;
}

export async function verificarGarzon(db: Db, pin: string, modo = modoPin()): Promise<Usuario | null> {
  if (modo === "legacy") { const { data } = await db.rpc("verificar_pin_garzon", { p_pin: pin }).maybeSingle(); return (data as Usuario | null) ?? null; }
  const { data } = await db.from("usuarios").select("nombre,rol,empresa_id,pin,pin_hash,activo").neq("rol", "admin").limit(MAX_CANDIDATOS + 1);
  const cand = ((data ?? []) as any[]).filter((u) => u.activo !== false);
  if (cand.length > MAX_CANDIDATOS) throw new Error("Demasiados usuarios para el PIN sin negocio: agregar código de negocio al login");
  for (const u of cand) if (await coincide(u, pin, modo)) return { nombre: u.nombre, rol: u.rol, empresa_id: u.empresa_id };
  return null;
}

export async function verificarAdmin(db: Db, email: string, pin: string, modo = modoPin()): Promise<Usuario | null> {
  if (modo === "legacy") { const { data } = await db.rpc("verificar_login_admin", { p_email: email, p_pin: pin }).maybeSingle(); return (data as Usuario | null) ?? null; }
  const { data } = await db.from("usuarios").select("nombre,rol,empresa_id,pin,pin_hash,activo").eq("email", email).eq("rol", "admin").limit(5);
  for (const u of (data ?? []) as any[]) if (u.activo !== false && (await coincide(u, pin, modo))) return { nombre: u.nombre, rol: u.rol, empresa_id: u.empresa_id };
  return null;
}

// PIN de un administrador del negocio (para aprobar operaciones). Devuelve el nombre del administrador o null.
export async function buscarAdminPorPin(db: Db, empresaId: string, pin: string, modo = modoPin()): Promise<string | null> {
  const { data } = await db.from("usuarios").select("nombre,pin,pin_hash,activo").eq("empresa_id", empresaId).eq("rol", "admin").limit(20);
  for (const u of (data ?? []) as any[]) {
    if (u.activo === false) continue;
    const ok = modo === "legacy" ? igual(u.pin, pin) : await coincide(u, pin, modo);
    if (ok) return u.nombre as string;
  }
  return null;
}
export { hashPin };
