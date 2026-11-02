// Prepara usuarios.pin_hash a partir del PIN actual. NO SE HA EJECUTADO y por defecto NO escribe nada (simulacro).
//   node --import ./tests/register.mjs scripts/migrar-pins-a-hash.mjs            → solo cuenta (no imprime PIN, nombres ni correos)
//   node --import ./tests/register.mjs scripts/migrar-pins-a-hash.mjs --aplicar  → escribe SOLO pin_hash (no toca ni borra la columna pin)
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER (≥32 caracteres, el MISMO que usará el servidor) y 07b aplicado.
// Los PIN reales NO cambian: cada persona conserva su PIN; solo se agrega su hash. Con PIN_MODO=mixto el login acepta ambos durante la transición.
import { createClient } from "@supabase/supabase-js";
import { hashPin, pepperValido } from "../lib/pinHash.ts";

const aplicar = process.argv.includes("--aplicar");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !pepperValido(PIN_PEPPER)) { console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o PIN_PEPPER (≥32 caracteres)."); process.exit(2); }
if (aplicar && process.env.CONFIRMO_MIGRAR_PINS !== "SI") { console.error("Para escribir defina CONFIRMO_MIGRAR_PINS=SI (acordar antes el procedimiento con el dueño)."); process.exit(2); }

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("usuarios").select("id,pin,pin_hash").limit(5000);
if (error) { console.error("No se pudo leer usuarios:", error.code ?? "error"); process.exit(1); }
const pendientes = data.filter((u) => u.pin && !u.pin_hash);
console.log(`Usuarios: ${data.length} · con PIN y sin hash: ${pendientes.length} · ya con hash: ${data.filter((u) => u.pin_hash).length}`);
if (!aplicar) { console.log("Simulacro: no se escribió nada."); process.exit(0); }
let n = 0;
for (const u of pendientes) {
  const h = await hashPin(String(u.pin), PIN_PEPPER);
  const r = await db.from("usuarios").update({ pin_hash: h }).eq("id", u.id).is("pin_hash", null);
  if (r.error) { console.error("Fallo al actualizar un usuario; se detiene."); process.exit(1); }
  n++;
}
console.log(`Hash escrito para ${n} usuarios. La columna pin NO se modificó.`);
