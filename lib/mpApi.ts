// URL base de la API de Mercado Pago. Por defecto SIEMPRE la real.
// Solo para pruebas en el computador: MP_SIMULADOR_URL=http://127.0.0.1:4010 (scripts/simulador-point.mjs).
// Se ignora si: no es http a localhost/127.0.0.1/[::1], o VERCEL_ENV=production. Así una variable mal puesta no desvía cobros reales.
export const MP_API_REAL = "https://api.mercadopago.com";

export function resolverMpApi(env: Record<string, string | undefined>): string {
  const sim = env.MP_SIMULADOR_URL;
  if (!sim || env.VERCEL_ENV === "production") return MP_API_REAL;
  try {
    const u = new URL(sim);
    const local = u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return local ? u.origin : MP_API_REAL;
  } catch {
    return MP_API_REAL;
  }
}
