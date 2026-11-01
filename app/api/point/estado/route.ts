import { NextResponse } from "next/server";
import { marcarVentaPagadaPoint, obtenerOrden, supabaseAdmin } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";

// GET /api/point/estado?orderId=ORD...  (respaldo por si el webhook tarda)
export async function GET(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req);
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  const db = supabaseAdmin();
  // Solo puede consultar órdenes de su propio restaurante.
  const { data: pago } = await db
    .from("pagos_point")
    .select("id, venta_id")
    .eq("mp_order_id", orderId)
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!pago) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

  try {
    const orden = await obtenerOrden(restauranteId, orderId);
    await db
      .from("pagos_point")
      .update({ estado: orden.status, updated_at: new Date().toISOString() })
      .eq("id", pago.id);
    if (orden.status === "processed") await marcarVentaPagadaPoint(db, pago.venta_id, restauranteId);
    return NextResponse.json({ estado: orden.status });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la orden" }, { status: 502 });
  }
}
