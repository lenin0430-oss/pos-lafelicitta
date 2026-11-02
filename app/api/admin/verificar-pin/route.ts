import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { aprobarGasto } from "@/lib/verificarPinAdmin";

// POST { pin, categoria, descripcion, monto } → { ok, aprobacion } . Requiere sesión; el negocio sale de la cookie firmada.
// La aprobación es de un solo uso y solo vale para ESTE gasto (ver lib/aprobaciones.ts).
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await aprobarGasto(supabaseAdmin(), s, b);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
