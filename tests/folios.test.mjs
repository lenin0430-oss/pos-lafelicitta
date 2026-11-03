import test from "node:test";
import assert from "node:assert/strict";
import { huellaComanda, claveParaEnvio, guardarComandaIdempotente, recuperarPendiente, leerIntencion, borrarIntencion } from "../lib/intencionComanda.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a";
let u = 0; const uuid = () => `00000000-0000-4000-8000-${String(++u).padStart(12, "0")}`;
const almacenFalso = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const items = [{ producto: { nombre: "Hamburguesa", precio: 5000 }, cantidad: 2, nota: "" }];
// Base falsa: restricción única (empresa, clave) y folio asignado por la "base" (el número del navegador se ignora).
function baseFalsa({ perderRespuestaEnInsert = 0 } = {}) {
  const filas = []; let folio = 120; let perder = perderRespuestaEnInsert;
  const from = () => {
    const f = []; let op = null, payload = null;
    const q = {
      select: () => q, eq: (c, v) => (f.push([c, v]), q), insert: (p) => (op = "insert", payload = p, q),
      maybeSingle: async () => ({ data: filas.find((r) => f.every(([c, v]) => r[c] === v)) ?? null, error: null }),
      single: async () => {
        if (op !== "insert") { const d = filas.find((r) => f.every(([c, v]) => r[c] === v)); return { data: d ?? null, error: d ? null : { code: "PGRST116" } }; }
        if (filas.some((r) => r.empresa_id === payload.empresa_id && r.clave_idempotencia === payload.clave_idempotencia)) return { data: null, error: { code: "23505" } };
        const row = { ...payload, id: uuid(), numero: ++folio }; delete row.folio; filas.push(row);
        if (perder > 0) { perder--; return { data: null, error: { message: "network", code: undefined } }; }   // se guardó, pero la respuesta se perdió
        return { data: row, error: null };
      },
    };
    return q;
  };
  return { filas, from };
}
const fila = (extra = {}) => ({ empresa_id: EMP, mesa: "Mesa 1", total: 10000, estado: "pendiente", numero: 99999, ...extra });

test("respuesta perdida → recarga → reintento: UNA venta y el MISMO folio", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const nav = almacenFalso();
  const clave = claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", items), uuid);          // se persiste antes de enviar
  const r1 = await guardarComandaIdempotente(db, EMP, clave, fila());
  assert.ok(r1.error); assert.equal(db.filas.length, 1);                                  // guardada, sin respuesta
  const folio = db.filas[0].numero;
  // recarga: el estado en memoria se pierde, el almacenamiento del navegador no
  const rec = await recuperarPendiente(db, nav, EMP);
  assert.deepEqual(rec && rec.numero, folio);                                             // se recupera la comanda guardada
  // y si en cambio reenvía con la misma comanda: misma clave, sin crear otra
  const clave2 = claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", items), uuid);
  assert.equal(clave2, clave);
  const r2 = await guardarComandaIdempotente(db, EMP, clave2, fila());
  assert.equal(r2.error, null); assert.equal(r2.recuperada, true);
  assert.equal(db.filas.length, 1); assert.equal(r2.data.numero, folio);
});

test("doble clic / reintento inmediato: mismo folio, una sola venta; el número del navegador se ignora", async () => {
  const db = baseFalsa(); const nav = almacenFalso();
  const clave = claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", items), uuid);
  const [a, b] = await Promise.all([guardarComandaIdempotente(db, EMP, clave, fila({ numero: 5 })), guardarComandaIdempotente(db, EMP, clave, fila({ numero: 7 }))]);
  assert.equal(db.filas.length, 1); assert.equal(a.data.numero, 121); assert.equal(b.data.numero, 121);
});

test("23505 en la carrera: recupera la comanda que ganó, no crea otra", async () => {
  const db = baseFalsa(); const clave = uuid();
  db.filas.push({ id: uuid(), empresa_id: EMP, clave_idempotencia: clave, numero: 150 });
  const real = db.from; // forzar que la búsqueda previa no la vea y el insert choque
  let primera = true; db.from = () => { const q = real(); const ms = q.maybeSingle; q.maybeSingle = async () => (primera ? ((primera = false), { data: null, error: null }) : ms()); return q; };
  const r = await guardarComandaIdempotente(db, EMP, clave, fila());
  assert.equal(r.recuperada, true); assert.equal(r.data.numero, 150); assert.equal(db.filas.length, 1);
});

test("una comanda DISTINTA usa otra clave; la misma conserva la suya tras recargar", () => {
  const nav = almacenFalso();
  const c1 = claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", items), uuid);
  assert.equal(claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", items), uuid), c1);
  const otra = [{ ...items[0], cantidad: 3 }];
  const c2 = claveParaEnvio(nav, EMP, huellaComanda("Mesa 1", otra), uuid);
  assert.notEqual(c2, c1); assert.equal(leerIntencion(nav, EMP).clave, c2);
});

test("la intención es por negocio, se borra al confirmar y un almacenamiento roto no impide enviar", async () => {
  const nav = almacenFalso(); const c = claveParaEnvio(nav, EMP, "h", uuid);
  assert.equal(leerIntencion(nav, "bbbbbbbb-0000-4000-8000-00000000000b"), null);
  borrarIntencion(nav); assert.equal(leerIntencion(nav, EMP), null);
  const roto = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.match(claveParaEnvio(roto, EMP, "h", uuid), /^0000/);
  assert.equal(await recuperarPendiente(baseFalsa(), roto, EMP), null);
  assert.ok(c);
});
