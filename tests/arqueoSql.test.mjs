// Únicamente PostgreSQL en memoria, con negocios ficticios. No lee .env ni usa red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const ruta=process.env.PGLITE_JS||resolve('../mesapos-empresarial/node_modules/@electric-sql/pglite/dist/index.js');
test('SQL10: arqueo persistido, revisión atómica, reintentos, cambios posteriores y permisos',{skip:existsSync(ruta)?false:'PGlite no disponible'},async()=>{
 const {PGlite}=await import(pathToFileURL(ruta).href);const db=new PGlite();
 const sql=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
 try {
  await db.exec(sql('scripts/prueba-caja/base.sql'));
  await db.exec(sql('supabase/08_turnos_caja.sql'));
  await db.exec(sql('supabase/09_correlativos.sql'));
  await db.exec(sql('supabase/10_arqueo_aprobacion_dueno.sql'));
  const EMP='bbbbbbbb-0000-4000-8000-00000000000b', OTHER='aaaaaaaa-0000-4000-8000-00000000000a';
  const one=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
  const t=(await one("select turno_abrir($1,14000,'Cajera',gen_random_uuid())",[EMP])).turno_id;
  const k=await one('select gen_random_uuid()');
  const presentar=(key=k,n=14000)=>one('select turno_presentar_arqueo($1,$2,$3,$4::jsonb,null,\'Cajera\',null)',[EMP,t,key,JSON.stringify({efectivo:n})]);
  const a=await presentar();assert.equal(a.ok,true);assert.equal(a.arqueo.contado.efectivo,14000);
  assert.equal(await one('select estado from aperturas_caja where id=$1',[t]),'abierta');
  assert.equal((await presentar()).arqueo.id,a.arqueo.id);
  assert.equal((await presentar(k,13000)).codigo,'clave_reutilizada');
  assert.equal((await presentar(await one('select gen_random_uuid()'))).codigo,'arqueo_pendiente');
  const revisar=(emp,id,aprobar=true,motivo=null)=>one('select turno_revisar_arqueo($1,$2,$3,$4,$5,\'Dueño\')',[emp,t,id,aprobar,motivo]);
  assert.equal((await revisar(OTHER,a.arqueo.id)).codigo,'turno_no_encontrado');
  // Un gasto posterior, aunque se compense con otro movimiento, invalida la declaración.
  await db.query('insert into gastos(empresa_id,monto,descripcion) values($1,500,\'Gasto posterior\')',[EMP]);
  assert.equal((await revisar(EMP,a.arqueo.id)).codigo,'arqueo_cambio');
  assert.equal(await one('select count(*)::int from cierres_turno where turno_id=$1',[t]),0);
  assert.equal((await revisar(EMP,a.arqueo.id,false,'')).codigo,'motivo_requerido');
  assert.equal((await revisar(EMP,a.arqueo.id,false,'Contar otra vez')).devuelto,true);
  assert.equal(await one('select contado->>\'efectivo\' from arqueos_turno where id=$1',[a.arqueo.id]),'14000');
  const a2=await presentar(await one('select gen_random_uuid()'),13500);assert.equal(a2.ok,true);
  const cierre=await revisar(EMP,a2.arqueo.id);assert.equal(cierre.ok,true);assert.equal(cierre.numero_cierre,1);
  assert.equal((await revisar(EMP,a2.arqueo.id)).cierre_id,cierre.cierre_id);
  assert.equal(await one('select count(*)::int from cierres_turno where turno_id=$1',[t]),1);
  assert.equal(await one("select diferencia from cierres_turno_medios where cierre_id=$1 and medio='efectivo'",[cierre.cierre_id]),0);
  assert.equal(await one('select revisado_por from arqueos_turno where id=$1',[a2.arqueo.id]),'Dueño');
  assert.equal(await one("select has_table_privilege('anon','arqueos_turno','select')"),false);
  assert.equal(await one("select has_function_privilege('authenticated','turno_revisar_arqueo(uuid,uuid,uuid,boolean,text,text)','execute')"),false);
 } finally {await db.close();}
});
