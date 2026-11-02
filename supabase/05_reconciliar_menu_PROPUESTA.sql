-- MesaPOS · 05 — Reconciliación de menú acordada en el chat. PROPUESTA: NO APLICAR sin aprobación. Fuente única: docs/reconciliacion-menu/operaciones.json
-- Cada UPDATE está protegido por el precio actual esperado: si alguien cambió el precio, esa fila NO se toca y el bloque aborta (todo o nada).
-- Nunca se borran filas: lo retirado se desactiva (activo=false, disponible=false) y ventas.items conserva los nombres/precios históricos.
begin;
do $$ declare n int; begin
  -- Almuerzos · Chop suey: 6990 → 6500
  update productos set precio=6500 where id='29d4c257-52b1-4a8c-9cfe-1fb2d0f61054' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=6990;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Chop suey'; end if;
  -- Almuerzos · Chuleta vetada: 4000 → 4500
  update productos set precio=4500 where id='9783702e-209e-49fe-af11-57fe3d28dc96' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Chuleta vetada'; end if;
  -- Almuerzos · Pechuga a la plancha: 4000 → 4500
  update productos set precio=4500 where id='dfaf3872-c736-4e25-955e-269ab6b1fbb4' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Pechuga a la plancha'; end if;
  -- Almuerzos · Pollo agridulce: 6990 → 7500
  update productos set precio=7500 where id='e47d901b-215d-4687-9ab3-06692165f324' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=6990;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Pollo agridulce'; end if;
  -- Almuerzos · Pollo estofado: 4000 → 4500
  update productos set precio=4500 where id='2338b745-2279-4d78-8fef-d7ec99ba59c6' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Pollo estofado'; end if;
  -- Arroz chino · Arroz Salteado: 4500 → 6500
  update productos set precio=6500 where id='198b2dc6-e7a0-40dd-8ea5-ef9641033e32' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Arroz Salteado'; end if;
  -- Cachapas · Cochino + Queso: 10000 → 12000
  update productos set precio=12000 where id='3b953208-7299-41fe-bb5a-b701008c70a2' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=10000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Cochino + Queso'; end if;
  -- Cachapas · Cochino Frito: 8500 → 9500
  update productos set precio=9500 where id='f6490e96-5670-44b4-9545-90d72c7884d0' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=8500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Cochino Frito'; end if;
  -- Cachapas · Queso de Mano: 7500 → 8500
  update productos set precio=8500 where id='ca25e4d5-b345-45b9-a63a-980a5df893f8' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=7500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Queso de Mano'; end if;
  -- Combos a la Brasa · 1 Pollo solo: 12000 → 13000
  update productos set precio=13000 where id='278694d3-09e4-4274-8b77-95dddc9b58b7' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=12000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: 1 Pollo solo'; end if;
  -- Combos a la Brasa · ½ Pollo solo: 6000 → 6500
  update productos set precio=6500 where id='e5d36854-785c-4c36-b735-b3681cb9dda1' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=6000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: ½ Pollo solo'; end if;
  -- Combos a la Brasa · ¼ Pollo solo: 3000 → 3500
  update productos set precio=3500 where id='17837d01-3a95-429b-b348-73fc4691d2f4' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: ¼ Pollo solo'; end if;
  -- Empanadas · Molida: 2500 → 3000
  update productos set precio=3000 where id='97928b15-113f-431e-b4de-da1be60d7052' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=2500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Molida'; end if;
  -- Empanadas · Pabellón: 3000 → 3500
  update productos set precio=3500 where id='a1a2eeaf-8c1f-437c-ba1d-47cea7a0d01f' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Pabellón'; end if;
  -- Papas · Bacon & Cheddar: 5500 → 6500
  update productos set precio=6500 where id='6d292e6b-9dca-4c28-8c22-baf5698eb8d3' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=5500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Bacon & Cheddar'; end if;
  -- Papas · Nuggets 12 u.: 7500 → 8500
  update productos set precio=8500 where id='8e8c1f1d-15c1-414b-b1a2-80ddb72a043c' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=7500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Nuggets 12 u.'; end if;
  -- Papas · Nuggets 6 u.: 4000 → 4500
  update productos set precio=4500 where id='3d2de1a6-5636-4896-bce6-52981c59bbbf' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Nuggets 6 u.'; end if;
  -- Papas · Papas Normal: 3500 → 3900
  update productos set precio=3900 where id='8448a7cb-2f35-4e36-bebf-f577076579a4' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Papas Normal'; end if;
  -- Papas · Papas XL: 6500 → 7500
  update productos set precio=7500 where id='fc41a41b-bfd8-45da-88c9-bbdbd4a0f184' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=6500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Papas XL'; end if;
  -- Papas · Salchipapas Normal: 4500 → 5500
  update productos set precio=5500 where id='4ce5ea64-e97e-4702-a18a-e0b7224a72cd' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=4500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Salchipapas Normal'; end if;
  -- Papas · Salchipapas XL: 7990 → 9990
  update productos set precio=9990 where id='aaf691f4-8685-42cf-893b-c8f2f0723184' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=7990;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Salchipapas XL'; end if;
  -- Perros · El Americano: 3990 → 4500
  update productos set precio=4500 where id='5a50ccc5-6fac-4585-914d-f6fb9d388552' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3990;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: El Americano'; end if;
  -- Perros · El Peluo: 3990 → 4500
  update productos set precio=4500 where id='c65c8bc2-a491-4ba5-a277-e9df9a8519c4' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3990;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: El Peluo'; end if;
  -- Perros · El Perripollo: 3500 → 4500
  update productos set precio=4500 where id='6652e6fe-1da6-4c97-b357-58fab42455fc' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3500;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: El Perripollo'; end if;
  -- Tequeños · Tequeños 8cm — 12 unidades: 5800 → 6800
  update productos set precio=6800 where id='dc087307-7942-4ca1-8564-edef27c0ef46' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=5800;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Tequeños 8cm — 12 unidades'; end if;
  -- Tequeños · Tequeños 8cm — 4 unidades: 2000 → 2500
  update productos set precio=2500 where id='c5d867cd-8fa7-4415-aaa0-969ad60aaef2' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=2000;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Tequeños 8cm — 4 unidades'; end if;
  -- Tequeños · Tequeños 8cm — 8 unidades: 3900 → 4800
  update productos set precio=4800 where id='a15481b3-401f-488e-bc47-e20dc9847adf' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and precio=3900;
  get diagnostics n = row_count; if n<>1 then raise exception 'precio no coincide: Tequeños 8cm — 8 unidades'; end if;
  -- Desactivar Almuerzos · Pollo al horno
  update productos set activo=false, disponible=false where id='20587711-d391-42e5-9ccb-d9ca0491b9a6' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and activo=true;
  get diagnostics n = row_count; if n<>1 then raise exception 'no activo: Pollo al horno'; end if;
  -- Desactivar Empanadas · Perico Queso Llanero
  update productos set activo=false, disponible=false where id='d5c82b31-bcfe-45ef-8bf6-33a5b00afa50' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and activo=true;
  get diagnostics n = row_count; if n<>1 then raise exception 'no activo: Perico Queso Llanero'; end if;
  -- Desactivar Promos · 12 Tequeños de Queso + Salsas
  update productos set activo=false, disponible=false where id='f4c3511d-258a-4729-aa1d-3d032d8a6d92' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and activo=true;
  get diagnostics n = row_count; if n<>1 then raise exception 'no activo: 12 Tequeños de Queso + Salsas'; end if;
  -- Desactivar Promos · 4 Tequeños + Bebida
  update productos set activo=false, disponible=false where id='40c4750e-764b-485f-8a27-9af85abd48b2' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and activo=true;
  get diagnostics n = row_count; if n<>1 then raise exception 'no activo: 4 Tequeños + Bebida'; end if;
  -- Desactivar Promos · Combo Pareja
  update productos set activo=false, disponible=false where id='bca9416e-41ae-4498-939e-b2c9aec60f0b' and empresa_id='382de687-99e1-4303-bbac-783561f663f0' and activo=true;
  get diagnostics n = row_count; if n<>1 then raise exception 'no activo: Combo Pareja'; end if;
  -- Crear Almuerzos · Pollo broaster $5000
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','ceecb798-8a1c-49b9-8d37-8c39ff7d9c52','Pollo broaster',5000,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='ceecb798-8a1c-49b9-8d37-8c39ff7d9c52' and nombre='Pollo broaster');
  -- Crear Extras · Salsa extra: Mayo ajo $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Mayo ajo',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Mayo ajo');
  -- Crear Extras · Salsa extra: Cheddar $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Cheddar',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Cheddar');
  -- Crear Extras · Salsa extra: Maíz $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Maíz',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Maíz');
  -- Crear Extras · Salsa extra: Tocineta $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Tocineta',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Tocineta');
  -- Crear Extras · Salsa extra: Picante $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Picante',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Picante');
  -- Crear Extras · Salsa extra: Barbecue $500
  insert into productos (empresa_id,categoria_id,nombre,precio,disponible,activo)
  select '382de687-99e1-4303-bbac-783561f663f0','906402aa-5259-4cb9-9ebb-357dbc2bcc48','Salsa extra: Barbecue',500,true,true
  where not exists (select 1 from productos where empresa_id='382de687-99e1-4303-bbac-783561f663f0' and categoria_id='906402aa-5259-4cb9-9ebb-357dbc2bcc48' and nombre='Salsa extra: Barbecue');
end $$;
commit;
