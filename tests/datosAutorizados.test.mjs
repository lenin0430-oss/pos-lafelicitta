import test from "node:test";
import assert from "node:assert/strict";
import { planificar, ejecutarPlan, columnasValidas } from "../lib/datosAutorizados.ts";

const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b";
const admin = { rol: "admin", empresa_id: A }, garzon = { rol: "garzon", empresa_id: A };
const sol = (tabla, ...pasos) => ({ tabla, pasos: pasos.map(([m, ...a]) => ({ m, a })) });
const ok = (s, x, o) => { const p = planificar(s, x, o); assert.equal(p.ok, true, JSON.stringify(p)); return p; };
const no = (s, x, st, o) => { const p = planificar(s, x, o); assert.equal(p.ok, false, "debía rechazarse: " + JSON.stringify(x)); if (st) assert.equal(p.status, st); return p; };
const tiene = (p, m, ...a) => p.pasos.some((q) => q.m === m && JSON.stringify(q.a) === JSON.stringify(a));

test("sin sesión: 401", () => no(null, sol("ventas", ["select", "*"]), 401));

test("el negocio sale de la sesión: se agrega el filtro aunque el navegador no lo mande", () => {
  const p = ok(garzon, sol("ventas", ["select", "*"], ["order", "created_at", { ascending: false }]));
  assert.ok(tiene(p, "eq", "empresa_id", A));
});
test("el navegador no puede apuntar a otro negocio: eq, in, insert y update con empresa distinta se rechazan", () => {
  no(garzon, sol("ventas", ["select", "*"], ["eq", "empresa_id", B]), 403);
  no(garzon, sol("ventas", ["select", "*"], ["in", "empresa_id", [A, B]]), 403);
  no(garzon, sol("ventas", ["select", "*"], ["neq", "empresa_id", A]), 403);
  no(garzon, sol("ventas", ["insert", { empresa_id: B, total: 1 }]), 403);
  no(admin, sol("ventas", ["update", { empresa_id: B }], ["eq", "id", "x"]), 403);
  const p = ok(garzon, sol("ventas", ["insert", { total: 1 }])); assert.equal(p.pasos[0].a[0].empresa_id, A);
  const q = ok(garzon, sol("ventas", ["insert", [{ total: 1 }, { total: 2, empresa_id: A }]])); assert.ok(q.pasos[0].a[0].every((f) => f.empresa_id === A));
});
test("update/delete exigen un filtro propio además del negocio", () => {
  no(admin, sol("ventas", ["delete"]), 400);
  no(admin, sol("productos", ["update", { precio: 1 }]), 400);
  const p = ok(admin, sol("productos", ["update", { precio: 1 }], ["eq", "id", "p1"])); assert.ok(tiene(p, "eq", "empresa_id", A));
});
test("roles: garzón opera caja y cocina; el resto es solo admin", () => {
  ok(garzon, sol("ventas", ["update", { estado: "listo" }], ["eq", "id", "v"]));
  ok(garzon, sol("ventas", ["insert", { total: 1 }], ["select"], ["single"]));
  ok(garzon, sol("propinas", ["insert", { monto: 1 }]));
  ok(garzon, sol("gastos", ["insert", { monto: 1 }]));
  ok(garzon, sol("productos", ["select", "id,nombre,categorias(nombre)"]));
  for (const x of [sol("ventas", ["delete"], ["eq", "id", "v"]), sol("productos", ["update", { precio: 1 }], ["eq", "id", "p"]), sol("productos", ["insert", { nombre: "x" }]),
    sol("cierres_caja", ["select", "*"]), sol("stock_insumos", ["select", "*"]), sol("recetas", ["insert", { a: 1 }]), sol("gastos", ["delete"], ["eq", "id", "g"]), sol("aperturas_caja", ["insert", { a: 1 }])]) no(garzon, x, 403);
  ok(admin, sol("ventas", ["delete"], ["eq", "id", "v"])); ok(admin, sol("cierres_caja", ["insert", { a: 1 }])); ok(admin, sol("stock_insumos", ["select", "*"]));
});
test("tablas no listadas, funciones y métodos peligrosos se rechazan", () => {
  for (const t of ["usuarios", "mp_cuentas", "pagos_point", "usuarios_pos", "pedidos", "pg_catalog.pg_user", "ventas; drop table x", "../x"]) no(admin, sol(t, ["select", "*"]), null);
  no(admin, sol("ventas", ["select", "*"], ["or", "empresa_id.eq.x"]), 400);
  no(admin, sol("ventas", ["upsert", { a: 1 }]), 400);
  no(admin, sol("ventas", ["rpc", "x"]), 400);
  no(admin, sol("ventas", ["select", "*"], ["filter", "a", "eq", 1]), 400);
  no(admin, sol("ventas", ["select", "*"], ["csv"]), 400);
});
test("select: no se pueden pedir relaciones a otras tablas (exfiltración por join)", () => {
  assert.equal(columnasValidas("id,nombre"), true); assert.equal(columnasValidas("*"), true);
  assert.equal(columnasValidas("id, categorias(nombre)", ["categorias"]), true);
  for (const c of ["*,usuarios(*)", "id,usuarios(pin)", "categorias(usuarios(pin))", "id;drop", "id,(x)", "a)b", "categorias(nombre"]) assert.equal(columnasValidas(c, ["categorias"]), false, c);
  no(admin, sol("ventas", ["select", "*,usuarios(*)"]), 400);
  no(admin, sol("productos", ["select", "*,usuarios(pin)"]), 400);
});
test("columnas y valores inválidos se rechazan", () => {
  no(admin, sol("ventas", ["select", "*"], ["eq", "total; drop", 1]), 400);
  no(admin, sol("ventas", ["select", "*"], ["eq", "total", { $gt: 1 }]), 400);
  no(admin, sol("ventas", ["insert", { "a-b": 1 }]), 400);
  no(admin, sol("ventas", ["select", "*"], ["limit", 100000]), 400);
  no(admin, sol("productos", ["update", { id: "otro" }], ["eq", "id", "p"]), 403);
});
test("el orden canónico deja single al final y el filtro del negocio siempre presente", () => {
  const p = ok(garzon, sol("ventas", ["insert", { total: 1 }], ["single"], ["select", "id"]));
  assert.deepEqual(p.pasos.map((x) => x.m), ["insert", "select", "single"]);   // el insert no lleva filtro: el negocio va dentro de cada fila
  const q = ok(admin, sol("ventas", ["select", "*"], ["maybeSingle"], ["eq", "id", "v"], ["order", "created_at"]));
  assert.deepEqual(q.pasos.map((x) => x.m), ["select", "eq", "eq", "order", "maybeSingle"]);
});
test("empresas: solo la propia (clave id) y solo lectura", () => {
  ok(garzon, sol("empresas", ["select", "logo_url"], ["eq", "id", A], ["maybeSingle"]));
  no(garzon, sol("empresas", ["select", "*"], ["eq", "id", B]), 403);
  const p = ok(garzon, sol("empresas", ["select", "id,nombre,slug"], ["eq", "slug", "lafelicitta"], ["maybeSingle"])); assert.ok(tiene(p, "eq", "id", A));
  no(admin, sol("empresas", ["insert", { nombre: "x" }]), 403); no(admin, sol("empresas", ["delete"], ["eq", "id", A]), 403);
});
test("alta de negocios (nueva-empresa): solo admin del negocio de plataforma", () => {
  const nueva = [sol("empresas", ["insert", { nombre: "N" }], ["select", "id"], ["single"]), sol("usuarios", ["insert", { nombre: "a", pin: "1234", empresa_id: B }]), sol("mesas", ["insert", [{ empresa_id: B, nombre: "M1" }]]), sol("empresas", ["delete"], ["eq", "id", B])];
  for (const x of nueva) { no(admin, x, 403); no(admin, x, 403, { plataformaEmpresaId: B }); no(garzon, x, 403, { plataformaEmpresaId: A }); ok(admin, x, { plataformaEmpresaId: A }); }
  no(admin, sol("usuarios", ["select", "*"]), 403, { plataformaEmpresaId: A });        // aun así no se puede LEER usuarios
  no(admin, sol("usuarios", ["update", { pin: "0000" }], ["eq", "id", "x"]), 403, { plataformaEmpresaId: A });
  no(admin, sol("empresas", ["delete"]), 400, { plataformaEmpresaId: A });
});
test("ejecutarPlan repite exactamente los pasos validados sobre el cliente de servicio", async () => {
  const llamadas = [];
  const db = { from: (t) => { llamadas.push(["from", t]); const q = new Proxy({}, { get: (_x, m) => m === "then" ? (ok) => ok({ data: [{ id: 1 }], error: null, status: 200, count: 1 }) : (...a) => (llamadas.push([m, ...a]), q) }); return q; } };
  const p = ok(garzon, sol("ventas", ["select", "id", { count: "exact" }], ["gte", "created_at", "2026-11-01"]));
  const r = await ejecutarPlan(db, p);
  assert.deepEqual(llamadas.map((x) => x[0]), ["from", "select", "gte", "eq"]); assert.deepEqual(llamadas[3], ["eq", "empresa_id", A]);
  assert.deepEqual(r, { data: [{ id: 1 }], count: 1, status: 200, error: null });
});
