import test from "node:test";
import assert from "node:assert/strict";
import { huellaComanda, crearGestorIntenciones, guardarComandaIdempotente, recuperarPendiente } from "../lib/intencionComanda.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a";
let u = 0; const uuid = () => `00000000-0000-4000-8000-${String(++u).padStart(12, "0")}`;
const almacenFalso = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const roto = { getItem() { throw new Error("sin almacenamiento"); }, setItem() { throw new Error("cuota"); }, removeItem() { throw new Error("x"); } };
// Una "pestaña" = un gestor (memoria propia) + su sessionStorage; el localStorage es compartido entre pestañas del mismo navegador.
const pestana = (local, sesion = almacenFalso()) => crearGestorIntenciones({ local, sesion, nuevoUuid: uuid });
const H = () => huellaComanda("Mesa 1", items);
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
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const local = almacenFalso(), ses = almacenFalso();
  const g = pestana(local, ses);
  const clave = g.claveParaEnvio(EMP, H());                                               // se persiste antes de enviar
  const r1 = await guardarComandaIdempotente(db, EMP, clave, fila());
  assert.ok(r1.error); assert.equal(db.filas.length, 1);                                  // guardada, sin respuesta
  const folio = db.filas[0].numero;
  // recarga: el estado en memoria se pierde, el almacenamiento del navegador no
  const g2 = pestana(local, ses);                                                         // misma pestaña (mismo sessionStorage), memoria nueva
  const rec = await recuperarPendiente(db, g2, EMP);
  assert.deepEqual(rec && rec.numero, folio);                                             // se recupera la comanda guardada
  // y si en cambio reenvía con la misma comanda: misma clave, sin crear otra
  const clave2 = g2.claveParaEnvio(EMP, H());
  assert.equal(clave2, clave);
  const r2 = await guardarComandaIdempotente(db, EMP, clave2, fila());
  assert.equal(r2.error, null); assert.equal(r2.recuperada, true);
  assert.equal(db.filas.length, 1); assert.equal(r2.data.numero, folio);
});

test("doble clic / reintento inmediato: mismo folio, una sola venta; el número del navegador se ignora", async () => {
  const db = baseFalsa(); const g = pestana(almacenFalso());
  const clave = g.claveParaEnvio(EMP, H());
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

test("si falla localStorage la clave se conserva EN MEMORIA: reintentos con respuesta perdida no duplican", async () => {
  for (const local of [roto, null, undefined]) {
    const db = baseFalsa({ perderRespuestaEnInsert: 2 }); const g = crearGestorIntenciones({ local, sesion: roto, nuevoUuid: uuid });
    const c1 = g.claveParaEnvio(EMP, H());
    assert.ok((await guardarComandaIdempotente(db, EMP, c1, fila())).error);              // guardada, respuesta perdida
    const c2 = g.claveParaEnvio(EMP, H());
    assert.equal(c2, c1);                                                                 // misma clave pese a que setItem/getItem fallan
    assert.ok((await guardarComandaIdempotente(db, EMP, c2, fila())).recuperada);
    assert.equal(db.filas.length, 1);
    assert.equal((await recuperarPendiente(db, g, EMP)).numero, db.filas[0].numero);
  }
});

test("comanda NUEVA vs reintento: con productos idénticos, «Comanda nueva» (cerrar) usa otra clave y crea otra venta", async () => {
  const db = baseFalsa(); const g = pestana(almacenFalso());
  const c1 = g.claveParaEnvio(EMP, H());
  assert.equal(g.claveParaEnvio(EMP, H()), c1);                                           // reintento: misma clave
  const r1 = await guardarComandaIdempotente(db, EMP, c1, fila()); assert.equal(r1.error, null);
  g.cerrar();                                                                             // confirmada o «Comanda nueva»
  const c2 = g.claveParaEnvio(EMP, H());
  assert.notEqual(c2, c1);                                                                // idéntica en productos, pero NUEVA
  const r2 = await guardarComandaIdempotente(db, EMP, c2, fila());
  assert.equal(db.filas.length, 2); assert.notEqual(r2.data.numero, r1.data.numero);
  assert.notEqual(g.claveParaEnvio(EMP, huellaComanda("Mesa 1", [{ ...items[0], cantidad: 3 }])), c2);  // pedido cambiado: otra intención
});

test("dos pestañas simultáneas con la misma comanda: claves distintas, dos ventas, ninguna adopta la del otro", async () => {
  const db = baseFalsa(); const local = almacenFalso();
  const A = pestana(local), B = pestana(local);                                           // mismo localStorage, distinto sessionStorage
  assert.notEqual(A.tabId(), B.tabId());
  const ca = A.claveParaEnvio(EMP, H()), cb = B.claveParaEnvio(EMP, H());
  assert.notEqual(ca, cb);
  const [ra, rb] = await Promise.all([guardarComandaIdempotente(db, EMP, ca, fila()), guardarComandaIdempotente(db, EMP, cb, fila())]);
  assert.equal(db.filas.length, 2); assert.notEqual(ra.data.numero, rb.data.numero);
  assert.equal(new Set(db.filas.map((f) => f.numero)).size, 2);
});

test("dos pestañas: la recarga de cada una recupera SOLO su comanda; cerrar una no borra la de la otra", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 2 }); const local = almacenFalso(); const sa = almacenFalso(), sb = almacenFalso();
  const A = pestana(local, sa), B = pestana(local, sb);
  const ca = A.claveParaEnvio(EMP, H()), cb = B.claveParaEnvio(EMP, H());
  await guardarComandaIdempotente(db, EMP, ca, fila({ mesa: "A" })); await guardarComandaIdempotente(db, EMP, cb, fila({ mesa: "B" }));
  assert.equal(db.filas.length, 2);
  const A2 = pestana(local, sa), B2 = pestana(local, sb);                                 // ambas recargan
  assert.equal((await recuperarPendiente(db, A2, EMP)).id, db.filas.find((f) => f.mesa === "A").id);
  assert.equal((await recuperarPendiente(db, B2, EMP)).id, db.filas.find((f) => f.mesa === "B").id);
  A2.cerrar();
  assert.equal(await recuperarPendiente(db, pestana(local, sa), EMP), null);
  assert.ok(await recuperarPendiente(db, pestana(local, sb), EMP));                       // la de B sigue intacta
});

test("la intención es por negocio y caduca; un id de pestaña inválido se regenera", async () => {
  let t = 1000; const local = almacenFalso(), ses = almacenFalso(); ses.setItem("lf_tab_id", "no-es-uuid");
  const g = crearGestorIntenciones({ local, sesion: ses, nuevoUuid: uuid, ahora: () => t });
  const c = g.claveParaEnvio(EMP, "h"); assert.match(ses.getItem("lf_tab_id"), /^[0-9a-f-]{36}$/);
  assert.equal(g.leer("bbbbbbbb-0000-4000-8000-00000000000b"), null);
  t += 25 * 3600 * 1000; assert.equal(g.leer(EMP), null); assert.notEqual(g.claveParaEnvio(EMP, "h"), c);
});
