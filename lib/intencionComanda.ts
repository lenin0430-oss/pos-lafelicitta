// Intención de comanda pendiente: la clave anti-duplicado sobrevive a fallos y a recargas, para que una comanda guardada cuya
// respuesta se perdió se RECUPERE (misma venta, mismo folio) en vez de crear otra. El folio lo asigna solo la base.
//  · Una intención por PESTAÑA (id de pestaña en sessionStorage): dos pestañas con los mismos productos NO comparten clave.
//  · La clave vive SIEMPRE en memoria; el almacenamiento del navegador es un respaldo para recargas (si falla, no cambia nada).
//  · Pestaña DUPLICADA (el navegador copia sessionStorage y con él el id): cada pestaña viva reclama su id con un «arrendamiento»
//    en localStorage (con latido; se libera al cerrar o recargar). Si otra instancia viva ya lo tiene, esta toma un id NUEVO y no hereda
//    la intención de la original. Una recarga legítima libera el arrendamiento al salir y recupera lo suyo.
//  · Reapertura inmediata sin liberar (cierre brusco → misma pestaña): la página nueva PREGUNTA por un canal entre pestañas (BroadcastChannel)
//    si la instancia anterior sigue viva; si nadie contesta en ~300 ms, retoma el MISMO id y su intención (no hay que esperar 130 s).
//  · Red de seguridad: las intenciones «huérfanas» (de un id sin instancia viva) se COMPRUEBAN en el servidor antes de enviar otra comanda:
//    si la venta existe se recupera con su folio; si no se puede confirmar, el envío queda BLOQUEADO hasta resolverla (comprobar o descartar).
//  · «Comanda nueva» es una acción explícita (cerrar): comandas con productos idénticos, pero distintas, usan claves distintas.
export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem"> & { key?: (i: number) => string | null; readonly length?: number };
export type Intencion = { clave: string; empresa_id: string; huella: string; ts: number; mesa?: string; total?: number };
export type Canal = { postMessage(m: unknown): void; onmessage: ((e: { data: any }) => void) | null; close?: () => void };
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

export function crearGestorIntenciones(opc: { local?: Almacen | null; sesion?: Almacen | null; nuevoUuid: () => string; ahora?: () => number; canal?: () => Canal | null; esperaMs?: number }) {
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
  // ---- Arranque: decide la identidad de esta página ANTES de leer o enviar nada (la página espera `iniciar()`). ----
  let iniciado: Promise<void> | null = null;
  let listo = false;
  let ancestroDudoso: string | null = null;     // id al que se renunció sin poder confirmar si seguía vivo (sin canal)
  const iniciar = (): Promise<void> => (iniciado ??= (async () => {
    const g = seguro(() => opc.sesion?.getItem(LLAVE_TAB) ?? null, null);
    tabMem = g && UUID.test(g) ? g : opc.nuevoUuid();
    if (tabMem !== g) seguro(() => opc.sesion?.setItem(LLAVE_TAB, tabMem as string), undefined);
    const canal = seguro(() => opc.canal?.() ?? null, null);
    let esperando: { nonce: string; res: (b: boolean) => void } | null = null;
    if (canal) canal.onmessage = (e) => {
      const m = e?.data;
      if (m && m.t === "ping" && m.tab === tabMem && m.de !== instancia) canal.postMessage({ t: "pong", tab: m.tab, nonce: m.nonce });
      else if (m && m.t === "pong" && esperando && m.nonce === esperando.nonce) esperando.res(true);
    };
    const l = seguro(() => JSON.parse(opc.local?.getItem(LLAVE_LEASE + tabMem) ?? "null") as { i?: string; ts?: number } | null, null);
    if (l && l.i && l.i !== instancia && ahora() - (l.ts ?? 0) < LEASE_MS) {
      let vivo = true;                                                       // sin canal no se puede confirmar: se asume viva (duplicada)
      if (canal) vivo = await new Promise<boolean>((res) => {
        const nonce = opc.nuevoUuid(); esperando = { nonce, res };
        const t = setTimeout(() => res(false), opc.esperaMs ?? 300);
        const fin = res; esperando.res = (b) => { clearTimeout(t); fin(b); };
        canal.postMessage({ t: "ping", tab: tabMem, de: instancia, nonce });
      });
      if (vivo) { duplicada = true; if (!canal) ancestroDudoso = tabMem; fijarTab(opc.nuevoUuid()); }
      // si nadie contestó: la instancia anterior murió sin liberar → se RETOMA el mismo id y su intención
      else seguro(() => opc.local?.setItem(LLAVE_LEASE + (tabMem as string), JSON.stringify({ i: instancia, ts: ahora() })), undefined);
    }
    reclamar();
    listo = true;
  })());
  // Intenciones de otros ids SIN instancia viva (o de un ancestro dudoso): pedidos cuyo resultado puede ser incierto.
  const huerfanas = (empresaId: string): Intencion[] & { tab?: string }[] => {
    const out: any[] = [];
    const n = seguro(() => opc.local?.length ?? 0, 0);
    for (let i = 0; i < n; i++) {
      const k = seguro(() => opc.local?.key?.(i) ?? null, null);
      if (!k || !k.startsWith(LLAVE)) continue;
      const tab = k.slice(LLAVE.length); if (tab === tabMem) continue;
      const x = seguro(() => JSON.parse(opc.local?.getItem(k) ?? "null") as Intencion | null, null);
      if (!vigente(x, empresaId)) continue;
      const le = seguro(() => JSON.parse(opc.local?.getItem(LLAVE_LEASE + tab) ?? "null") as { ts?: number } | null, null);
      const muerta = !le || ahora() - (le.ts ?? 0) >= LEASE_MS || tab === ancestroDudoso;
      if (muerta) out.push({ ...x, tab });
    }
    return out;
  };
  return {
    iniciar, huerfanas,
    get listo() { return listo; },
    descartar(tab: string): void { seguro(() => { opc.local?.removeItem(LLAVE + tab); opc.local?.removeItem(LLAVE_LEASE + tab); }, undefined); },
    tabId, leer,
    get duplicada() { return duplicada; },
    latido(): void { tabId(); },                                         // renovar el arrendamiento (la página lo llama cada ~20 s y al volver a verse)
    liberar(): void {                                                    // pagehide: cerrar o recargar libera el id para la recarga legítima
      if (!tabMem) return; const k = LLAVE_LEASE + tabMem;
      seguro(() => { const l = JSON.parse(opc.local?.getItem(k) ?? "null"); if (l && l.i === instancia) opc.local?.removeItem(k); }, undefined);
    },
    claveParaEnvio(empresaId: string, huella: string, info?: { mesa?: string; total?: number }): string {
      const p = leer(empresaId);
      if (p && p.huella === huella) return p.clave;                       // reintento de la misma comanda
      const n: Intencion = { clave: opc.nuevoUuid(), empresa_id: empresaId, huella, ts: ahora(), ...(info?.mesa !== undefined ? { mesa: info.mesa } : {}), ...(info?.total !== undefined ? { total: info.total } : {}) };
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

// Comprueba en el servidor los pedidos inciertos de ids sin instancia viva. Recuperadas: la venta existe (mismo folio) y se retira la
// intención; inciertas: no se pudo confirmar (no existe todavía o no hubo respuesta) → el envío de otra comanda queda BLOQUEADO.
export async function resolverHuerfanas(sb: Cliente, g: GestorIntenciones, empresaId: string): Promise<{ recuperadas: { id: string; numero: number; mesa?: string }[]; inciertas: { tab: string; clave: string; mesa?: string; total?: number }[] }> {
  const recuperadas: { id: string; numero: number; mesa?: string }[] = []; const inciertas: { tab: string; clave: string; mesa?: string; total?: number }[] = [];
  for (const o of g.huerfanas(empresaId) as any[]) {
    let r: any = null;
    try { r = await sb.from("ventas").select("id,numero,mesa").eq("empresa_id", empresaId).eq("clave_idempotencia", o.clave).maybeSingle(); } catch { r = { error: true }; }
    if (r?.data) { recuperadas.push({ id: r.data.id, numero: r.data.numero, mesa: r.data.mesa }); g.descartar(o.tab); }
    else inciertas.push({ tab: o.tab, clave: o.clave, mesa: o.mesa, total: o.total });
  }
  return { recuperadas, inciertas };
}
