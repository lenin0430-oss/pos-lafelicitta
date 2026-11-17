import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { pagarReembolso, reembolsosPendientes } from "@/lib/gastosServidor";

const H = { "Cache-Control": "no-store" };
// GET → lo que se le debe a cada trabajador por gastos que pagó con su dinero.
export async function GET(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  const r = await reembolsosPendientes(supabaseAdmin(), s);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
// POST { persona } → paga todo lo pendiente a esa persona como retiro de la caja del turno abierto (solo admin).
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const r = await pagarReembolso(supabaseAdmin(), s, body);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
