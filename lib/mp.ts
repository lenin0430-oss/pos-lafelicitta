import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const MP_API = "https://api.mercadopago.com";
export const MP_AUTH = "https://auth.mercadopago.cl/authorization";

// ---------- Supabase (solo servidor, service role) ----------
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Cierra la venta igual que el POS (app/page.tsx → confirmarCobro): metodo_pago + estado "listo".
// Idempotente: no toca ventas que ya están cobradas.
export async function marcarVentaPagadaPoint(db: ReturnType<typeof supabaseAdmin>, ventaId: string) {
  const { error } = await db
    .from("ventas")
    .update({ metodo_pago: "Point", estado: "listo" })
    .eq("id", ventaId)
    .neq("estado", "listo");
  if (error) throw error;
}

// ---------- Cifrado de tokens en la base de datos ----------
// MP_TOKEN_KEY: cualquier frase larga y secreta (se deriva una clave de 32 bytes).
function clave() {
  const k = process.env.MP_TOKEN_KEY;
  if (!k) throw new Error("Falta MP_TOKEN_KEY");
  return createHash("sha256").update(k).digest();
}

export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function descifrar(guardado: string) {
  const [iv, tag, enc] = guardado.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ---------- OAuth: intercambio y renovación ----------
type TokenMP = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number | string;
  live_mode?: boolean;
};

async function pedirToken(params: Record<string, string>): Promise<TokenMP> {
  const r = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      ...params,
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`OAuth MP ${r.status}: ${await r.text()}`);
  return r.json();
}

export function canjearCodigo(code: string, codeVerifier: string) {
  return pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.MP_REDIRECT_URI!,
    code_verifier: codeVerifier,
  });
}

export async function guardarCuenta(restauranteId: string, t: TokenMP) {
  const { error } = await supabaseAdmin()
    .from("mp_cuentas")
    .upsert({
      restaurante_id: restauranteId,
      mp_user_id: String(t.user_id),
      access_token: cifrar(t.access_token),
      refresh_token: cifrar(t.refresh_token),
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      live_mode: t.live_mode ?? true,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

// Devuelve un access token válido del restaurante; lo renueva si vence en < 7 días.
export async function tokenDe(restauranteId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("mp_cuentas")
    .select("access_token, refresh_token, expires_at")
    .eq("restaurante_id", restauranteId)
    .single();
  if (error || !data) throw new Error("Este restaurante no ha conectado Mercado Pago");

  const vence = new Date(data.expires_at).getTime();
  if (vence - Date.now() > 7 * 24 * 3600 * 1000) return descifrar(data.access_token);

  const nuevo = await pedirToken({
    grant_type: "refresh_token",
    refresh_token: descifrar(data.refresh_token),
  });
  await guardarCuenta(restauranteId, nuevo);
  return nuevo.access_token;
}

// ---------- Llamadas a la API con el token del restaurante ----------
export async function mpFetch(
  restauranteId: string,
  path: string,
  init: RequestInit & { idempotency?: boolean } = {}
) {
  const token = await tokenDe(restauranteId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.idempotency) headers["X-Idempotency-Key"] = crypto.randomUUID();
  return fetch(`${MP_API}${path}`, { ...init, headers, cache: "no-store" });
}

export async function obtenerOrden(restauranteId: string, orderId: string) {
  const r = await mpFetch(restauranteId, `/v1/orders/${orderId}`);
  if (!r.ok) throw new Error(`MP ${r.status}: ${await r.text()}`);
  return r.json();
}
