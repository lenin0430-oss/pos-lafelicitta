import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { registrarGasto } from "@/lib/gastosServidor";

// POST { categoria, descripcion, monto, afecto_caja?, aprobacion? } — único camino para registrar gastos.
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const r = await registrarGasto(supabaseAdmin(), s, body);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
