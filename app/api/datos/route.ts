import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { atenderDatos } from "@/lib/datosServidor";

// POST /api/datos  { tabla, pasos:[{m,a}] }  — única vía del navegador a las tablas privadas (ver lib/datosAutorizados.ts).
export async function POST(req: Request) {
  const r = await atenderDatos(req, { db: supabaseAdmin(), plataformaEmpresaId: process.env.PLATAFORMA_EMPRESA_ID ?? null });
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
