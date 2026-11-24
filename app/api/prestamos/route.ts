import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { sesionDelServidor } from "@/lib/restaurante";
import { accionPrestamo, listarPrestamos } from "@/lib/prestamosServidor";

const H = { "Cache-Control": "no-store" };
// GET: préstamos de trabajadores con saldo y días por descontar (solo admin; a otros roles les llega la lista vacía).
export async function GET(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  const r = await listarPrestamos(supabaseAdmin(), s);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
// POST { accion: "crear" | "descontar" | "deshacer", … } — solo admin.
export async function POST(req: Request) {
  const s = sesionDelServidor(req);
  if (!s) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ ok: false, error: "Se requiere application/json" }, { status: 415 });
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const r = await accionPrestamo(supabaseAdmin(), s, body);
  return NextResponse.json(r.body, { status: r.status, headers: H });
}
