// Intención de comanda pendiente: la clave anti-duplicado sobrevive a una recarga, para que una comanda guardada cuya
// respuesta se perdió se RECUPERE (misma venta, mismo folio) en vez de crear otra. El folio lo asigna solo la base.
export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Intencion = { clave: string; empresa_id: string; huella: string };
const LLAVE = "lf_intencion_comanda";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemH = { producto: { nombre: string; precio: number }; cantidad: number; nota?: string };
// Identifica "esta comanda": mismo negocio, mesa y líneas. Si la cajera arma otra distinta, se usa otra clave.
export function huellaComanda(mesa: string, items: ItemH[]): string {
  return JSON.stringify([mesa, items.map((i) => [i.producto.nombre, i.producto.precio, i.cantidad, i.nota ?? ""])]);
}

export function leerIntencion(a: Almacen | null | undefined, empresaId: string): Intencion | null {
  try {
    const x = JSON.parse(a?.getItem(LLAVE) ?? "null");
    return x && x.empresa_id === empresaId && typeof x.huella === "string" && UUID.test(x.clave) ? x : null;
  } catch { return null; }
}
export function guardarIntencion(a: Almacen | null | undefined, i: Intencion): void { try { a?.setItem(LLAVE, JSON.stringify(i)); } catch { /* sin almacenamiento: queda solo la clave en memoria */ } }
export function borrarIntencion(a: Almacen | null | undefined): void { try { a?.removeItem(LLAVE); } catch { /* nada */ } }

// Clave para enviar: la pendiente si es la misma comanda; si no, una nueva (y se persiste ANTES de enviar).
export function claveParaEnvio(a: Almacen | null | undefined, empresaId: string, huella: string, nueva: () => string): string {
  const p = leerIntencion(a, empresaId);
  if (p && p.huella === huella) return p.clave;
  const clave = nueva();
  guardarIntencion(a, { clave, empresa_id: empresaId, huella });
  return clave;
}

// ---- Guardado idempotente (lo usa app/page.tsx; se prueba con una base falsa que reproduce la restricción única) ----
type Cliente = { from: (t: string) => any };
export async function guardarComandaIdempotente(sb: Cliente, empresaId: string, clave: string, fila: Record<string, unknown>): Promise<{ data: any; error: any; recuperada: boolean }> {
  // 1) ¿ya existe con esta clave (se guardó pero no llegó la respuesta)? → esa misma, sin insertar.
  const previa = await sb.from("ventas").select("*").eq("empresa_id", empresaId).eq("clave_idempotencia", clave).maybeSingle();
  if (previa?.data) return { data: previa.data, error: null, recuperada: true };
  // 2) insertar; el número NO se envía: lo asigna la base.
  const r = await sb.from("ventas").insert({ ...fila, clave_idempotencia: clave }).select().single();
  if (r?.error && r.error.code === "23505") {
    // 3) otro intento con la misma clave ganó la carrera: recuperar esa comanda, no crear otra.
    const otra = await sb.from("ventas").select("*").eq("empresa_id", empresaId).eq("clave_idempotencia", clave).single();
    return { data: otra.data, error: otra.error, recuperada: true };
  }
  return { data: r?.data ?? null, error: r?.error ?? null, recuperada: false };
}
// Al recargar: ¿la comanda pendiente ya está en la base? Devuelve su id y folio, o null (la clave queda para reintentar).
export async function recuperarPendiente(sb: Cliente, a: Almacen | null | undefined, empresaId: string): Promise<{ id: string; numero: number } | null> {
  const p = leerIntencion(a, empresaId);
  if (!p) return null;
  const r = await sb.from("ventas").select("id,numero").eq("empresa_id", empresaId).eq("clave_idempotencia", p.clave).maybeSingle();
  return r?.data ?? null;
}
