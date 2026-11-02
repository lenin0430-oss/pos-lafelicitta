import test from "node:test";
import assert from "node:assert/strict";
import { descifrar } from "../lib/mp.ts";
import { cifrarPrueba, sqlCuentaFicticia } from "../scripts/prueba-navegador/sql_mp_cuenta_ficticia.mjs";

test("el SQL de cuenta ficticia cifra igual que la app (se descifra con lib/mp.ts) y solo usa tokens TEST-", () => {
  process.env.MP_TOKEN_KEY = "clave-de-prueba-larga";
  assert.equal(descifrar(cifrarPrueba("TEST-access-ficticio", "clave-de-prueba-larga")), "TEST-access-ficticio");
  const sql = sqlCuentaFicticia("aaaaaaaa-0000-0000-0000-00000000000a", "TERM-FICTICIA", "clave-de-prueba-larga");
  assert.match(sql, /insert into mp_cuentas/); assert.ok(!/TEST-access-ficticio/.test(sql), "el token va cifrado, no en claro");
  assert.throws(() => sqlCuentaFicticia("x'; drop table ventas;--", "T", "k"));
  assert.throws(() => sqlCuentaFicticia("aaaaaaaa-0000-0000-0000-00000000000a", "T'; --", "k"));
});
test("verificar_flujo.sql es solo lectura", async () => {
  const { readFileSync } = await import("node:fs");
  const t = readFileSync(new URL("../scripts/prueba-navegador/verificar_flujo.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.ok(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(t));
});
