import test from 'node:test';
import assert from 'node:assert/strict';
import { accionTurno, estadoTurno, historialTurnos, vistaArqueo, vistaTurno } from '../lib/turnosServidor.ts';
const EMP='aaaaaaaa-0000-4000-8000-00000000000a', T='11111111-1111-4111-8111-111111111111', A='22222222-2222-4222-8222-222222222222';
const cajera={rol:'garzon',empresa_id:EMP,nombre:'Cajera ficticia'}, admin={...cajera,rol:'admin',nombre:'Dueño ficticio'};
const resumen={turno:{id:T},fondo:14000,cobros:{efectivo:19000},esperado:{efectivo:28000},gastos_caja:5000,retiros:0,bloqueos:[]};
const arqueo={id:A,estado:'pendiente',contado:{efectivo:27000},resumen,huella:'privada',presentado_por:cajera.nombre};
function dbFalsa({data={ok:true,arqueo},error=null}={}) {
 const llamadas=[];
 const from=t=>{const filtros=[];const q={select:()=>q,eq:(k,v)=>(filtros.push([k,v]),q),is:()=>q,neq:()=>q,not:()=>q,in:()=>q,order:()=>q,limit:()=>q,
  maybeSingle:async()=>({data:t==='arqueos_turno'?arqueo:(filtros.some(([k,v])=>k==='empresa_id'&&v!==EMP)?null:{id:T})}),then:res=>res({data:[]})};return q;};
 return {llamadas,from,rpc:async(fn,args)=>(llamadas.push([fn,args]),fn==='turno_resumen'?{data:resumen}:{data,error})};
}
test('cajera no cierra ni devuelve arqueos, aunque fabrique el rol o el permiso en el cuerpo',async()=>{
 const db=dbFalsa();
 for(const accion of ['cerrar','devolver_arqueo']) assert.equal((await accionTurno(db,cajera,{accion,turno_id:T,arqueo_id:A,rol:'admin',forzar:true})).status,403);
 assert.equal(db.llamadas.length,0);
});
test('cajera abre con fondo real; puede presentar sin conocer esperado y nunca manda una cifra de esperado inventada',async()=>{
 const db=dbFalsa();
 assert.equal((await accionTurno(db,cajera,{accion:'abrir',fondo:14000,clave:A})).status,200);
 const r=await accionTurno(db,cajera,{accion:'presentar_arqueo',turno_id:T,clave:A,contados:{efectivo:27000},esperado_visto:{efectivo:999},empresa_id:'otra',presentado_por:'otra'});
 assert.equal(r.status,200);
 const [fn,args]=db.llamadas.at(-1); assert.equal(fn,'turno_presentar_arqueo'); assert.equal(args.p_esperado_visto,null);assert.equal(args.p_por,cajera.nombre);assert.equal(args.p_empresa,EMP);
 assert.equal(r.body.arqueo.contado.efectivo,27000);assert.equal('resumen' in r.body.arqueo,false);assert.equal('huella' in r.body.arqueo,false);
});
test('el dueño aprueba el arqueo guardado; no puede reemplazar contado mediante el cuerpo del cierre',async()=>{
 const db=dbFalsa();const r=await accionTurno(db,admin,{accion:'cerrar',turno_id:T,arqueo_id:A,contados:{efectivo:1},p_aprobar:false});
 assert.equal(r.status,200);assert.deepEqual(db.llamadas.at(-1),['turno_revisar_arqueo',{p_empresa:EMP,p_turno:T,p_arqueo:A,p_aprobar:true,p_motivo:null,p_por:admin.nombre}]);
});
test('devolución exige motivo; otro negocio no puede aprobar el arqueo',async()=>{
 const db=dbFalsa();assert.equal((await accionTurno(db,admin,{accion:'devolver_arqueo',turno_id:T,arqueo_id:A})).status,400);
 assert.equal((await accionTurno(db,{...admin,empresa_id:'otro'},{accion:'cerrar',turno_id:T,arqueo_id:A})).status,404);
 assert.equal((await accionTurno(db,admin,{accion:'devolver_arqueo',turno_id:T,arqueo_id:A,motivo:' Recontar billetes '})).status,200);
 assert.equal(db.llamadas.at(-1)[1].p_motivo,'Recontar billetes');
});
test('arqueo ciego en GET y en historial; el dueño conserva el detalle',async()=>{
 const c=await estadoTurno(dbFalsa(),cajera);assert.equal(c.status,200);assert.deepEqual(Object.keys(c.body.resumen).sort(),['bloqueos','turno']);assert.equal('resumen' in c.body.arqueo,false);
 assert.equal((await historialTurnos(dbFalsa(),cajera)).status,403);
 assert.equal((await estadoTurno(dbFalsa(),admin)).body.resumen.esperado.efectivo,28000);
 assert.equal(vistaArqueo(arqueo,'admin'),arqueo);assert.equal(vistaTurno(resumen,'admin'),resumen);
});
test('movimientos posteriores o falta de migración nunca terminan en un cierre directo alternativo',async()=>{
 for(const [data,error,status] of [[{ok:false,codigo:'arqueo_cambio'},null,409],[null,{code:'42883'},500]]) {
  const db=dbFalsa({data,error});const r=await accionTurno(db,admin,{accion:'cerrar',turno_id:T,arqueo_id:A});assert.equal(r.status,status);assert.equal(db.llamadas.length,1);assert.equal(db.llamadas[0][0],'turno_revisar_arqueo');
 }
});
