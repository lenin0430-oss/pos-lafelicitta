import test from "node:test";
import assert from "node:assert/strict";
import { esFalloAmbiguo } from "../lib/pointGuard.ts";

test("fallos ambiguos: red, timeout, 429 y 5xx", () => {
  for (const s of [0, 408, 429, 500, 502, 503, 504]) assert.equal(esFalloAmbiguo(s), true, String(s));
});
test("fallos definitivos: 4xx", () => {
  for (const s of [400, 401, 403, 404, 409, 422]) assert.equal(esFalloAmbiguo(s), false, String(s));
});
