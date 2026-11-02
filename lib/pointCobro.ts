// Orquestación del cobro Point, sin dependencias de red/base (se inyectan "puertos"), para poder probarla.
//
// Garantía de no-duplicados (NO depende de "mirar antes si ya existe"):
//  1. RESERVA atómica en la base: un índice único parcial permite UN intento activo por venta (supabase/04).
//  2. La clave de idempotencia se guarda en la fila y es la MISMA en todo reintento/solicitud simultánea,
//     así que Mercado Pago devuelve la misma orden en vez de crear otra.
//  3. Si se pierde la respuesta o falla el guardado, la fila queda 'reservado' y el siguiente intento
//     repite la llamada con la misma clave y recupera la orden.
import { type ResultadoMP, esFalloAmbiguo } from "./pointGuard";
import { ventaPuedeCobrarse } from "./estados";

export type Reserva = {
  id: string;
  venta_id: string;
  monto: number;
  estado: string;
  mp_order_id: string | null;
  clave_idempotencia: string;
  referencia_externa: string;
};

export interface PuertoPagos {
  // Atómico. Si ya hay un intento activo para (restaurante, venta) lo devuelve con creada=false.
  reservar(i: { restauranteId: string; ventaId: string; monto: number }): Promise<{ reserva: Reserva; creada: boolean }>;
  guardarOrden(reservaId: string, o: { mp_order_id: string; estado: string }): Promise<void>; // puede lanzar
  cerrar(reservaId: string, estado: string, detalle: string): Promise<void>;
}
export interface PuertoMP {
  crearOrden(i: { clave: string; referencia: string; monto: number; terminalId: string }): Promise<ResultadoMP>;
}

export type Entrada = {
  restauranteId: string;
  ventaId: string;
  monto: number;
  terminalId: string;
  venta: { total: number; estado?: string | null; estado_pago?: string | null };
};

export type Salida =
  | { ok: true; status: 200; orderId: string; estado: string }
  | { ok: false; status: number; error: string; orderId?: string; reintentable?: boolean };

export async function iniciarCobroPoint(
  pagos: PuertoPagos,
  mp: PuertoMP,
  e: Entrada
): Promise<Salida> {
  if (!ventaPuedeCobrarse(e.venta)) return { ok: false, status: 409, error: "La venta ya está cobrada" };
  if (Math.round(e.venta.total) !== e.monto) {
    return { ok: false, status: 409, error: "El total cambió. Presiona «Actualizar cocina» y reintenta." };
  }

  // La base valida empresa, estado de pago E IMPORTE bajo el bloqueo de la venta (supabase/07c): P0409 = la venta cambió o ya está cobrada.
  // Se responde 409 estable ANTES de llamar al proveedor; el navegador debe refrescar la comanda y reintentar con el total vigente.
  let reservado: { reserva: Reserva; creada: boolean };
  try {
    reservado = await pagos.reservar({ restauranteId: e.restauranteId, ventaId: e.ventaId, monto: e.monto });
  } catch (err) {
    const x = err as { code?: string; message?: string };
    if (x?.code === "P0409") {
      return /VENTA_YA_COBRADA/.test(x.message ?? "")
        ? { ok: false, status: 409, error: "La venta ya está cobrada", reintentable: false }
        : { ok: false, status: 409, error: "El total de la venta cambió. Presiona «Actualizar cocina» y reintenta.", reintentable: false };
    }
    throw err;
  }
  const { reserva } = reservado;

  if (reserva.monto !== e.monto) {
    return { ok: false, status: 409, error: "Hay un cobro Point en curso con otro monto para esta venta. Cancélalo en el Point primero." };
  }
  // Ya registrada con orden: no hay nada que crear.
  if (reserva.mp_order_id) return { ok: true, status: 200, orderId: reserva.mp_order_id, estado: reserva.estado };

  // Sin orden registrada (nuevo o recuperación): llamada IDEMPOTENTE con la clave guardada en la fila.
  let r: ResultadoMP;
  try {
    r = await mp.crearOrden({ clave: reserva.clave_idempotencia, referencia: reserva.referencia_externa, monto: e.monto, terminalId: e.terminalId });
  } catch {
    r = { ok: false, status: 0 };
  }

  if (!r.ok) {
    if (esFalloAmbiguo(r.status)) {
      // No sabemos si MP creó la orden: se conserva la reserva para reintentar con la misma clave.
      return { ok: false, status: 503, reintentable: true, error: "No se confirmó el envío al Point. Reintenta: no se duplicará el cobro." };
    }
    await pagos.cerrar(reserva.id, "failed", `mp_${r.status}_${r.code ?? ""}`);
    const error = r.code === "already_queued_order_on_terminal"
      ? "La máquina tiene un cobro pendiente. Termínalo o cancélalo en el Point."
      : "No se pudo enviar el cobro al Point.";
    return { ok: false, status: r.status, error };
  }

  try {
    await pagos.guardarOrden(reserva.id, { mp_order_id: r.orden.id, estado: r.orden.status });
  } catch {
    // La orden existe en MP pero no quedó registrada: la reserva sigue 'reservado' con su clave.
    return {
      ok: false, status: 503, reintentable: true, orderId: r.orden.id,
      error: "El cobro se envió al Point pero no se pudo registrar. Reintenta una vez: se recupera el mismo cobro, no se duplica.",
    };
  }
  return { ok: true, status: 200, orderId: r.orden.id, estado: r.orden.status };
}
