import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canjearCodigo, guardarCuenta, mpFetch, supabaseAdmin } from "@/lib/mp";

// Mercado Pago vuelve aquí con ?code=...&state=... después de que el restaurante autoriza.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL ?? url.origin;
  const volver = (estado: string) => {
    const res = NextResponse.redirect(`${base}/configuracion/mercadopago?mp=${estado}`);
    res.cookies.set("mp_oauth", "", { maxAge: 0, path: "/api/mp/callback" });
    return res;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const raw = cookies().get("mp_oauth")?.value;
  if (!code || !state || !raw) return volver("error");

  let guardado: { state: string; verifier: string; restauranteId: string };
  try {
    guardado = JSON.parse(raw);
  } catch {
    return volver("error");
  }
  if (guardado.state !== state) return volver("error"); // protege contra CSRF

  try {
    const token = await canjearCodigo(code, guardado.verifier);
    await guardarCuenta(guardado.restauranteId, token);

    // Si el restaurante tiene un solo Point, lo dejamos seleccionado automáticamente.
    const r = await mpFetch(guardado.restauranteId, "/terminals/v1/list?limit=50");
    if (r.ok) {
      const terminales = (await r.json())?.data?.terminals ?? [];
      if (terminales.length === 1) {
        await supabaseAdmin()
          .from("mp_cuentas")
          .update({ terminal_id: terminales[0].id })
          .eq("restaurante_id", guardado.restauranteId);
      }
    }
    return volver("ok");
  } catch (e) {
    console.error("Callback OAuth MP:", e);
    return volver("error");
  }
}
