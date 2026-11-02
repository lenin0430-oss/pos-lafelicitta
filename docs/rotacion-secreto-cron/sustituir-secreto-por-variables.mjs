// Sustituye el secreto escrito en el código por variables de entorno (CRON_SECRET y BOT_SECRET).
// NO está aplicado. Uso (desde la raíz del repo):
//   node docs/rotacion-secreto-cron/sustituir-secreto-por-variables.mjs           -> solo muestra qué cambiaría
//   node docs/rotacion-secreto-cron/sustituir-secreto-por-variables.mjs --aplicar -> escribe los cambios
// El script no contiene ni imprime el valor del secreto: lo detecta con expresiones regulares.
import { readFileSync, writeFileSync } from "node:fs";
const aplicar = process.argv.includes("--aplicar");
let cambios = 0;

function editar(ruta, reglas) {
  let s = readFileSync(ruta, "utf8");
  const original = s;
  for (const [nombre, re, nuevo] of reglas) {
    if (!re.test(s)) { if (!s.includes("process.env.BOT_SECRET") && !s.includes("CRON_SECRET")) console.log(`  AVISO ${ruta}: no se encontró «${nombre}»`); continue; }
    s = s.replace(re, nuevo); cambios++;
  }
  console.log(`${ruta}: ${s === original ? "sin cambios" : "se modificaría"}`);
  if (aplicar && s !== original) writeFileSync(ruta, s);
}

const BOT = ["x-bot-secret", /'x-bot-secret': '[^']*'/g, "'x-bot-secret': process.env.BOT_SECRET || ''"];

editar("app/api/reporte-semanal/route.ts", [
  ["verificación por ?token=", /  \/\/ Verificar token secreto\n  const \{ searchParams \} = new URL\(request\.url\)\n  const token = searchParams\.get\('token'\)\n  if \(token !== '[^']*'\) \{/,
   "  // Vercel Cron envía Authorization: Bearer $CRON_SECRET. Sin CRON_SECRET configurado, se rechaza todo.\n  const esperado = process.env.CRON_SECRET\n  if (!esperado || request.headers.get('authorization') !== `Bearer ${esperado}`) {"],
  BOT,
]);
editar("app/api/cierre-whatsapp/route.ts", [BOT]);
editar("vercel.json", [
  ["?token= en la ruta del cron", /"path": "\/api\/reporte-semanal\?token=[^"]*"/, '"path": "/api/reporte-semanal"'],
]);
console.log(aplicar ? `Aplicado (${cambios} reglas).` : `Vista previa (${cambios} reglas). Use --aplicar para escribir.`);
