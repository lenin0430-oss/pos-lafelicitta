// Préstamos de trabajadores que el administrador descuenta de su pago diario (migración 14). Reglas:
//  * Todo se decide en la base (prestamo_crear / prestamo_descontar / prestamo_deshacer / prestamos_estado).
//  * Negocio y autor = sesión firmada. Solo el administrador ve y toca préstamos.
//  * NO mueve la caja: el sueldo se sigue registrando en Gastos como siempre. Esto solo lleva la cuenta.
import type { SesionA, RespA } from "./abonosServidor";

type Db = { rpc: (fn: string, args: Record<string, unknown>) => any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const err = (status: number, error: string, extra: Record<string, unknown> = {}): RespA => ({ status, body: { ok: false, error, ...extra } });

const MENSAJES: Record<string, [number, string]> = {
  trabajador_invalido: [400, "Escribe el nombre del trabajador"],
  montos_invalidos: [400, "Revisa el monto total y la cuota diaria"],
  no_encontrado: [404, "No se encontró"],
  no_activo: [409, "Este préstamo ya está pagado"],
  ya_descontado_hoy: [409, "Ese día ya estaba descontado"],
  sin_saldo: [409, "Ya no queda saldo por descontar"],
};
function desdeRpc(r: any): RespA {
  if (r?.error) return err(500, "No se pudo completar la operación");
  const d = r?.data ?? {};
  if (d.ok) return { status: 200, body: d };
  const [st, msg] = MENSAJES[d.codigo] ?? [400, "Operación rechazada"];
  return err(st, msg, { codigo: d.codigo });
}
const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : NaN);

export type DescuentoPrestamo = { id: string; fecha: string; monto: number };
export type Prestamo = {
  id: string; trabajador: string; acreedor: string | null; monto_total: number; cuota_diaria: number; fecha_inicio: string;
  estado: "activo" | "pagado"; notas: string | null; pagado: number; saldo: number; cuotas_pagadas: number;
  dias_pendientes: string[]; descuentos: DescuentoPrestamo[];
};

export async function listarPrestamos(db: Db, s: SesionA): Promise<RespA> {
  if (s.rol !== "admin") return { status: 200, body: { ok: true, prestamos: [], hoy: null } };
  return desdeRpc(await db.rpc("prestamos_estado", { p_empresa: s.empresa_id }));
}

// POST { accion: "crear", trabajador, acreedor?, total, cuota, inicio?, notas? }
//    | { accion: "descontar", id, fecha? }   (una cuota en esa fecha; hoy si no viene)
//    | { accion: "deshacer", descuento_id }
export async function accionPrestamo(db: Db, s: SesionA, b: any): Promise<RespA> {
  if (s.rol !== "admin") return err(403, "Solo el administrador maneja préstamos");
  if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "Solicitud inválida");
  if (b.accion === "crear") {
    const t = texto(b.trabajador, 60);
    if (!t) return err(400, MENSAJES.trabajador_invalido[1]);
    const total = entero(b.total), cuota = entero(b.cuota);
    if (!(total > 0) || !(cuota > 0) || cuota > total || total > 100_000_000) return err(400, MENSAJES.montos_invalidos[1]);
    const inicio = typeof b.inicio === "string" && FECHA.test(b.inicio) ? b.inicio : null;
    return desdeRpc(await db.rpc("prestamo_crear", { p_empresa: s.empresa_id, p_trabajador: t, p_acreedor: texto(b.acreedor), p_total: total, p_cuota: cuota, p_inicio: inicio, p_notas: texto(b.notas, 300) }));
  }
  if (b.accion === "descontar") {
    if (typeof b.id !== "string" || !UUID.test(b.id)) return err(400, "Préstamo inválido");
    const fecha = typeof b.fecha === "string" && FECHA.test(b.fecha) ? b.fecha : null;
    return desdeRpc(await db.rpc("prestamo_descontar", { p_empresa: s.empresa_id, p_prestamo: b.id, p_fecha: fecha, p_monto: null, p_por: s.nombre }));
  }
  if (b.accion === "deshacer") {
    if (typeof b.descuento_id !== "string" || !UUID.test(b.descuento_id)) return err(400, "Descuento inválido");
    return desdeRpc(await db.rpc("prestamo_deshacer", { p_empresa: s.empresa_id, p_descuento: b.descuento_id }));
  }
  return err(400, "Acción desconocida");
}
