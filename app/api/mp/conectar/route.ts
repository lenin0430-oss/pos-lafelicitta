import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { MP_AUTH } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";

// GET /api/mp/conectar → redirige al restaurante a autorizar MesaPOS en Mercado Pago.
export async function GET(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req, { soloAdmin: true });
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(48).toString("base64url"); // 64 caracteres
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL(MP_AUTH);
  url.searchParams.set("client_id", process.env.MP_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", process.env.MP_REDIRECT_URI!);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url.toString());
  // Guardamos state + verifier + restaurante en una cookie temporal (10 min, httpOnly).
  res.cookies.set("mp_oauth", JSON.stringify({ state, verifier, restauranteId }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/mp/callback",
  });
  return res;
}
