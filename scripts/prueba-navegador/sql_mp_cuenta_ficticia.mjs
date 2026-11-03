#!/usr/bin/env node
// Imprime (NO ejecuta) el SQL para crear la cuenta Mercado Pago FICTICIA del negocio de PRUEBA, con tokens "TEST-…" cifrados
// igual que lib/mp.ts. Ejecutar el SQL SOLO en el proyecto de pruebas.
// Uso: MP_TOKEN_KEY=<clave de PRUEBA> node scripts/prueba-navegador/sql_mp_cuenta_ficticia.mjs <empresa_id> [terminal]
import { createCipheriv, createHash, randomBytes } from "node:crypto";
export function cifrarPrueba(texto, claveTexto) {
  const k = createHash("sha256").update(claveTexto).digest(); const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv); const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function sqlCuentaFicticia(empresaId, terminal, claveTexto) {
  if (!/^[0-9a-fA-F-]{36}$/.test(empresaId)) throw new Error("empresa_id debe ser un uuid");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(terminal)) throw new Error("terminal inválido");
  return `-- SOLO PROYECTO DE PRUEBAS. Cuenta Mercado Pago FICTICIA (tokens TEST-, sin valor real).
insert into mp_cuentas (restaurante_id, mp_user_id, access_token, refresh_token, expires_at, terminal_id, live_mode)
values ('${empresaId}', 'TEST-USER-1', '${cifrarPrueba("TEST-access-ficticio", claveTexto)}', '${cifrarPrueba("TEST-refresh-ficticio", claveTexto)}', now() + interval '365 days', '${terminal}', false)
on conflict (restaurante_id) do update set terminal_id = excluded.terminal_id, expires_at = excluded.expires_at, live_mode = false;`;
}
if (process.argv[1]?.endsWith("sql_mp_cuenta_ficticia.mjs")) {
  const [empresa, terminal = "TERM-FICTICIA"] = process.argv.slice(2);
  if (!empresa || !process.env.MP_TOKEN_KEY) { console.error("Uso: MP_TOKEN_KEY=<clave de prueba> node … <empresa_id> [terminal]"); process.exit(1); }
  console.log(sqlCuentaFicticia(empresa, terminal, process.env.MP_TOKEN_KEY));
}
