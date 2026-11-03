// Ensayo autorizado: solo API local y negocio ficticio dedicado. Nunca dinero real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const origin = 'http://localhost:3112';
const empresa = 'c0300000-0000-4000-8000-000000000001';
let cookie = '';
const evidencia = [];
async function api(path, body) {
  const r = await fetch(origin + path, {method: body ? 'POST' : 'GET', headers: {'Content-Type':'application/json', Origin:origin, ...(cookie ? {Cookie:cookie} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const j = await r.json();
  evidencia.push({ruta:path,status:r.status,respuesta:j});
  assert.equal(r.status,200, JSON.stringify(j));
  assert.ok(!j.error, JSON.stringify(j));
  return j;
}
const login=await api('/api/auth/login',{modo:'admin',email:'e2e-cierre-codex@example.test',password:'8437'});
assert.equal(login.empresa_id,empresa);
const estado=await api('/api/turno');
assert.equal(estado.resumen.turno.numero,1);
const turno=estado.resumen.turno.id;
async function datos(tabla,pasos) {return api('/api/datos',{tabla,pasos});}
for (const medio of ['Efectivo','Débito','Transferencia','QR','Crédito']) {
  const venta=await datos('ventas',[{m:'insert',a:[{empresa_id:empresa,mesa:'PRUEBA CIERRE',mesero:'E2E Admin Cierre',personas:1,metodo_pago:'',total:5000,items:[{nombre:'Plato prueba cierre',cantidad:1,precio_unit:5000}],estado:'pendiente',clave_idempotencia:randomUUID()}]},{m:'select',a:['*']},{m:'single',a:[]}]);
  assert.ok(venta.data.id);
  const id=venta.data.id;
  for (const cocina of ['en_proceso','listo']) await datos('ventas',[{m:'update',a:[{estado:cocina}]},{m:'eq',a:['id',id]}]);
  await datos('ventas',[{m:'update',a:[{metodo_pago:medio,estado_pago:'pagado',pagado_at:new Date().toISOString()}]},{m:'eq',a:['id',id]}]);
  await datos('ventas',[{m:'update',a:[{estado:'entregado'}]},{m:'eq',a:['id',id]}]);
  console.log(`Comanda ${venta.data.numero}: ${medio} $5.000, entregada y cobrada`);
}
await api('/api/gastos',{categoria:'Otros',descripcion:'E2E CIERRE: gasto ficticio de caja',monto:2000,afecto_caja:true});
// Gasto pagado fuera del cajón: debe registrarse pero no restar efectivo.
await api('/api/gastos',{categoria:'Otros',descripcion:'E2E CIERRE: gasto ficticio fuera de caja',monto:1500,afecto_caja:false});
const resumen=await api('/api/turno');
assert.equal(resumen.resumen.gastos_caja,2000);
assert.equal(resumen.resumen.gastos_otros_medios,1500);
assert.equal(resumen.resumen.esperado.efectivo,13000); // falta el retiro de $3.000, que se hará por pantalla.
assert.equal(resumen.resumen.pendientes.bloqueos_total,0);
for (const medio of ['debito','transferencia','qr','credito']) assert.equal(resumen.resumen.esperado[medio],5000);
writeFileSync('docs/evidencia/CIERRE_LIMPIO_CODEX_API.json', JSON.stringify({empresa,turno,fecha:new Date().toISOString(),evidencia},null,2));
console.log('API: cinco cobros, dos gastos, cero bloqueos; falta retiro y cierre por pantalla.');
