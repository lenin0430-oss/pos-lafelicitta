import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/mp";
import { COOKIE_SESION, DURACION_SESION_S, crearToken } from "@/lib/restaurante";

const EMPRESA_ID = "lafelicitta";
const ADMIN_EMAIL = "lenin0430@gmail.com";

// POST { modo: "pin", pin } | { modo: "admin", email, password }
// Valida en el servidor y emite la cookie de sesión firmada.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  let rol: "admin" | "garzon";
  let nombre: string;

  if (body.modo === "pin") {
    const pin = String(body.pin ?? "");
    if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    const { data } = await db.from("usuarios_pos").select("nombre").eq("pin", pin).eq("activo", true).maybeSingle();
    if (!data) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    rol = "garzon";
    nombre = data.nombre;
  } else if (body.modo === "admin") {
    if (String(body.email ?? "").toLowerCase().trim() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    const { data } = await db
      .from("usuarios_pos")
      .select("password")
      .eq("email", ADMIN_EMAIL)
      .eq("rol", "admin")
      .maybeSingle();
    if (!data || data.password !== body.password) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }
    rol = "admin";
    nombre = "Admin";
  } else {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, rol, nombre, empresa_id: EMPRESA_ID });
  res.cookies.set(COOKIE_SESION, crearToken({ rol, nombre, empresa_id: EMPRESA_ID }), {
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
