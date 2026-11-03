// Turnos de caja en el SERVIDOR. Reglas:
//  * El turno empieza al abrirlo y termina SOLO con cerrarTurno (no hay lógica por fecha ni medianoche).
//  * Todo se recalcula en la base (funciones turno_*, migración 08) con lo guardado; nada viene del navegador.
//  * Negocio = sesión firmada: un turno de otro negocio nunca se lee ni se modifica.
type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type SesionT = { rol: "admin" | "garzon"; empresa_id: string; nombre: string };
export type RespT = { status: number; body: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIOS_CONTADOS = ["efectivo", "debito", "credito", "transferencia", "qr", "por_conciliar"] as const;
const MAX_MONTO = 100_000_000;
const err = (status: number, error: string): RespT => ({ status, body: { ok: false, error } });
const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_MONTO ? v : null);
// El ESPERADO que se confirma puede ser negativo (gastos y retiros mayores que el efectivo registrado); lo CONTADO nunca.
const enteroConSigno = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= MAX_MONTO ? v : null);

const MENSAJES: Record<string, [number, string]> = {
  ya_abierto: [409, "Ya hay un turno abierto"],
  ya_cerrado: [409, "Este turno ya fue cerrado"],
  turno_cerrado: [409, "El turno ya está cerrado"],
  turno_no_encontrado: [404, "Turno no encontrado"],
  falta_efectivo_contado: [400, "Falta contar el efectivo"],
  fondo_invalido: [400, "Fondo inválido"],
  monto_invalido: [400, "Monto inválido"],
  motivo_requerido: [400, "Indica el motivo"],
  medio_invalido: [400, "Medio inválido"],
  ya_conciliado: [409, "Este cobro ya estaba confirmado con ese medio"],
  no_es_point: [409, "Solo se corrigen cobros Point"],
  medio_informado_por_point: [409, "Mercado Pago informó el medio de este cobro; no se cambia aquí"],
  no_encontrado: [404, "Cobro no encontrado"],
  medio_duplicado_en_venta: [409, "Esa venta ya tiene ese medio"],
  resumen_cambio: [409, "Entraron cobros o gastos nuevos mientras revisabas. Revisa las cifras actualizadas y confirma de nuevo"],
};
function desdeRpc(r: any): RespT {
  if (r?.error) return err(500, "No se pudo completar la operación");
  const d = r?.data ?? {};
  if (d.ok) return { status: 200, body: d };
  const [st, msg] = MENSAJES[d.codigo] ?? [400, "Operación rechazada"];
  return { status: st, body: { ok: false, error: msg, codigo: d.codigo, turno_id: d.turno_id, resumen: d.resumen } };
}

export async function turnoAbiertoDe(db: Db, empresaId: string): Promise<string | null> {
  const r = await db.from("aperturas_caja").select("id").eq("empresa_id", empresaId).eq("estado", "abierta").eq("modelo", "v2").limit(1).maybeSingle();
  return r?.data?.id ?? null;
}
async function turnoPropio(db: Db, empresaId: string, turnoId: unknown): Promise<string | null> {
  if (typeof turnoId !== "string" || !UUID.test(turnoId)) return null;
  const r = await db.from("aperturas_caja").select("id").eq("id", turnoId).eq("empresa_id", empresaId).eq("modelo", "v2").maybeSingle();
  return r?.data?.id ?? null;
}

// GET: turno abierto (o el último cerrado) con resumen recalculado y cobros por conciliar.
export async function estadoTurno(db: Db, s: SesionT): Promise<RespT> {
  let id = await turnoAbiertoDe(db, s.empresa_id);
  let abierto = true;
  if (!id) {
    const u = await db.from("aperturas_caja").select("id").eq("empresa_id", s.empresa_id).eq("modelo", "v2").order("created_at", { ascending: false }).limit(1).maybeSingle();
    id = u?.data?.id ?? null; abierto = false;
  }
  if (!id) return { status: 200, body: { ok: true, turno: null } };
  const r = await db.rpc("turno_resumen", { p_turno: id });
  if (r?.error) return err(500, "No se pudo leer el turno");
  let porConciliar: unknown[] = [];
  let pointConfirmados: unknown[] = [];
  if (abierto) {
    // Para distinguir un Point de otro: comanda, mesa, hora y referencia de la orden (solo importe no basta).
    const detalle = async (filas: any[]) => {
      const ids = filas.map((f) => f.venta_id);
      const v = ids.length ? await db.from("ventas").select("id,numero,mesa,mesero").eq("empresa_id", s.empresa_id).in("id", ids) : { data: [] };
      const p = ids.length ? await db.from("pagos_point").select("venta_id,mp_order_id,referencia_externa").eq("restaurante_id", s.empresa_id).in("venta_id", ids) : { data: [] };
      const vm = new Map<string, any>((v?.data ?? []).map((x: any) => [x.id, x]));
      const pm = new Map<string, any>((p?.data ?? []).map((x: any) => [x.venta_id, x]));
      return filas.map((f) => ({
        id: f.id, monto: f.monto, proveedor: f.proveedor, medio: f.medio, hora: f.created_at,
        comanda: vm.get(f.venta_id)?.numero ?? null, mesa: vm.get(f.venta_id)?.mesa ?? null, mesero: vm.get(f.venta_id)?.mesero ?? null,
        referencia: String(pm.get(f.venta_id)?.referencia_externa ?? pm.get(f.venta_id)?.mp_order_id ?? "").slice(-8) || null,
      }));
    };
    const c = await db.from("cobros_turno").select("id,venta_id,monto,proveedor,medio,created_at").eq("turno_id", id).eq("medio", "por_conciliar").is("anulado_at", null).order("created_at", { ascending: true }).limit(200);
    porConciliar = await detalle(c?.data ?? []);
    // Point que la cajera ya confirmó: se pueden corregir mientras el turno siga abierto.
    const k = await db.from("cobros_turno").select("id,venta_id,monto,proveedor,medio,created_at").eq("turno_id", id).eq("proveedor", "point").neq("medio", "por_conciliar").not("conciliado_at", "is", null).is("anulado_at", null).order("created_at", { ascending: true }).limit(200);
    pointConfirmados = await detalle(k?.data ?? []);
  }
  return { status: 200, body: { ok: true, abierto, resumen: r.data, por_conciliar: porConciliar, point_confirmados: pointConfirmados } };
}

export async function accionTurno(db: Db, s: SesionT, b: any): Promise<RespT> {
  const a = b?.accion;
  if (a === "abrir") {
    const fondo = entero(b.fondo);
    if (fondo === null) return err(400, "Fondo inválido");
    return desdeRpc(await db.rpc("turno_abrir", { p_empresa: s.empresa_id, p_fondo: fondo, p_cajero: s.nombre }));
  }
  const turno = await turnoPropio(db, s.empresa_id, b?.turno_id);
  if (!turno) return err(404, "Turno no encontrado");
  if (a === "retiro") {
    const monto = entero(b.monto);
    const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 200) : "";
    const para = typeof b.entregado_a === "string" ? b.entregado_a.trim().slice(0, 80) : null;
    if (!monto) return err(400, "Monto inválido");
    return desdeRpc(await db.rpc("movimiento_registrar", { p_turno: turno, p_monto: monto, p_motivo: motivo, p_entregado_a: para, p_por: s.nombre }));
  }
  if (a === "conciliar") {
    if (typeof b.cobro_id !== "string" || !UUID.test(b.cobro_id)) return err(400, "Cobro inválido");
    // el cobro debe pertenecer a este turno (y por tanto a este negocio)
    const c = await db.from("cobros_turno").select("id").eq("id", b.cobro_id).eq("turno_id", turno).maybeSingle();
    if (!c?.data) return err(404, "Cobro no encontrado");
    return desdeRpc(await db.rpc("cobro_conciliar", { p_cobro: b.cobro_id, p_medio: String(b.medio ?? ""), p_por: s.nombre }));
  }
  if (a === "cerrar") {
    if (typeof b.clave !== "string" || !UUID.test(b.clave)) return err(400, "Falta la clave de cierre");
    const contados: Record<string, number> = {};
    for (const m of MEDIOS_CONTADOS) {
      if (b.contados?.[m] === undefined || b.contados?.[m] === null || b.contados?.[m] === "") continue;
      const v = entero(b.contados[m]);
      if (v === null) return err(400, `Monto contado inválido (${m})`);
      contados[m] = v;
    }
    // Lo que la cajera tenía en pantalla: si cambió en el servidor, la base rechaza el cierre y devuelve las cifras nuevas.
    const visto: Record<string, number> = {};
    for (const m of MEDIOS_CONTADOS) { const v = enteroConSigno(b.esperado_visto?.[m]); if (v === null) return err(400, "Falta el resumen que se está confirmando"); visto[m] = v; }
    const notas = typeof b.notas === "string" ? b.notas.trim().slice(0, 500) : null;
    return desdeRpc(await db.rpc("turno_cerrar", { p_turno: turno, p_contados: contados, p_notas: notas, p_clave: b.clave, p_por: s.nombre, p_esperado_visto: visto }));
  }
  return err(400, "Acción desconocida");
}

// Historial auditable: últimos cierres del negocio con esperado/contado/diferencia por medio.
export async function historialTurnos(db: Db, s: SesionT): Promise<RespT> {
  const c = await db.from("cierres_turno").select("id,turno_id,fecha_apertura,apertura_at,cierre_at,fondo_contado,cerrado_por,notas,con_pendientes").eq("empresa_id", s.empresa_id).order("cierre_at", { ascending: false }).limit(30);
  const ids = (c?.data ?? []).map((x: any) => x.id);
  const m = ids.length ? await db.from("cierres_turno_medios").select("cierre_id,medio,esperado,contado,diferencia").in("cierre_id", ids) : { data: [] };
  const por: Record<string, unknown[]> = {};
  for (const x of m?.data ?? []) (por[x.cierre_id] ??= []).push(x);
  return { status: 200, body: { ok: true, cierres: (c?.data ?? []).map((x: any) => ({ ...x, medios: por[x.id] ?? [] })) } };
}
