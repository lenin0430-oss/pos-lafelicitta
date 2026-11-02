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
    insert into ventas (numero,mesa,metodo_pago,total,estado) values
      (1,'M1','Efectivo',5000,'listo'),(2,'M2','Point',7000,'listo'),(3,'M3','',3000,'listo'),
      (4,'M4','Mixto: Efectivo $1.000 + Débito $4.000',5000,'listo'),(5,'M5','',4000,'pendiente'),(6,'M6','',2000,'pendiente');
    insert into pagos_point (venta_id,mp_order_id,monto,estado,restaurante_id) values ('v1','ORD-F1',7000,'processed','A'),('v2','ORD-F2',3000,'canceled','A');
  `);
  return db;
}
const val = async (db, q, p) => (await db.query(q, p)).rows;
const snapshot = (db) => val(db, "select numero,mesa,metodo_pago,total,estado from ventas order by numero");

test("03: backfill conserva el histórico y no cambia estado/metodo_pago/total", T, async () => {
  const db = await nuevaBase();
  const antes = await snapshot(db);
  await db.exec(sql("03_estados_separados.sql"));
  assert.deepEqual(await snapshot(db), antes, "columnas históricas intactas");
  const r = await val(db, "select numero, estado, estado_pago, pagado_at from ventas order by numero");
  assert.deepEqual(r.map((x) => x.estado_pago), ["pagado", "pagado", "pagado", "pagado", "pendiente", "pendiente"]);
  assert.ok(r.every((x) => x.pagado_at === null));
});

test("03: es repetible (idempotente)", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  await db.exec(sql("03_estados_separados.sql"));
  assert.equal((await val(db, "select count(*)::int n from ventas where estado_pago='pagado'"))[0].n, 4);
});

test("03: entregado/listo en cocina no quita ni agrega pagos; el cierre usa estado_pago", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  const cierre = () => val(db, "select coalesce(sum(total),0)::int t, count(*)::int n from ventas where estado_pago='pagado'");
  const base = (await cierre())[0];
  // venta 5 (sin pagar): cocina la pasa a en_proceso, listo y entregado => sigue sin pagar y fuera del cierre
  for (const e of ["en_proceso", "listo", "entregado"]) {
    await db.query("update ventas set estado=$1 where numero=5", [e]);
    assert.deepEqual((await cierre())[0], base, `venta sin pagar en ${e}`);
  }
  assert.equal((await val(db, "select estado_pago from ventas where numero=5"))[0].estado_pago, "pendiente");
  // código nuevo: se cobra explícitamente (sin tocar estado) y luego cocina la entrega
  await db.query("update ventas set metodo_pago='Point', estado_pago='pagado', pagado_at=now() where numero=5");
  assert.equal((await cierre())[0].t, base.t + 4000);
  await db.query("update ventas set estado='entregado' where numero=5");
  assert.equal((await cierre())[0].t, base.t + 4000, "entregar no quita la venta pagada");
  // una venta pagada que cocina vuelve a mover no deja de estar pagada
  await db.query("update ventas set estado='en_proceso' where numero=1");
  assert.equal((await val(db, "select estado_pago from ventas where numero=1"))[0].estado_pago, "pagado");
});

test("03: compatibilidad con el código ANTIGUO durante el despliegue", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  // antiguo cobra: estado='listo' + metodo_pago  => debe quedar pagado
  await db.query("update ventas set estado='listo', metodo_pago='Efectivo' where numero=6");
  assert.equal((await val(db, "select estado_pago from ventas where numero=6"))[0].estado_pago, "pagado");
  // cocina del código nuevo marca listo SIN método de pago => NO queda pagado
  await db.query("insert into ventas (numero,mesa,metodo_pago,total,estado) values (7,'M7','',1000,'pendiente')");
  await db.query("update ventas set estado='listo' where numero=7");
  assert.equal((await val(db, "select estado_pago from ventas where numero=7"))[0].estado_pago, "pendiente");
  // 03b retira el disparador
  await db.exec(sql("03b_retirar_compatibilidad.sql"));
  await db.query("insert into ventas (numero,mesa,metodo_pago,total,estado) values (8,'M8','Efectivo',1000,'pendiente')");
  await db.query("update ventas set estado='listo' where numero=8");
  assert.equal((await val(db, "select estado_pago from ventas where numero=8"))[0].estado_pago, "pendiente");
});

test("03: reversión restaura el esquema sin perder ventas ni cobros", T, async () => {
  const db = await nuevaBase();
  await db.exec(sql("03_estados_separados.sql"));
  // con el código nuevo: venta 5 cobrada pero aún 'pendiente' en cocina, y venta 6 cobrada y entregada
  await db.query("update ventas set metodo_pago='Efectivo', estado_pago='pagado' where numero=5");
  await db.query("update ventas set metodo_pago='Débito', estado_pago='pagado', estado='entregado' where numero=6");
  await db.exec(sql("03_estados_separados_REVERSION.sql"));
  const cols = (await val(db, "select column_name from information_schema.columns where table_name='ventas'")).map((c) => c.column_name);
  assert.ok(!cols.includes("estado_pago") && !cols.includes("pagado_at"));
  const r = await val(db, "select numero, estado from ventas order by numero");
  assert.equal(r.length, 6);
  assert.deepEqual(r.map((x) => x.estado), ["listo", "listo", "listo", "listo", "listo", "listo"], "cobradas quedan 'listo' para el código anterior");
  assert.equal((await val(db, "select count(*)::int n from pg_trigger where tgname='trg_ventas_compat_estado_pago'"))[0].n, 0);
  await db.exec(sql("03_estados_separados.sql")); // y se puede volver a aplicar
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
