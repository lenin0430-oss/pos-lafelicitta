// Fixture VISUAL local: API simulada, sin Supabase, sin pagos ni credenciales reales.
// Sirve la compilación real de Next, interceptando TODAS las rutas /api/.
import http from 'node:http';
import next from 'next';
import {vistaArqueo,vistaTurno} from '../../lib/turnosServidor.ts';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
const app=next({dev:false,hostname:'127.0.0.1',port:3114});await app.prepare();const handler=app.getRequestHandler();
const turno={id:'11111111-1111-4111-8111-111111111111',numero:1,estado:'abierta',fecha_apertura:'2026-11-03',apertura_at:'2026-11-03T15:00:00Z',cierre_at:null,cajero:'Cajera FICTICIA',horas_abiertas:7};
const resumen={turno,fondo:14000,cobros:{efectivo:19000,debito:5000,credito:0,transferencia:2000,qr:0,por_conciliar:0,cortesia:0},gastos_caja:5000,gastos_otros_medios:0,retiros:0,propinas_registradas:0,esperado:{efectivo:28000,debito:5000,credito:0,transferencia:2000,qr:0,por_conciliar:0},pendientes:{cobros_por_conciliar:0,monto_por_conciliar:0,ventas_sin_cobrar:0},bloqueos:[]};
let arqueo=null;
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1:3114').pathname;
 if(path==='/ensayo') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<html lang="es"><body style="font:22px Arial;padding:40px"><h1>ENSAYO VISUAL · DATOS FICTICIOS</h1><p>No registra ventas ni usa la base real.</p><button onclick="entrar('garzon')">Ver como cajera ficticia</button> <button onclick="entrar('admin')">Ver como dueño ficticio</button><script>function entrar(rol){localStorage.setItem('lf_sesion',JSON.stringify({rol,nombre:'FICTICIO',empresa_id:'bbbbbbbb-0000-4000-8000-00000000000b',expira:Date.now()+3600000}));document.cookie='fixture_rol='+rol+'; Path=/';location.href='/cierre'}</script></body></html>`);return;}
 if(path.startsWith('/api/')) {
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const rol=(req.headers.cookie??'').includes('fixture_rol=admin')?'admin':'garzon';
  if(path!=='/api/turno'){res.statusCode=404;res.end(JSON.stringify({ok:false,error:'Fixture visual: esta operación no existe'}));return;}
  if(req.method==='GET') {
   if(req.url.includes('historial')){res.statusCode=rol==='admin'?200:403;res.end(JSON.stringify({ok:rol==='admin',cierres:[]}));return;}
   res.end(JSON.stringify({ok:true,rol,abierto:true,resumen:vistaTurno(resumen,rol),arqueo:vistaArqueo(arqueo,rol),por_conciliar:[],point_confirmados:[]}));return;
  }
  let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);
  if(b.accion==='presentar_arqueo') {arqueo={id:'22222222-2222-4222-8222-222222222222',estado:'pendiente',contado:b.contados,resumen,presentado_por:'Cajera FICTICIA',presentado_at:new Date().toISOString(),notas:b.notas};res.end(JSON.stringify({ok:true,arqueo:vistaArqueo(arqueo,rol)}));return;}
  res.statusCode=403;res.end(JSON.stringify({ok:false,error:'Ensayo visual: no se cierra ningún turno'}));return;
 }
 return handler(req,res);
}).listen(3114,'127.0.0.1',()=>console.log('ENSAYO VISUAL SIN BASE: http://127.0.0.1:3114/ensayo'));
