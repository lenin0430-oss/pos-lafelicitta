// Comprobación del PIN de administrador para autorizar un gasto (antes se hacía leyendo `usuarios` desde el navegador).
// Con limitador simple por sesión; en producción conviene además un límite persistente (ver docs/PERMISOS_PLAN.md).
const intentos = new Map<string, { n: number; hasta: number }>();
export const MAX_INTENTOS = 5, VENTANA_MS = 5 * 60 * 1000;

export function limitar(clave: string, ahora = Date.now()): boolean {
  const r = intentos.get(clave);
  if (!r || r.hasta < ahora) { intentos.set(clave, { n: 1, hasta: ahora + VENTANA_MS }); return true; }
  r.n++; return r.n <= MAX_INTENTOS;
}
export function reiniciar(clave: string) { intentos.delete(clave); }
export const _limpiar = () => intentos.clear();

export async function verificarPinAdmin(
  db: { from: (t: string) => any },
  s: { empresa_id: string; nombre: string },
  pin: unknown
): Promise<{ status: number; body: { ok: boolean; nombre?: string; error?: string } }> {
  const clave = `${s.empresa_id}:${s.nombre}`;
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) return { status: 400, body: { ok: false, error: "PIN inválido" } };
  if (!limitar(clave)) return { status: 429, body: { ok: false, error: "Demasiados intentos. Espera unos minutos." } };
  const { data } = await db.from("usuarios").select("nombre").eq("empresa_id", s.empresa_id).eq("pin", pin).eq("rol", "admin").maybeSingle();
  if (!data) return { status: 401, body: { ok: false, error: "PIN admin incorrecto" } };
  reiniciar(clave);
  return { status: 200, body: { ok: true, nombre: data.nombre } };
}
