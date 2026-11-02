// Autenticación y autorización de los envíos al bot de WhatsApp y del cron. Lógica pura y probada.
import { createHash, timingSafeEqual } from "crypto";
import type { SesionServidor } from "./restaurante";

const iguales = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Vercel Cron envía "Authorization: Bearer $CRON_SECRET". Sin secreto configurado se rechaza todo.
export function cronAutorizado(authorization: string | null, secreto?: string): boolean {
  if (!secreto || secreto.length < 24 || !authorization) return false;
  return iguales(authorization, `Bearer ${secreto}`);
}

// Campos que el cierre de turno puede enviar al bot. Todo lo demás (p. ej. mensaje_custom, reporte_semanal) se descarta.
const NUM = ["turno", "turno_num", "total_turnos_hoy", "ventas_total", "ventas_efectivo", "ventas_debito", "ventas_qr", "ventas_transferencia",
  "efectivo_fisico", "debito_fisico", "qr_fisico", "transfer_fisico", "total_fisico", "diferencia", "cantidad_ventas", "total_dia",
  "total_gastos_turno", "total_gastos_dia", "total_propinas_turno", "efectivo_esperado", "fondo_inicial", "gastos_caja"] as const;
const TXT = ["cajero", "fecha", "hora_apertura", "hora_cierre"] as const;

export type PayloadBot = Record<string, unknown>;
export type ResultadoCierre = { ok: true; payload: PayloadBot } | { ok: false; status: 401 | 403 | 400 | 503; error: string };

export function autorizarCierreWhatsapp(
  sesion: SesionServidor | null,
  datos: unknown,
  cfg: { empresaPermitida?: string; botConfigurado: boolean }
): ResultadoCierre {
  if (!sesion) return { ok: false, status: 401, error: "Sin sesión" };
  if (!cfg.botConfigurado || !cfg.empresaPermitida) return { ok: false, status: 503, error: "Notificaciones no configuradas" };
  // Autorización: solo usuarios del negocio vinculado a este bot, con rol de caja o administración.
  if (sesion.empresa_id !== cfg.empresaPermitida || !["admin", "garzon"].includes(sesion.rol)) {
    return { ok: false, status: 403, error: "No autorizado" };
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return { ok: false, status: 400, error: "Datos inválidos" };
  const d = datos as Record<string, unknown>;
  const p: PayloadBot = {};
  for (const k of NUM) if (typeof d[k] === "number" && Number.isFinite(d[k] as number)) p[k] = d[k];
  for (const k of TXT) if (typeof d[k] === "string") p[k] = (d[k] as string).slice(0, 60);
  if (typeof d.alerta_diferencia === "boolean") p.alerta_diferencia = d.alerta_diferencia;
  if (Array.isArray(d.gastos_turno)) {
    p.gastos_turno = d.gastos_turno.slice(0, 50).map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return { categoria: String(x.categoria ?? "").slice(0, 80), monto: Number.isFinite(Number(x.monto)) ? Number(x.monto) : 0 };
    });
  }
  if (Array.isArray(d.propinas_por_empleado)) {
    p.propinas_por_empleado = d.propinas_por_empleado.slice(0, 50).map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return { empleado: String(x.empleado ?? "").slice(0, 60), monto: Number.isFinite(Number(x.monto)) ? Number(x.monto) : 0 };
    });
  }
  return { ok: true, payload: p };
}
