import { NextResponse } from "next/server";
import { mpFetch, supabaseAdmin } from "@/lib/mp";
import { restauranteDeLaSesion } from "@/lib/restaurante";

// GET → lista los Point de la cuenta conectada y cuál está elegido.
export async function GET(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req, { soloAdmin: true });
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: cuenta } = await supabaseAdmin()
    .from("mp_cuentas")
    .select("terminal_id")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ conectado: false });

  const r = await mpFetch(restauranteId, "/terminals/v1/list?limit=50");
  if (!r.ok) return NextResponse.json({ error: "No se pudo leer los Point" }, { status: 502 });
  const terminales = (await r.json())?.data?.terminals ?? [];

  return NextResponse.json({ conectado: true, elegido: cuenta.terminal_id, terminales });
}

// POST { terminalId, modo?: "PDV" | "STANDALONE" } → elige el Point y (opcional) cambia su modo.
export async function POST(req: Request) {
  const restauranteId = await restauranteDeLaSesion(req, { soloAdmin: true });
  if (!restauranteId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { terminalId, modo } = await req.json();
  if (!terminalId) return NextResponse.json({ error: "terminalId requerido" }, { status: 400 });

  // Verificamos que ese Point pertenezca a la cuenta del restaurante.
  const lista = await mpFetch(restauranteId, "/terminals/v1/list?limit=50");
  const terminales = lista.ok ? (await lista.json())?.data?.terminals ?? [] : [];
  if (!terminales.some((t: { id: string }) => t.id === terminalId)) {
    return NextResponse.json({ error: "Ese Point no es de tu cuenta" }, { status: 403 });
  }

  if (modo === "PDV" || modo === "STANDALONE") {
    const r = await mpFetch(restauranteId, "/terminals/v1/setup", {
      method: "PATCH",
      body: JSON.stringify({ terminals: [{ id: terminalId, operating_mode: modo }] }),
    });
    if (!r.ok) return NextResponse.json({ error: "No se pudo cambiar el modo" }, { status: 502 });
  }

  await supabaseAdmin()
    .from("mp_cuentas")
    .update({ terminal_id: terminalId, updated_at: new Date().toISOString() })
    .eq("restaurante_id", restauranteId);

  return NextResponse.json({ ok: true, aviso: modo ? "Reinicia el Point para aplicar el modo" : undefined });
}
