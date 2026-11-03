-- Datos HISTÓRICOS previos a 09 (se aplican entre 08 y 09): duplicados de número reales (dos equipos con localStorage) y un máximo alto.
insert into ventas(id,numero,mesa,total,empresa_id,estado,estado_pago,metodo_pago,created_at) values
 ('a1000000-0000-4000-8000-000000000001',5,'Mesa 1',1000,'aaaaaaaa-0000-4000-8000-00000000000a','entregado','pagado','Efectivo','2026-10-30 18:00+00'),
 ('a1000000-0000-4000-8000-000000000002',5,'Mesa 2',2000,'aaaaaaaa-0000-4000-8000-00000000000a','entregado','pagado','Efectivo','2026-10-30 18:05+00'),
 ('a1000000-0000-4000-8000-000000000003',120,'Mesa 3',3000,'aaaaaaaa-0000-4000-8000-00000000000a','entregado','pagado','Efectivo','2026-10-30 19:00+00'),
 ('b1000000-0000-4000-8000-000000000001',7,'Mesa 1',500,'bbbbbbbb-0000-4000-8000-00000000000b','entregado','pagado','Efectivo','2026-10-30 19:00+00');
create table public.z_historico as select id, numero, empresa_id from ventas;
