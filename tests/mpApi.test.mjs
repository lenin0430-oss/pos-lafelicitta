import test from "node:test";
import assert from "node:assert/strict";
import { resolverMpApi, MP_API_REAL } from "../lib/mpApi.ts";

test("sin variable usa la API real de Mercado Pago", () => {
  assert.equal(resolverMpApi({}), MP_API_REAL);
  assert.equal(MP_API_REAL, "https://api.mercadopago.com");
});
test("simulador local se acepta solo por http en localhost/127.0.0.1", () => {
  assert.equal(resolverMpApi({ MP_SIMULADOR_URL: "http://127.0.0.1:4010" }), "http://127.0.0.1:4010");
  assert.equal(resolverMpApi({ MP_SIMULADOR_URL: "http://localhost:4010/x" }), "http://localhost:4010");
});
test("cualquier otra URL, https o remota se ignora", () => {
  for (const u of ["https://127.0.0.1:4010", "http://evil.example.com", "http://127.0.0.1.evil.com", "https://api.mercadopago.com", "no-es-url", "http://192.168.1.5:4010"]) {
    assert.equal(resolverMpApi({ MP_SIMULADOR_URL: u }), MP_API_REAL, u);
  }
});
test("en producción de Vercel se ignora aunque la variable exista", () => {
  assert.equal(resolverMpApi({ MP_SIMULADOR_URL: "http://127.0.0.1:4010", VERCEL_ENV: "production" }), MP_API_REAL);
  assert.equal(resolverMpApi({ MP_SIMULADOR_URL: "http://127.0.0.1:4010", VERCEL_ENV: "preview" }), "http://127.0.0.1:4010");
});
