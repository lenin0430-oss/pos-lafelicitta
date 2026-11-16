import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { accionAbono, listarPorCobrar } from "@/lib/abonosServidor";

const H = { "Cache-Control": "no-store" };
// GET: ventas con saldo por cobrar (negocio de la sesión).
export async function GET(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  const r = await listarPorCobrar(supabaseAdmin(), s);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
// POST { accion: "abonar"|"cobrar_saldo", venta_id, monto?, medio, cliente? } — único camino para abonar y cobrar saldos.
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const r = await accionAbono(supabaseAdmin(), s, body);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
