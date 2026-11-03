import { NextResponse } from "next/server";
import { mpFetch, supabaseAdmin } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";
import { iniciarCobroPoint, type PuertoMP, type PuertoPagos, type Reserva } from "@/lib/pointCobro";
import { ESTADOS_ORDEN_ACTIVA } from "@/lib/pointGuard";

const COLS = "id, venta_id, monto, estado, mp_order_id, clave_idempotencia, referencia_externa";

// POST /api/point/cobrar  body: { ventaId: string, monto: number }
// Requiere supabase/03 y 04 aplicadas (estado_pago y reserva atómica de cobros).
export async function POST(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req);
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { ventaId, monto } = await req.json();
  if (!ventaId || !Number.isInteger(monto) || monto <= 0) {
    return NextResponse.json({ error: "ventaId y monto (entero CLP) son obligatorios" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // El total y el estado de pago los manda la base, no el navegador.
  const { data: venta, error: errVenta } = await db
    .from("ventas").select("total, estado, estado_pago")
    .eq("empresa_id", restauranteId).eq("id", ventaId).maybeSingle();
  // 42703 = columna inexistente: este código se desplegó antes de aplicar la migración 03. Falla cerrado, sin tocar Mercado Pago.
  if (errVenta?.code === "42703") return NextResponse.json({ error: "Falta aplicar la migración 03 (estado_pago). No se inició ningún cobro.", reintentable: false }, { status: 503 });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  const { data: cuenta } = await db.from("mp_cuentas").select("terminal_id").eq("restaurante_id", restauranteId).maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "Conecta Mercado Pago primero" }, { status: 400 });
  if (!cuenta.terminal_id) return NextResponse.json({ error: "Elige tu Point en Configuración" }, { status: 400 });

  const pagos: PuertoPagos = {
    async reservar({ restauranteId: rid, ventaId: vid, monto: m }) {
      const id = crypto.randomUUID();
      const referencia = `venta_${String(vid).replace(/[^a-zA-Z0-9_-]/g, "")}_${id.slice(0, 8)}`.slice(0, 64);
      const ins = await db.from("pagos_point")
        .insert({ id, restaurante_id: rid, venta_id: String(vid), monto: m, estado: "reservado", referencia_externa: referencia })
        .select(COLS).single();
      if (!ins.error && ins.data) return { reserva: ins.data as Reserva, creada: true };
      if (ins.error?.code !== "23505") throw ins.error ?? new Error("No se pudo reservar el cobro");
      // Ya hay un intento activo (otra solicitud simultánea o reintento): se une a él.
      const ex = await db.from("pagos_point").select(COLS)
        .eq("restaurante_id", rid).eq("venta_id", String(vid)).in("estado", [...ESTADOS_ORDEN_ACTIVA])
        .order("created_at", { ascending: false }).limit(1).single();
      if (ex.error || !ex.data) throw ex.error ?? new Error("No se encontró el intento activo");
      return { reserva: ex.data as Reserva, creada: false };
    },
    async guardarOrden(reservaId, o) {
      const { error } = await db.from("pagos_point")
        .update({ mp_order_id: o.mp_order_id, estado: o.estado, updated_at: new Date().toISOString() }).eq("id", reservaId);
      if (error) throw error;
    },
    async cerrar(reservaId, estado, detalle) {
      await db.from("pagos_point").update({ estado, detalle, updated_at: new Date().toISOString() }).eq("id", reservaId);
    },
  };

  const mp: PuertoMP = {
    async crearOrden({ clave, referencia, monto: m, terminalId }) {
      const r = await mpFetch(restauranteId, "/v1/orders", {
        method: "POST",
        idempotencyKey: clave,
        body: JSON.stringify({
          type: "point",
          external_reference: referencia,
          expiration_time: "PT5M",
          transactions: { payments: [{ amount: String(m) }] },
          config: { point: { terminal_id: terminalId } },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: r.status, code: data?.errors?.[0]?.code };
      return { ok: true, orden: { id: data.id, status: data.status } };
    },
  };

  try {
    const out = await iniciarCobroPoint(pagos, mp, { restauranteId, ventaId: String(ventaId), monto, terminalId: cuenta.terminal_id, venta });
    if (!out.ok) {
      console.error("Point cobrar:", { status: out.status, ventaId, orderId: out.orderId });
      return NextResponse.json({ error: out.error, orderId: out.orderId, reintentable: out.reintentable, codigo: out.codigo }, { status: out.status });
    }
    return NextResponse.json({ orderId: out.orderId, estado: out.estado });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42703" || code === "42P01") return NextResponse.json({ error: "Falta aplicar la migración 04 (reserva de cobros). No se inició ningún cobro.", reintentable: false }, { status: 503 });
    console.error("Point cobrar (inesperado):", ventaId, (e as Error).message);
    return NextResponse.json({ error: "No se pudo iniciar el cobro. Reintenta; no se duplicará.", reintentable: true }, { status: 503 });
  }
}
