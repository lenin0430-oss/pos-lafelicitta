import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { marcarVentaPagadaPoint, obtenerOrden, supabaseAdmin } from "@/lib/mp";

// Valida la firma x-signature que envía Mercado Pago (clave secreta del panel → Webhooks).
function firmaValida(req: Request, dataId: string) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const partes = Object.fromEntries(
    sig.split(",").map((p) => p.trim().split("=", 2) as [string, string])
  );
  if (!partes.ts || !partes.v1) return false;

  const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  const esperado = createHmac("sha256", secret).update(manifiesto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }

  const orderId: string | undefined =
    url.searchParams.get("data.id") ?? body?.data?.id ?? undefined;
  if (!orderId) return NextResponse.json({ ok: true });

  if (!firmaValida(req, orderId)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  const db = supabaseAdmin();
  // Buscamos de qué restaurante es la orden (la guardamos al cobrar).
  const { data: pago } = await db
    .from("pagos_point")
    .select("id, restaurante_id, venta_id")
    .eq("mp_order_id", orderId)
    .maybeSingle();
  if (!pago?.restaurante_id) return NextResponse.json({ ok: true }); // no es nuestra

  try {
    // Nunca confiamos en el cuerpo: consultamos la orden con el token del restaurante.
    const orden = await obtenerOrden(pago.restaurante_id, orderId);
    await db
      .from("pagos_point")
      .update({ estado: orden.status, updated_at: new Date().toISOString() })
      .eq("id", pago.id);

    if (orden.status === "processed") await marcarVentaPagadaPoint(db, pago.venta_id, pago.restaurante_id);
  } catch (e) {
    console.error("Webhook MP:", e);
  }

  return NextResponse.json({ ok: true });
}
