import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { verificarPinAdmin } from "@/lib/verificarPinAdmin";

// POST { pin }  → { ok } . Requiere sesión; el negocio sale de la cookie firmada.
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const { pin } = await req.json().catch(() => ({}));
  const r = await verificarPinAdmin(supabaseAdmin(), s, pin);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
