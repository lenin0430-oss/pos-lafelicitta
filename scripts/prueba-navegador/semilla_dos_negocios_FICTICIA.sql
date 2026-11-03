-- MesaPOS · SEMILLA FICTICIA de dos negocios para la prueba e2e. NO APLICADA.
-- SOLO el proyecto de pruebas mesapos-pruebas-aislado (ref wcoaulvlicfimdfmwhid). NUNCA producción.
-- UNA transacción: si algo falla no queda nada a medias. Las líneas de venta usan precio_unit (como el POS y las reglas de ventas).
-- Idempotente (uuid fijos + on conflict do nothing). No toca filas existentes. Requiere 03 y 04 (04b/07b/07c/07a/07 según la etapa).
-- Marcador: nombres 'E2E …', emails '@example.test', mesas 'E2E-…'. Limpieza: ver semilla_dos_negocios_LIMPIEZA.sql.
-- PIN de PRUEBA (ficticios, solo de este proyecto): A admin 7101 · A garzón 7102 · B admin 7201 · B garzón 7202. Todos distintos
-- porque el login del garzón busca solo por PIN. Con PIN_MODO=legacy se leen de usuarios.pin.

begin;

insert into empresas (id, nombre, slug, ciudad, plan, estado, activo) values
 ('e2e00000-0000-4000-8000-00000000000a','E2E Negocio A','e2e-negocio-a','Iquique','prueba','activo',true),
 ('e2e00000-0000-4000-8000-00000000000b','E2E Negocio B','e2e-negocio-b','Iquique','prueba','activo',true)
on conflict (id) do nothing;

insert into usuarios (id, empresa_id, nombre, email, rol, activo, pin) values
 ('e2e10000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-00000000000a','E2E Admin A','e2e-admin-a@example.test','admin',true,'7101'),
 ('e2e10000-0000-4000-8000-0000000000a2','e2e00000-0000-4000-8000-00000000000a','E2E Garzon A','e2e-garzon-a@example.test','garzon',true,'7102'),
 ('e2e10000-0000-4000-8000-0000000000b1','e2e00000-0000-4000-8000-00000000000b','E2E Admin B','e2e-admin-b@example.test','admin',true,'7201'),
 ('e2e10000-0000-4000-8000-0000000000b2','e2e00000-0000-4000-8000-00000000000b','E2E Garzon B','e2e-garzon-b@example.test','garzon',true,'7202')
on conflict (id) do nothing;

insert into categorias (id, empresa_id, nombre, orden, activo, activa) values
 ('e2e20000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-00000000000a','E2E Platos A',1,true,true),
 ('e2e20000-0000-4000-8000-0000000000b1','e2e00000-0000-4000-8000-00000000000b','E2E Platos B',1,true,true)
on conflict (id) do nothing;

-- Precios ficticios. "E2E Plato común" existe en ambos negocios con PRECIO DISTINTO (A 4000 / B 5000): prueba que el catálogo se valida por negocio.
-- "E2E Plato caro" (A 35000) sirve para el gasto/aprobación y totales altos; "E2E Plato inactivo" (activo=false) debe ser rechazado en ventas.
insert into productos (id, empresa_id, categoria_id, nombre, precio, disponible, activo) values
 ('e2e30000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-00000000000a','e2e20000-0000-4000-8000-0000000000a1','E2E Plato común',4000,true,true),
 ('e2e30000-0000-4000-8000-0000000000a2','e2e00000-0000-4000-8000-00000000000a','e2e20000-0000-4000-8000-0000000000a1','E2E Bebida A',1500,true,true),
 ('e2e30000-0000-4000-8000-0000000000a3','e2e00000-0000-4000-8000-00000000000a','e2e20000-0000-4000-8000-0000000000a1','E2E Plato caro',35000,true,true),
 ('e2e30000-0000-4000-8000-0000000000a4','e2e00000-0000-4000-8000-00000000000a','e2e20000-0000-4000-8000-0000000000a1','E2E Plato inactivo',3000,true,false),
 ('e2e30000-0000-4000-8000-0000000000b1','e2e00000-0000-4000-8000-00000000000b','e2e20000-0000-4000-8000-0000000000b1','E2E Plato común',5000,true,true),
 ('e2e30000-0000-4000-8000-0000000000b2','e2e00000-0000-4000-8000-00000000000b','e2e20000-0000-4000-8000-0000000000b1','E2E Bebida B',2000,true,true)
on conflict (id) do nothing;

insert into mesas (id, empresa_id, nombre, numero, estado, activo, activa) values
 ('e2e40000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-00000000000a','E2E-A1',1,'libre',true,true),
 ('e2e40000-0000-4000-8000-0000000000a2','e2e00000-0000-4000-8000-00000000000a','E2E-A2',2,'libre',true,true),
 ('e2e40000-0000-4000-8000-0000000000b1','e2e00000-0000-4000-8000-00000000000b','E2E-B1',1,'libre',true,true)
on conflict (id) do nothing;

-- Ventas de ejemplo (numero 9001+ para no chocar con las existentes). Cocina y pago separados.
insert into ventas (id, numero, mesa, mesero, personas, metodo_pago, total, items, estado, estado_pago, pagado_at, empresa_id, tipo_servicio) values
 ('e2e50000-0000-4000-8000-0000000000a1',9001,'E2E-A1','E2E Garzon A',2,'',5500,
   '[{"nombre":"E2E Plato común","precio_unit":4000,"cantidad":1},{"nombre":"E2E Bebida A","precio_unit":1500,"cantidad":1}]','pendiente','pendiente',null,'e2e00000-0000-4000-8000-00000000000a','mesa'),
 ('e2e50000-0000-4000-8000-0000000000a2',9002,'E2E-A2','E2E Garzon A',1,'Efectivo',4000,
   '[{"nombre":"E2E Plato común","precio_unit":4000,"cantidad":1}]','listo','pagado',now(),'e2e00000-0000-4000-8000-00000000000a','mesa'),
 ('e2e50000-0000-4000-8000-0000000000a3',9003,'E2E-A1','E2E Garzon A',1,'Cortesia',1500,
   '[{"nombre":"E2E Bebida A","precio_unit":1500,"cantidad":1}]','listo','cortesia',now(),'e2e00000-0000-4000-8000-00000000000a','mesa'),
 ('e2e50000-0000-4000-8000-0000000000b1',9101,'E2E-B1','E2E Garzon B',2,'',7000,
   '[{"nombre":"E2E Plato común","precio_unit":5000,"cantidad":1},{"nombre":"E2E Bebida B","precio_unit":2000,"cantidad":1}]','pendiente','pendiente',null,'e2e00000-0000-4000-8000-00000000000b','mesa')
on conflict (id) do nothing;

-- Aperturas de caja abiertas (para gastos y cierre). Fechas del día actual.
insert into aperturas_caja (id, fecha, monto_inicial, cajero, estado, empresa_id) values
 ('e2e60000-0000-4000-8000-0000000000a1',current_date,20000,'E2E Admin A','abierta','e2e00000-0000-4000-8000-00000000000a'),
 ('e2e60000-0000-4000-8000-0000000000b1',current_date,15000,'E2E Admin B','abierta','e2e00000-0000-4000-8000-00000000000b')
on conflict (id) do nothing;

-- Comprobación dentro de la transacción: total = suma de líneas en las 4 ventas y cero líneas con precio_unit nulo; si no, se aborta todo.
do $$ declare malas int; begin
  select count(*) into malas from ventas v where v.id::text like 'e2e50000-%'
    and (v.total <> (select coalesce(sum((l->>'cantidad')::int * (l->>'precio_unit')::int),0) from jsonb_array_elements(v.items) l)
      or exists (select 1 from jsonb_array_elements(v.items) l where l->>'precio_unit' is null));
  if malas > 0 then raise exception 'Semilla inconsistente: % ventas con total distinto de la suma de líneas', malas; end if;
end $$;

commit;

-- Cuenta Mercado Pago FICTICIA por negocio: generar con scripts/prueba-navegador/sql_mp_cuenta_ficticia.mjs (clave de prueba) para ambos uuid.
