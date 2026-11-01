import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { COOKIE_SESION, DURACION_SESION_S, crearToken } from "@/lib/restaurante";

type Usuario = { nombre: string; rol: string; empresa_id: string };

// POST { modo: "pin", pin } | { modo: "admin", email, password }
// Verifica con las mismas funciones RPC del login (verificar_pin_garzon / verificar_login_admin),
// pero en el servidor, y emite la cookie de sesión firmada.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  let usuario: Usuario | null = null;

  if (body.modo === "pin") {
    const pin = String(body.pin ?? "");
    if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    const { data } = await db.rpc("verificar_pin_garzon", { p_pin: pin }).maybeSingle();
    usuario = (data as Usuario | null) ?? null;
    if (!usuario) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  } else if (body.modo === "admin") {
    const email = String(body.email ?? "").toLowerCase().trim();
    const pin = String(body.password ?? "").trim();
    if (!email || !pin) return NextResponse.json({ error: "Ingresa email y PIN" }, { status: 400 });
    const { data } = await db.rpc("verificar_login_admin", { p_email: email, p_pin: pin }).maybeSingle();
    usuario = (data as Usuario | null) ?? null;
    if (!usuario) return NextResponse.json({ error: "Email o PIN incorrecto" }, { status: 401 });
  } else {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const rol = usuario.rol === "admin" ? "admin" : "garzon";
  const res = NextResponse.json({ ok: true, rol, nombre: usuario.nombre, empresa_id: usuario.empresa_id });
  res.cookies.set(COOKIE_SESION, crearToken({ rol, nombre: usuario.nombre, empresa_id: usuario.empresa_id }), {
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
