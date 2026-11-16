// Abonos (pago en partes) en el SERVIDOR. Reglas:
//  * Todo se decide en la base (funciones registrar_abono / cobrar_saldo, migración 11) con lo guardado: bloquean la venta, exigen turno abierto
//    y escriben el dinero en el turno en que de verdad entra. Nada de importes o estados viene del navegador.
//  * Negocio y autor = sesión firmada. El navegador solo dice QUÉ venta, CUÁNTO y con QUÉ medio.
type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type SesionA = { rol: "admin" | "garzon"; empresa_id: string; nombre: string };
export type RespA = { status: number; body: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEDIOS_ABONO = ["efectivo", "debito", "credito", "transferencia"] as const;
const MAX_MONTO = 50_000_000;
const err = (status: number, error: string, extra: Record<string, unknown> = {}): RespA => ({ status, body: { ok: false, error, ...extra } });

const MENSAJES: Record<string, [number, string]> = {
  medio_invalido: [400, "Medio de pago inválido"],
  monto_invalido: [400, "Monto inválido"],
  venta_no_encontrada: [404, "Venta no encontrada"],
  ya_cobrada: [409, "Esta venta ya está cobrada"],
  point_en_curso: [409, "Hay un cobro Point en curso para esta venta"],
  abono_cubre_todo: [409, "El abono cubre todo el saldo: usa «Cobrar saldo»"],
  sin_turno: [409, "No hay turno abierto: ábrelo en «Cierre» para cobrar"],
  no_abonada: [409, "Esta venta no tiene saldo por cobrar"],
  sin_saldo: [409, "Esta venta no tiene saldo por cobrar"],
};
function desdeRpc(r: any): RespA {
  if (r?.error) return err(500, "No se pudo completar la operación");
  const d = r?.data ?? {};
  if (d.ok) return { status: 200, body: d };
  const [st, msg] = MENSAJES[d.codigo] ?? [400, "Operación rechazada"];
  return err(st, msg, { codigo: d.codigo, saldo: d.saldo });
}

// Texto libre corto (nombre o teléfono del cliente): sin caracteres de control.
export function limpiarCliente(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 80) : null;
}

// POST { accion: "abonar", venta_id, monto, medio, cliente? } | { accion: "cobrar_saldo", venta_id, medio }
export async function accionAbono(db: Db, s: SesionA, b: any): Promise<RespA> {
  if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "Solicitud inválida");
  if (typeof b.venta_id !== "string" || !UUID.test(b.venta_id)) return err(400, "Venta inválida");
  if (typeof b.medio !== "string" || !(MEDIOS_ABONO as readonly string[]).includes(b.medio)) return err(400, "Medio de pago inválido");
  if (b.accion === "abonar") {
    if (typeof b.monto !== "number" || !Number.isInteger(b.monto) || b.monto <= 0 || b.monto > MAX_MONTO) return err(400, "Monto inválido");
    return desdeRpc(await db.rpc("registrar_abono", { p_empresa: s.empresa_id, p_venta: b.venta_id, p_monto: b.monto, p_medio: b.medio, p_cliente: limpiarCliente(b.cliente), p_por: s.nombre }));
  }
  if (b.accion === "cobrar_saldo") {
    return desdeRpc(await db.rpc("cobrar_saldo", { p_empresa: s.empresa_id, p_venta: b.venta_id, p_medio: b.medio, p_por: s.nombre }));
  }
  return err(400, "Acción no válida");
}

export type PorCobrar = {
  venta_id: string; numero: number | null; mesa: string | null; total: number; creada: string;
  abonado: number; saldo: number; cliente: string | null; abonos: { monto: number; medio: string; at: string }[];
};

// GET: ventas con saldo por cobrar del negocio de la sesión (las más antiguas primero).
export async function listarPorCobrar(db: Db, s: SesionA): Promise<RespA> {
  const v = await db.from("ventas").select("id,numero,mesa,total,created_at").eq("empresa_id", s.empresa_id).eq("estado_pago", "abonada").order("created_at", { ascending: true }).limit(300);
  if (v?.error) return err(500, "No se pudo leer las ventas por cobrar");
  const ventas: any[] = v?.data ?? [];
  if (ventas.length === 0) return { status: 200, body: { ok: true, ventas: [] } };
  const a = await db.from("abonos").select("venta_id,monto,medio,cliente,tipo,created_at").eq("empresa_id", s.empresa_id).eq("tipo", "abono").is("anulado_at", null).in("venta_id", ventas.map((x) => x.id)).order("created_at", { ascending: true });
  if (a?.error) return err(500, "No se pudo leer los abonos");
  const porVenta = new Map<string, any[]>();
  for (const x of a?.data ?? []) porVenta.set(x.venta_id, [...(porVenta.get(x.venta_id) ?? []), x]);
  const out: PorCobrar[] = ventas.map((x) => {
    const ab = porVenta.get(x.id) ?? [];
    const abonado = ab.reduce((t, y) => t + (y.monto || 0), 0);
    return { venta_id: x.id, numero: x.numero ?? null, mesa: x.mesa ?? null, total: x.total, creada: x.created_at, abonado, saldo: x.total - abonado,
      cliente: ab.map((y) => y.cliente).find((c) => !!c) ?? null, abonos: ab.map((y) => ({ monto: y.monto, medio: y.medio, at: y.created_at })) };
  });
  return { status: 200, body: { ok: true, ventas: out } };
}
