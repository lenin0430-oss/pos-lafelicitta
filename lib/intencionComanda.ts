// Intención de comanda pendiente: la clave anti-duplicado sobrevive a fallos y a recargas, para que una comanda guardada cuya
// respuesta se perdió se RECUPERE (misma venta, mismo folio) en vez de crear otra. El folio lo asigna solo la base.
//  · Una intención por PESTAÑA (id de pestaña en sessionStorage): dos pestañas con los mismos productos NO comparten clave.
//  · La clave vive SIEMPRE en memoria; el almacenamiento del navegador es un respaldo para recargas (si falla, no cambia nada).
//  · Pestaña DUPLICADA (el navegador copia sessionStorage y con él el id): cada pestaña viva reclama su id con un «arrendamiento»
//    en localStorage (con latido; se libera al cerrar o recargar). Si otra instancia viva ya lo tiene, esta toma un id NUEVO y no hereda
//    la intención de la original. Una recarga legítima libera el arrendamiento al salir y recupera lo suyo.
//  · «Comanda nueva» es una acción explícita (cerrar): comandas con productos idénticos, pero distintas, usan claves distintas.
export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Intencion = { clave: string; empresa_id: string; huella: string; ts: number };
const LLAVE = "lf_intencion_comanda:";
const LLAVE_TAB = "lf_tab_id";
const VIGENCIA_MS = 24 * 3600 * 1000;
const LLAVE_LEASE = "lf_tab_lease:";
const LEASE_MS = 130_000;   // mayor que el latido más espaciado de una pestaña en segundo plano (el navegador lo frena a ~1/min)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemH = { producto: { nombre: string; precio: number }; cantidad: number; nota?: string };
// Identifica «esta comanda» mientras se reintenta: mismo negocio, mesa y líneas. Si la cajera cambia el pedido, es otra intención.
export function huellaComanda(mesa: string, items: ItemH[]): string {
  return JSON.stringify([mesa, items.map((i) => [i.producto.nombre, i.producto.precio, i.cantidad, i.nota ?? ""])]);
}

const seguro = <T,>(f: () => T, otro: T): T => { try { return f(); } catch { return otro; } };

export function crearGestorIntenciones(opc: { local?: Almacen | null; sesion?: Almacen | null; nuevoUuid: () => string; ahora?: () => number }) {
  const ahora = opc.ahora ?? Date.now;
  let tabMem: string | null = null;
  let memoria: Intencion | null = null;
  const instancia = opc.nuevoUuid();      // identifica ESTA carga de página
  let duplicada = false;
  const fijarTab = (id: string) => { tabMem = id; seguro(() => opc.sesion?.setItem(LLAVE_TAB, id), undefined); };
  // Reclama el id de pestaña; si otra instancia viva lo tiene (sessionStorage copiado), toma uno nuevo.
  const reclamar = (): void => {
    for (let n = 0; n < 3 && tabMem; n++) {
      const k = LLAVE_LEASE + tabMem;
      const l = seguro(() => JSON.parse(opc.local?.getItem(k) ?? "null") as { i?: string; ts?: number } | null, null);
      if (l && l.i && l.i !== instancia && ahora() - (l.ts ?? 0) < LEASE_MS) {
        duplicada = true; fijarTab(opc.nuevoUuid());
        if (memoria) seguro(() => opc.local?.setItem(LLAVE + (tabMem as string), JSON.stringify(memoria)), undefined);   // lo que ya iba en vuelo sigue siendo de ESTA instancia
        continue;
      }
      seguro(() => opc.local?.setItem(k, JSON.stringify({ i: instancia, ts: ahora() })), undefined);
      return;
    }
  };
  const tabId = (): string => {
    if (!tabMem) {
      const g = seguro(() => opc.sesion?.getItem(LLAVE_TAB) ?? null, null);
      tabMem = g && UUID.test(g) ? g : opc.nuevoUuid();
      if (tabMem !== g) seguro(() => opc.sesion?.setItem(LLAVE_TAB, tabMem as string), undefined);
    }
    reclamar();
    return tabMem as string;
  };
  const llave = () => LLAVE + tabId();
  const vigente = (x: Intencion | null | undefined, empresaId: string): x is Intencion => !!x && x.empresa_id === empresaId && typeof x.huella === "string" && UUID.test(x.clave) && ahora() - (x.ts ?? 0) < VIGENCIA_MS;
  const leer = (empresaId: string): Intencion | null => {
    if (vigente(memoria, empresaId)) return memoria;
    const d = seguro(() => JSON.parse(opc.local?.getItem(llave()) ?? "null") as Intencion | null, null);   // tras una recarga
    if (vigente(d, empresaId)) { memoria = d; return d; }
    return null;
  };
  return {
    tabId, leer,
    get duplicada() { return duplicada; },
    latido(): void { tabId(); },                                         // renovar el arrendamiento (la página lo llama cada ~20 s y al volver a verse)
    liberar(): void {                                                    // pagehide: cerrar o recargar libera el id para la recarga legítima
      if (!tabMem) return; const k = LLAVE_LEASE + tabMem;
      seguro(() => { const l = JSON.parse(opc.local?.getItem(k) ?? "null"); if (l && l.i === instancia) opc.local?.removeItem(k); }, undefined);
    },
    claveParaEnvio(empresaId: string, huella: string): string {
      const p = leer(empresaId);
      if (p && p.huella === huella) return p.clave;                       // reintento de la misma comanda
      const n: Intencion = { clave: opc.nuevoUuid(), empresa_id: empresaId, huella, ts: ahora() };
      memoria = n;                                                         // en memoria SIEMPRE, aunque el almacenamiento falle
      seguro(() => opc.local?.setItem(llave(), JSON.stringify(n)), undefined);
      return n.clave;
    },
    // Comanda confirmada, o «Comanda nueva» pedida a propósito: la siguiente usa otra clave aunque lleve los mismos productos.
    cerrar(): void { memoria = null; seguro(() => opc.local?.removeItem(llave()), undefined); },
  };
}
export type GestorIntenciones = ReturnType<typeof crearGestorIntenciones>;

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
export async function recuperarPendiente(sb: Cliente, g: GestorIntenciones, empresaId: string): Promise<{ id: string; numero: number } | null> {
  const p = g.leer(empresaId);
  if (!p) return null;
  const r = await sb.from("ventas").select("id,numero").eq("empresa_id", empresaId).eq("clave_idempotencia", p.clave).maybeSingle();
  return r?.data ?? null;
}
