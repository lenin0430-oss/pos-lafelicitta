import test from "node:test";
import assert from "node:assert/strict";
import { huellaComanda, crearGestorIntenciones, guardarComandaIdempotente, recuperarPendiente, resolverHuerfanas } from "../lib/intencionComanda.ts";

const EMP = "aaaaaaaa-0000-4000-8000-00000000000a";
let u = 0; const uuid = () => `00000000-0000-4000-8000-${String(++u).padStart(12, "0")}`;
const almacenFalso = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
const roto = { getItem() { throw new Error("sin almacenamiento"); }, setItem() { throw new Error("cuota"); }, removeItem() { throw new Error("x"); } };
// Una "pestaña" = un gestor (memoria propia) + su sessionStorage; el localStorage es compartido entre pestañas del mismo navegador.
let reloj = 1_000_000; const pestana = (local, sesion = almacenFalso()) => crearGestorIntenciones({ local, sesion, nuevoUuid: uuid, ahora: () => reloj });
const copiar = (ses) => { const c = almacenFalso(); for (const [k, v] of ses.m) c.m.set(k, v); return c; };   // el navegador copia sessionStorage al duplicar la pestaña
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
  g.liberar();                                                                            // pagehide de la página anterior
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
  A.liberar(); B.liberar();                                                               // pagehide
  const A2 = pestana(local, sa), B2 = pestana(local, sb);                                 // ambas recargan
  assert.equal((await recuperarPendiente(db, A2, EMP)).id, db.filas.find((f) => f.mesa === "A").id);
  assert.equal((await recuperarPendiente(db, B2, EMP)).id, db.filas.find((f) => f.mesa === "B").id);
  A2.cerrar();
  A2.liberar(); B2.liberar();
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

test("pestaña DUPLICADA (sessionStorage copiado): dos pedidos independientes no comparten intención ni clave", async () => {
  const db = baseFalsa(); const local = almacenFalso(), sa = almacenFalso();
  const A = pestana(local, sa); const ca = A.claveParaEnvio(EMP, H());                    // A tiene su comanda en curso
  const B = pestana(local, copiar(sa));                                                    // pestaña duplicada: mismo id copiado
  assert.notEqual(B.tabId(), A.tabId()); assert.equal(B.duplicada, true); assert.equal(A.duplicada, false);
  assert.equal(await recuperarPendiente(db, B, EMP), null);                                // B no hereda la intención de A
  const cb = B.claveParaEnvio(EMP, H());                                                   // mismos productos, pedido independiente
  assert.notEqual(cb, ca);
  await guardarComandaIdempotente(db, EMP, ca, fila()); await guardarComandaIdempotente(db, EMP, cb, fila());
  assert.equal(db.filas.length, 2); assert.notEqual(db.filas[0].numero, db.filas[1].numero);
  const idA = A.tabId(); A.latido(); assert.equal(A.tabId(), idA); assert.notEqual(B.tabId(), idA);   // A conserva su identidad
  assert.equal(A.claveParaEnvio(EMP, H()), ca);
});

test("duplicada con respuesta perdida en A: A recupera lo suyo y B no lo adopta", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const local = almacenFalso(), sa = almacenFalso();
  const A = pestana(local, sa); const ca = A.claveParaEnvio(EMP, H());
  await guardarComandaIdempotente(db, EMP, ca, fila());                                    // guardada, respuesta perdida
  const B = pestana(local, copiar(sa));
  assert.equal(await recuperarPendiente(db, B, EMP), null);
  assert.equal((await recuperarPendiente(db, A, EMP)).numero, db.filas[0].numero);
});

test("recarga LEGÍTIMA (la pestaña libera su id al salir) recupera su intención; sin liberar pero con latido caducado también", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const local = almacenFalso(), sa = almacenFalso();
  const A = pestana(local, sa); const ca = A.claveParaEnvio(EMP, H()); const idA = A.tabId();
  await guardarComandaIdempotente(db, EMP, ca, fila());
  A.liberar();                                                                             // pagehide
  const A2 = pestana(local, sa);
  assert.equal(A2.tabId(), idA); assert.equal(A2.duplicada, false);
  assert.equal((await recuperarPendiente(db, A2, EMP)).numero, db.filas[0].numero);
  // la página murió sin pagehide: tras caducar el arrendamiento, la recarga sigue recuperando
  reloj += 200_000;
  const A3 = pestana(local, sa);
  assert.equal(A3.duplicada, false); assert.equal(A3.claveParaEnvio(EMP, H()), ca);
});

test("el latido mantiene viva la identidad aunque la pestaña original lleve horas en segundo plano", () => {
  const local = almacenFalso(), sa = almacenFalso();
  const A = pestana(local, sa); A.claveParaEnvio(EMP, H());
  reloj += 100_000; A.latido(); reloj += 100_000;                                          // latidos espaciados (< 130 s entre sí)
  const B = pestana(local, copiar(sa)); B.tabId(); assert.equal(B.duplicada, true);
});

test("duplicada con almacenamiento roto: no hay intención compartida, la clave sigue en memoria", () => {
  const A = crearGestorIntenciones({ local: roto, sesion: roto, nuevoUuid: uuid }), B = crearGestorIntenciones({ local: roto, sesion: roto, nuevoUuid: uuid });
  const ca = A.claveParaEnvio(EMP, H()), cb = B.claveParaEnvio(EMP, H());
  assert.notEqual(ca, cb); assert.equal(A.claveParaEnvio(EMP, H()), ca);
});

// ---- Reapertura inmediata sin liberar, canal entre pestañas y huérfanas ----
const hub = () => { const peers = new Set(); return () => { const c = { onmessage: null, postMessage(m) { for (const p of peers) if (p !== c) setTimeout(() => p.onmessage && p.onmessage({ data: m }), 0); } }; peers.add(c); return c; }; };
// esperaMs holgado: bajo carga (corrida paralela) un pong simulado de 0 ms no debe llegar tarde y volver la prueba intermitente.
const pagina = (local, ses, h) => { let c = null; const g = crearGestorIntenciones({ local, sesion: ses, nuevoUuid: uuid, ahora: () => reloj, canal: h ? () => (c = h()) : undefined, esperaMs: 250 }); return { g, matar: () => { if (c) c.onmessage = null; } }; };   // matar = cierre brusco: no responde más

test("respuesta perdida → cierre SIN liberar → reapertura inmediata (+130 s): misma identidad, misma venta y folio, misma clave", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const local = almacenFalso(), ses = almacenFalso(), h = hub();
  const A = pagina(local, ses, h); await A.g.iniciar();
  const ca = A.g.claveParaEnvio(EMP, H(), { mesa: "Mesa 1", total: 10000 }); const idA = A.g.tabId();
  assert.ok((await guardarComandaIdempotente(db, EMP, ca, fila())).error);                  // guardada, respuesta perdida
  A.matar();                                                                                // el navegador se cierra sin pagehide
  const A2 = pagina(local, ses, h); await A2.g.iniciar();                                   // reapertura inmediata (el arrendamiento viejo sigue "fresco")
  assert.equal(A2.g.tabId(), idA); assert.equal(A2.g.duplicada, false);                     // retoma su identidad: nadie contestó
  assert.equal((await recuperarPendiente(db, A2.g, EMP)).numero, db.filas[0].numero);       // misma venta y folio
  reloj += 140_000; A2.g.latido();                                                          // pasan más de 130 s
  assert.equal(A2.g.claveParaEnvio(EMP, H()), ca);                                          // el reintento usa la MISMA clave
  const r = await guardarComandaIdempotente(db, EMP, ca, fila());
  assert.equal(r.recuperada, true); assert.equal(db.filas.length, 1);
  assert.deepEqual((await resolverHuerfanas(db, A2.g, EMP)), { recuperadas: [], inciertas: [] });
});

test("con una pestaña duplicada VIVA el canal responde: la copia toma otra identidad y sus pedidos son independientes", async () => {
  const db = baseFalsa(); const local = almacenFalso(), sa = almacenFalso(), h = hub();
  const A = pagina(local, sa, h); await A.g.iniciar(); const ca = A.g.claveParaEnvio(EMP, H());
  const B = pagina(local, copiar(sa), h); await B.g.iniciar();
  assert.equal(B.g.duplicada, true); assert.notEqual(B.g.tabId(), A.g.tabId());
  const cb = B.g.claveParaEnvio(EMP, H()); assert.notEqual(cb, ca);
  assert.deepEqual((await resolverHuerfanas(db, B.g, EMP)).inciertas, []);                   // la intención de A (viva) no es huérfana
  await guardarComandaIdempotente(db, EMP, ca, fila()); await guardarComandaIdempotente(db, EMP, cb, fila());
  assert.equal(db.filas.length, 2);
});

test("SIN canal (navegador antiguo): reapertura inmediata → identidad nueva, pero el pedido anterior se COMPRUEBA y se recupera con su folio", async () => {
  const db = baseFalsa({ perderRespuestaEnInsert: 1 }); const local = almacenFalso(), ses = almacenFalso();
  const A = pagina(local, ses); await A.g.iniciar(); const ca = A.g.claveParaEnvio(EMP, H(), { mesa: "Mesa 1", total: 10000 });
  await guardarComandaIdempotente(db, EMP, ca, fila());
  A.matar();
  const A2 = pagina(local, ses); await A2.g.iniciar(); assert.equal(A2.g.duplicada, true);   // sin canal no puede saber si A sigue viva
  const r = await resolverHuerfanas(db, A2.g, EMP);
  assert.equal(r.recuperadas.length, 1); assert.equal(r.recuperadas[0].numero, db.filas[0].numero); assert.deepEqual(r.inciertas, []);
  assert.equal(db.filas.length, 1);
});

test("pedido incierto que la base NO tiene: queda BLOQUEADO (incierta) hasta comprobar de nuevo o descartar; pasados 130 s sigue sin perderse", async () => {
  const db = baseFalsa(); const local = almacenFalso(), ses = almacenFalso();
  const A = pagina(local, ses); await A.g.iniciar(); A.g.claveParaEnvio(EMP, H(), { mesa: "Mesa 7", total: 12345 });   // nunca llegó a la base
  A.matar();
  const A2 = pagina(local, ses); await A2.g.iniciar();
  let r = await resolverHuerfanas(db, A2.g, EMP);
  assert.equal(r.inciertas.length, 1); assert.equal(r.inciertas[0].mesa, "Mesa 7"); assert.equal(r.inciertas[0].total, 12345);
  reloj += 140_000; r = await resolverHuerfanas(db, A2.g, EMP);
  assert.equal(r.inciertas.length, 1);                                                      // sigue bloqueado: no se pierde por el tiempo
  // aparece en la base (respuesta tardía) → al comprobar de nuevo se recupera
  db.filas.push({ id: uuid(), empresa_id: EMP, clave_idempotencia: r.inciertas[0].clave, numero: 777, mesa: "Mesa 7" });
  r = await resolverHuerfanas(db, A2.g, EMP);
  assert.equal(r.recuperadas[0].numero, 777); assert.deepEqual(r.inciertas, []);
  // y el descarte explícito resuelve un incierto que de verdad no se guardó
  const B = pagina(local, almacenFalso()); await B.g.iniciar(); B.g.claveParaEnvio(EMP, H(), { mesa: "Mesa 8" }); B.matar(); reloj += 140_000;
  const C = pagina(local, almacenFalso()); await C.g.iniciar();
  const rc = await resolverHuerfanas(db, C.g, EMP); assert.equal(rc.inciertas.length, 1);
  C.g.descartar(rc.inciertas[0].tab); assert.deepEqual((await resolverHuerfanas(db, C.g, EMP)).inciertas, []);
});

test("un error al comprobar en el servidor NO libera el bloqueo", async () => {
  const local = almacenFalso(), ses = almacenFalso();
  const A = pagina(local, ses); await A.g.iniciar(); A.g.claveParaEnvio(EMP, H()); A.matar();
  const A2 = pagina(local, ses); await A2.g.iniciar();
  const caida = { from: () => { throw new Error("sin red"); } };
  assert.equal((await resolverHuerfanas(caida, A2.g, EMP)).inciertas.length, A2.g.duplicada ? 1 : 0);
  reloj += 140_000; const A3 = pagina(local, almacenFalso()); await A3.g.iniciar();
  assert.equal((await resolverHuerfanas(caida, A3.g, EMP)).inciertas.length, 1);
});
