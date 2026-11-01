import { NextResponse } from "next/server";
import { mpFetch, supabaseAdmin } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";

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

  await db.from("pagos_point").insert({
    restaurante_id: restauranteId,
    venta_id: String(ventaId),
    mp_order_id: data.id,
    monto,
    estado: data.status,
  });

  return NextResponse.json({ orderId: data.id, estado: data.status });
}
