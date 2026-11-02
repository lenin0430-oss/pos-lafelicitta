import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { COOKIE_SESION, DURACION_SESION_S, crearToken } from "@/lib/restaurante";
import { atenderLogin } from "@/lib/loginServidor";

// POST { modo: "pin", pin } | { modo: "admin", email, password }
// Verifica en el servidor (con límite PERSISTENTE de intentos por IP y por cuenta, ver lib/limiteLogin.ts) y emite la cookie de sesión firmada.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let r;
  try { r = await atenderLogin(req, supabaseAdmin(), body); }
  catch (e) { console.error("login:", (e as Error).message); return NextResponse.json({ error: "No se pudo verificar. Intenta nuevamente." }, { status: 503 }); }
  if (!r.usuario) return NextResponse.json(r.body, { status: r.status, headers: r.retryAfter ? { "Retry-After": String(r.retryAfter) } : undefined });

  const rol = r.usuario.rol === "admin" ? "admin" : "garzon";
  const res = NextResponse.json({ ok: true, rol, nombre: r.usuario.nombre, empresa_id: r.usuario.empresa_id });
  res.cookies.set(COOKIE_SESION, crearToken({ rol, nombre: r.usuario.nombre, empresa_id: r.usuario.empresa_id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURACION_SESION_S,
    path: "/",
  });
  return res;
}

// DELETE → cierra la sesión del servidor.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
