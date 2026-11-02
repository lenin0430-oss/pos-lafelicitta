import { NextResponse } from "next/server";
import { mpFetch, supabaseAdmin } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";
import { ordenPointReutilizable } from "@/lib/pointGuard";

// POST /api/point/cobrar  body: { ventaId: string, monto: number }
export async function POST(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req);
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { ventaId, monto } = await req.json();
  if (!ventaId || !Number.isInteger(monto) || monto <= 0) {
    return NextResponse.json({ error: "ventaId y monto (entero CLP) son obligatorios" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // El total lo manda la base, no el navegador.
  const { data: venta } = await db.from("ventas").select("total, estado").eq("empresa_id", restauranteId).eq("id", ventaId).maybeSingle();
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado === "listo") return NextResponse.json({ error: "La venta ya está cobrada" }, { status: 409 });
  if (Math.round(venta.total) !== monto) {
    return NextResponse.json({ error: "El total cambió. Presiona «Actualizar cocina» y reintenta." }, { status: 409 });
  }

  const { data: cuenta } = await db
    .from("mp_cuentas")
    .select("terminal_id")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "Conecta Mercado Pago primero" }, { status: 400 });
  if (!cuenta.terminal_id) return NextResponse.json({ error: "Elige tu Point en Configuración" }, { status: 400 });

  // Anti-duplicado: si ya hay una orden viva (< 5 min) para esta venta y monto, se reutiliza.
  const { data: previos } = await db
    .from("pagos_point")
    .select("mp_order_id, monto, estado, created_at")
    .eq("restaurante_id", restauranteId)
    .eq("venta_id", String(ventaId))
    .order("created_at", { ascending: false })
    .limit(5);
  const viva = ordenPointReutilizable(previos ?? [], monto);
  if (viva) return NextResponse.json({ orderId: viva.mp_order_id, estado: viva.estado, reutilizada: true });

  const ref = `venta_${String(ventaId).replace(/[^a-zA-Z0-9_-]/g, "")}_${Date.now()}`.slice(0, 64);

  const r = await mpFetch(restauranteId, "/v1/orders", {
    method: "POST",
    idempotency: true,
    body: JSON.stringify({
      type: "point",
      external_reference: ref,
      expiration_time: "PT5M",
      transactions: { payments: [{ amount: String(monto) }] },
      config: { point: { terminal_id: cuenta.terminal_id } },
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const code = data?.errors?.[0]?.code;
    const msg =
      code === "already_queued_order_on_terminal"
        ? "La máquina tiene un cobro pendiente. Termínalo o cancélalo en el Point."
        : "No se pudo enviar el cobro al Point.";
    return NextResponse.json({ error: msg }, { status: r.status });
  }

  const { error: errRegistro } = await db.from("pagos_point").insert({
    restaurante_id: restauranteId,
    venta_id: String(ventaId),
    mp_order_id: data.id,
    monto,
    estado: data.status,
  });
  if (errRegistro) {
    // La orden YA existe en Mercado Pago: no ocultar el fallo; dejar rastro para conciliar.
    console.error("Point: orden creada pero no registrada", { orderId: data.id, ventaId, error: errRegistro.message });
    return NextResponse.json(
      { error: "El cobro se envió al Point pero no se pudo registrar. No repitas el cobro; avisa al administrador.", orderId: data.id },
      { status: 500 }
    );
  }

  return NextResponse.json({ orderId: data.id, estado: data.status });
}
