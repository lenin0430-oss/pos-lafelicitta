// Prueba las migraciones 03 y 04 (y sus reversiones) en PostgreSQL EN MEMORIA con datos FICTICIOS.
// No toca ninguna base remota. Usa PGlite de la copia de referencia de Empresarial (solo lectura).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RUTA = process.env.PGLITE_JS ||
  `${process.env.HOME}/mnt/consolidacion/mesapos-empresarial/node_modules/@electric-sql/pglite/dist/index.js`;
const sql = (n) => readFileSync(new URL(`../supabase/${n}`, import.meta.url), "utf8");
const hay = existsSync(RUTA);
const T = { skip: hay ? false : "PGlite no disponible (define PGLITE_JS)" };

async function nuevaBase() {
  const { PGlite } = await import(pathToFileURL(RUTA).href);
  const db = new PGlite();
  // Esquema equivalente al real (columnas leídas de information_schema el 02/11/2026).
  await db.exec(`
    create table ventas (id uuid primary key default gen_random_uuid(), numero int not null, mesa text not null,
      metodo_pago text default 'Débito', total int not null, estado text default 'pendiente',
      created_at timestamptz default now(), empresa_id uuid);
    create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text not null, mp_order_id text unique,
      monto int not null, estado text not null default 'created', created_at timestamptz default now(),
      updated_at timestamptz default now(), restaurante_id text);
    insert into ventas (numero,mesa,metodo_pago,total,estado,created_at) values
      (1,'M1','Efectivo',5000,'listo',now()-interval '3 days'),(2,'M2','Point',7000,'listo',now()-interval '3 days'),
      (3,'M3','',3000,'listo',now()-interval '3 days'),
      (4,'M4','Mixto: Efectivo $1.000 + Débito $4.000',5000,'listo',now()-interval '3 days'),
      (5,'M5','',4000,'pendiente',now()-interval '30 hours'),(6,'M6','',2000,'pendiente',now()),
      (7,'M7','Cortesía',1500,'listo',now()-interval '3 days'),
      (8,'M8','',2500,'listo',now()-interval '1 hour'),
      (9,'M9','Débito',3500,'en_proceso',now()-interval '2 hours');
    insert into pagos_point (venta_id,mp_order_id,monto,estado,restaurante_id) values ('v1','ORD-F1',7000,'processed','A'),('v2','ORD-F2',3000,'canceled','A');
  `);
  return db;
}
const val = async (db, q, p) => (await db.query(q, p)).rows;
const snapshot = (db) => val(db, "select numero,mesa,metodo_pago,total,estado from ventas order by numero");

test("03: backfill conserva importes/métodos y aplica el criterio (sin deducir pagado solo por cocina)", T, async () => {
  const db = await nuevaBase();
  const antes = await snapshot(db);
  await db.exec(sql("03_estados_separados.sql"));
  const despues = await val(db, "select numero,mesa,metodo_pago,total from ventas order by numero");
  assert.deepEqual(despues, antes.map(({ estado, ...r }) => r), "metodo_pago, total y mesa intactos");
  const r = await val(db, "select numero, estado, estado_pago, pagado_at from ventas order by numero");
  const ep = Object.fromEntries(r.map((x) => [x.numero, x.estado_pago]));
  assert.deepEqual(ep, { 1: "pagado", 2: "pagado", 3: "sin_identificar", 4: "pagado", 5: "pendiente", 6: "pendiente", 7: "cortesia", 8: "sin_identificar", 9: "pendiente" });
  assert.ok(r.every((x) => x.pagado_at === null));
  // en_proceso con método por defecto 'Débito' NO se deduce pagado
  assert.equal(ep[9], "pendiente");
});

test("03: NO cambia ningún estado de cocina (se conservan los originales)", T, async () => {
  const db = await nuevaBase();
  const antes = await val(db, "select numero, estado from ventas order by numero");
  await db.exec(sql("03_estados_separados.sql"));
  assert.deepEqual(await val(db, "select numero, estado from ventas order by numero"), antes);
  assert.equal((await val(db, "select count(*)::int n from ventas where cocina_archivada_at is not null"))[0].n, 0);
});

test("06 (propuesta): archivar cocina no cambia estados, no oculta pendientes/en proceso ni lo de hoy; es reversible", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  const antes = await val(db, "select numero, estado, estado_pago, metodo_pago, total from ventas order by numero");
  await db.exec(sql("06_archivar_cocina_historica_PROPUESTA.sql"));
  assert.deepEqual(await val(db, "select numero, estado, estado_pago, metodo_pago, total from ventas order by numero"), antes, "solo cambia la marca de archivo");
  const arch = (await val(db, "select numero from ventas where cocina_archivada_at is not null order by numero")).map((x) => x.numero);
  assert.deepEqual(arch, [1, 2, 3, 4, 7], "solo 'listo' de días anteriores");
  const visibles = (await val(db, "select numero from ventas where estado in ('pendiente','en_proceso','listo') and cocina_archivada_at is null order by numero")).map((x) => x.numero);
  assert.deepEqual(visibles, [5, 6, 8, 9], "pendiente de 30 h, en_proceso y listo/pendiente de hoy siguen visibles");
  await db.exec(sql("06_archivar_cocina_historica_PROPUESTA_REVERSION.sql"));
  assert.equal((await val(db, "select count(*)::int n from ventas where cocina_archivada_at is not null"))[0].n, 0);
});

test("03: Point con evidencia del proveedor se puede distinguir de lo inferido por método", T, async () => {
  const db = await nuevaBase();
  await db.query("update pagos_point set venta_id = (select id::text from ventas where numero=2) where mp_order_id='ORD-F1'");
  await db.exec(sql("03_estados_separados.sql"));
  const r = await val(db, "select v.numero from ventas v join pagos_point p on p.venta_id=v.id::text and p.estado='processed' where v.estado_pago='pagado'");
  assert.deepEqual(r.map((x) => x.numero), [2]);
  assert.equal((await val(db, "select count(*)::int n from ventas where estado_pago='pagado' and pagado_at is not null"))[0].n, 0, "no se inventan fechas de cobro");
});

test("03: totales invariantes: registradas = pagado + cortesía + sin identificar + pendiente", T, async () => {
  const db = await nuevaBase();
  const t0 = (await val(db, "select sum(total)::int t, count(*)::int n from ventas"))[0];
  await db.exec(sql("03_estados_separados.sql"));
  assert.deepEqual((await val(db, "select sum(total)::int t, count(*)::int n from ventas"))[0], t0);
  const g = await val(db, "select estado_pago, sum(total)::int t from ventas group by 1");
  assert.equal(g.reduce((s, x) => s + x.t, 0), t0.t);
});

test("03: es repetible (idempotente)", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  const a = await val(db, "select numero, estado, estado_pago from ventas order by numero");
  await db.exec(sql("03_estados_separados.sql"));
  assert.deepEqual(await val(db, "select numero, estado, estado_pago from ventas order by numero"), a);
});

test("03: entregado/listo en cocina no quita ni agrega pagos; el cierre usa estado_pago", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  const cierre = () => val(db, "select coalesce(sum(total),0)::int t, count(*)::int n from ventas where estado_pago='pagado'");
  const base = (await cierre())[0];
  for (const e of ["en_proceso", "listo", "entregado"]) {
    await db.query("update ventas set estado=$1 where numero=5", [e]);
    assert.deepEqual((await cierre())[0], base, `venta sin pagar en ${e}`);
  }
  assert.equal((await val(db, "select estado_pago from ventas where numero=5"))[0].estado_pago, "pendiente");
  await db.query("update ventas set estado='pendiente' where numero=5");
  // código nuevo: cobra sin tocar la cocina → la comanda sigue pendiente (visible) y el cobro entra al cierre
  await db.query("update ventas set metodo_pago='Point', estado_pago='pagado', pagado_at=now() where numero=5");
  assert.equal((await cierre())[0].t, base.t + 4000);
  assert.equal((await val(db, "select estado from ventas where numero=5"))[0].estado, "pendiente", "cobrar no retira la comanda");
  await db.query("update ventas set estado='entregado' where numero=5");
  assert.equal((await cierre())[0].t, base.t + 4000, "entregar no quita la venta pagada");
});

test("03: compatibilidad con el código ANTIGUO durante el despliegue", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  // antiguo cobra: estado='listo' + metodo_pago  => pagado, con pagado_at, y la comanda sigue visible ('listo')
  await db.query("update ventas set estado='listo', metodo_pago='Efectivo' where numero=6");
  let r = (await val(db, "select estado, estado_pago, pagado_at from ventas where numero=6"))[0];
  assert.equal(r.estado_pago, "pagado"); assert.equal(r.estado, "listo"); assert.ok(r.pagado_at);
  // antiguo cobra con Cortesía
  await db.query("insert into ventas (numero,mesa,metodo_pago,total,estado) values (10,'M10','',1000,'pendiente')");
  await db.query("update ventas set estado='listo', metodo_pago='Cortesía' where numero=10");
  assert.equal((await val(db, "select estado_pago from ventas where numero=10"))[0].estado_pago, "cortesia");
  // cocina marca listo SIN método => NO queda pagado
  await db.query("insert into ventas (numero,mesa,metodo_pago,total,estado) values (7777,'M77','',1000,'pendiente')");
  await db.query("update ventas set estado='listo' where numero=7777");
  assert.equal((await val(db, "select estado_pago from ventas where numero=7777"))[0].estado_pago, "pendiente");
  await db.exec(sql("03b_retirar_compatibilidad.sql"));
  await db.query("insert into ventas (numero,mesa,metodo_pago,total,estado) values (8888,'M88','Efectivo',1000,'pendiente')");
  await db.query("update ventas set estado='listo' where numero=8888");
  assert.equal((await val(db, "select estado_pago from ventas where numero=8888"))[0].estado_pago, "pendiente");
});

test("03: reversión no altera el histórico y no pierde ventas, importes ni métodos", T, async () => {
  const db = await nuevaBase();
  const antes = await snapshot(db);
  await db.exec(sql("03_estados_separados.sql"));
  // con el código nuevo: venta 5 cobrada pero aún 'pendiente'; venta 6 cobrada y entregada
  await db.query("update ventas set metodo_pago='Efectivo', estado_pago='pagado', pagado_at=now() where numero=5");
  await db.query("update ventas set metodo_pago='Débito', estado_pago='pagado', estado='entregado', pagado_at=now() where numero=6");
  await db.exec(sql("03_estados_separados_REVERSION.sql"));
  const cols = (await val(db, "select column_name from information_schema.columns where table_name='ventas'")).map((c) => c.column_name);
  assert.ok(!["estado_pago", "pagado_at", "cocina_archivada_at"].some((c) => cols.includes(c)));
  const r = Object.fromEntries((await val(db, "select numero, estado, metodo_pago, total from ventas")).map((x) => [x.numero, x]));
  const a = Object.fromEntries(antes.map((x) => [x.numero, x]));
  for (const n of [1, 2, 3, 4, 7, 8, 9]) { assert.equal(r[n].estado, a[n].estado, `venta ${n} vuelve a su estado original`); assert.equal(r[n].total, a[n].total); }
  assert.equal(r[5].estado, "listo", "cobrada con código nuevo → listo para el código antiguo");
  assert.equal(r[6].estado, "listo");
  assert.equal(Object.keys(r).length, 9);
  assert.equal((await val(db, "select count(*)::int n from pg_trigger where tgname='trg_ventas_compat_estado_pago'"))[0].n, 0);
  await db.exec(sql("03_estados_separados.sql")); // y se puede volver a aplicar
});

test("verificar_03_04.sql es solo lectura", T, async () => {
  const txt = sql("verificar_03_04.sql").replace(/--.*$/gm, "");
  assert.ok(!/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(txt));
});

test("04: un solo intento activo por venta aunque lleguen dos INSERT a la vez", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("04_pagos_point_reserva.sql"));
  const ins = (rest, venta) => db.query("insert into pagos_point (restaurante_id,venta_id,monto,estado) values ($1,$2,5000,'reservado')", [rest, venta]);
  const r = await Promise.allSettled([ins("A", "vx"), ins("A", "vx")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(r.find((x) => x.status === "rejected").reason.code, "23505");
  await ins("B", "vx");                       // otro negocio, misma venta: permitido
  await ins("A", "vy");                       // otra venta: permitido
  await db.query("update pagos_point set estado='processed' where restaurante_id='A' and venta_id='vx'");
  await ins("A", "vx");                       // tras un estado final se puede reintentar
  const f = await val(db, "select clave_idempotencia from pagos_point");
  assert.equal(new Set(f.map((x) => String(x.clave_idempotencia))).size, f.length, "claves únicas por intento");
  assert.equal((await val(db, "select count(*)::int n from pagos_point where mp_order_id is null"))[0].n >= 3, true);
});

test("04: filas históricas se conservan y la reversión las deja intactas", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("04_pagos_point_reserva.sql"));
  assert.equal((await val(db, "select count(*)::int n from pagos_point where mp_order_id like 'ORD-F%'"))[0].n, 2);
  await db.exec(sql("04_pagos_point_reserva_REVERSION.sql"));
  const cols = (await val(db, "select column_name from information_schema.columns where table_name='pagos_point'")).map((c) => c.column_name);
  assert.ok(!cols.includes("clave_idempotencia") && !cols.includes("referencia_externa"));
  assert.equal((await val(db, "select count(*)::int n from pagos_point"))[0].n, 2);
});

test("05 (propuesta): reconciliación de menú todo-o-nada, reversible y sin tocar ventas", T, async () => {
  const ops = JSON.parse(readFileSync(new URL("../docs/reconciliacion-menu/operaciones.json", import.meta.url), "utf8"));
  assert.deepEqual([ops.actualizar_precio.length, ops.desactivar.length, ops.crear.length], [27, 5, 7]);
  const { PGlite } = await import(pathToFileURL(RUTA).href);
  const db = new PGlite();
  await db.exec(`create table productos (id uuid primary key default gen_random_uuid(), empresa_id uuid, categoria_id uuid, nombre text, precio int, disponible bool default true, activo bool default true);
    create table ventas (id serial primary key, items jsonb, total int);`);
  const cat = (n) => ops.crear.find((c) => c.categoria === n)?.categoria_id ?? "00000000-0000-0000-0000-000000000001";
  for (const o of ops.actualizar_precio) await db.query("insert into productos (id,empresa_id,categoria_id,nombre,precio) values ($1,$2,$3,$4,$5)", [o.id, ops.empresa_id, cat("x"), o.producto, o.precio_antes]);
  for (const o of ops.desactivar) await db.query("insert into productos (id,empresa_id,categoria_id,nombre,precio) values ($1,$2,$3,$4,$5)", [o.id, ops.empresa_id, cat("x"), o.producto, o.precio]);
  await db.query("insert into ventas (items,total) values ($1,5000)", [JSON.stringify([{ nombre: "Pollo al horno", precio_unit: 4990 }])]);
  const ventasAntes = JSON.stringify((await db.query("select * from ventas")).rows);
  // precio distinto => aborta TODO el bloque
  await db.query("update productos set precio=precio+1 where id=$1", [ops.actualizar_precio[26].id]);
  await assert.rejects(db.exec(sql("05_reconciliar_menu_PROPUESTA.sql")));
  await db.exec("rollback");
  assert.equal((await val(db, "select count(*)::int n from productos where activo=false"))[0].n, 0, "sin cambios parciales");
  assert.equal((await val(db, "select count(*)::int n from productos"))[0].n, 32);
  await db.query("update productos set precio=precio-1 where id=$1", [ops.actualizar_precio[26].id]);
  await db.exec(sql("05_reconciliar_menu_PROPUESTA.sql"));
  assert.equal((await val(db, "select count(*)::int n from productos"))[0].n, 39, "7 altas, ninguna baja física");
  assert.equal((await val(db, "select count(*)::int n from productos where activo=false"))[0].n, 5);
  assert.equal((await val(db, "select precio from productos where id=$1", [ops.actualizar_precio[0].id]))[0].precio, 6500);
  assert.equal(JSON.stringify((await db.query("select * from ventas")).rows), ventasAntes, "ventas intactas");
  await assert.rejects(db.exec(sql("05_reconciliar_menu_PROPUESTA.sql")), "repetirlo falla sin duplicar (ya aplicado)");
  await db.exec("rollback");
  assert.equal((await val(db, "select count(*)::int n from productos"))[0].n, 39);
  await db.exec(sql("05_reconciliar_menu_PROPUESTA_REVERSION.sql"));
  assert.equal((await val(db, "select precio from productos where id=$1", [ops.actualizar_precio[0].id]))[0].precio, 6990);
  assert.equal((await val(db, "select count(*)::int n from productos where activo=false"))[0].n, 7, "las 7 altas quedan desactivadas, no borradas");
  assert.equal((await val(db, "select count(*)::int n from productos"))[0].n, 39);
});
