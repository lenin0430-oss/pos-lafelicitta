// Dos conexiones psql a PostgreSQL LOCAL, sin Supabase, credenciales ni cobros reales.
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const exe=process.env.CODEX_PSQL,db=process.env.DB;
if(!exe||!db||process.env.PGHOST!=='127.0.0.1')throw Error('Solo PostgreSQL local explícito');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db,'-c'];
function sql(q){const r=spawnSync(exe,[...args,q],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const EMP='bbbbbbbb-0000-4000-8000-00000000000b';
const abrir=()=>JSON.parse(sql(`select turno_abrir('${EMP}',14000,'FICTICIA',gen_random_uuid())`)).turno_id;
const presentar=t=>JSON.parse(sql(`select turno_presentar_arqueo('${EMP}','${t}',gen_random_uuid(),'{"efectivo":14000}',null,'FICTICIA',null)`)).arqueo.id;
const aprobar=(t,a)=>`select turno_revisar_arqueo('${EMP}','${t}','${a}',true,null,'DUENO FICTICIO')`;
// La primera transacción conserva el bloqueo mientras la segunda intenta operar.
// No devolver la Promise sin envolverla: async la esperaría hasta el COMMIT.
async function inicia(q){
 const name='ARQUEO_LOCK_'+process.pid;
 const c=spawn(exe,[...args,`set application_name='${name}'; begin; ${q}; select pg_sleep(2); commit;`]);
 let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);
 const done=new Promise(resolve=>c.on('close',code=>resolve({code,out,err})));
 let ready=false;
 for(let i=0;i<60;i++){
  if(sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`)==='1'){ready=true;break;}
  await new Promise(r=>setTimeout(r,20));
 }
 if(!ready)throw Error('No se verifico el bloqueo con pg_stat_activity: '+err);
 return {done};
}
// Gasto primero: aprobación espera y detecta que el arqueo dejó de corresponder.
let t=abrir(),a=presentar(t);let c=await inicia(`insert into gastos(empresa_id,monto,descripcion) values('${EMP}',500,'CARRERA FICTICIA')`);
let start=Date.now(),r=JSON.parse(sql(aprobar(t,a)));assert.equal(r.codigo,'arqueo_cambio');assert.ok(Date.now()-start>700);assert.equal((await c.done).code,0);
sql(`select turno_revisar_arqueo('${EMP}','${t}','${a}',false,'Recontar','DUENO')`);
a=JSON.parse(sql(`select turno_presentar_arqueo('${EMP}','${t}',gen_random_uuid(),'{"efectivo":13500}',null,'FICTICIA',null)`)).arqueo.id;
// Aprobación primero: gasto espera, después se rechaza por turno cerrado.
c=await inicia(aprobar(t,a));const gasto=spawnSync(exe,[...args,`insert into gastos(empresa_id,apertura_id,monto,descripcion) values('${EMP}','${t}',100,'GASTO TARDIO')`],{encoding:'utf8'});assert.notEqual(gasto.status,0);assert.match(gasto.stderr,/TURNO_CERRADO/);assert.equal((await c.done).code,0);
assert.equal(sql(`select count(*) from cierres_turno where turno_id='${t}'`),'1');
// Dos aprobaciones simultáneas devuelven el mismo cierre, sin consumir otro folio.
t=abrir();a=presentar(t);c=await inicia(aprobar(t,a));r=JSON.parse(sql(aprobar(t,a)));assert.equal(r.ok,true);assert.equal(r.repetido,true);assert.equal((await c.done).code,0);assert.equal(sql(`select count(*) from cierres_turno where turno_id='${t}'`),'1');
console.log('PG17: gasto→aprobación, aprobación→gasto, doble aprobación: 3/3 correctas.');
