do $$ begin
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create table empresas(id uuid primary key);
create table ventas (id uuid primary key default gen_random_uuid(), numero int, mesa text, mesero text, metodo_pago text default 'Débito', total int, estado text default 'pendiente',
  created_at timestamptz default now(), empresa_id uuid, estado_pago text default 'pendiente', pagado_at timestamptz);
create table aperturas_caja (id uuid primary key default gen_random_uuid(), fecha date, monto_inicial int default 0, cajero text default 'Caja', created_at timestamptz default now(), estado text default 'abierta', cerrada_at timestamptz, empresa_id uuid);
create table cierres_caja (id uuid primary key default gen_random_uuid(), fecha date, ventas_total int, ventas_efectivo int default 0, ventas_debito int default 0, ventas_qr int default 0, ventas_transferencia int default 0, efectivo_fisico int default 0, diferencia int default 0, notas text, created_at timestamptz default now(), apertura_id uuid, empresa_id uuid);
create table gastos (id uuid primary key default gen_random_uuid(), categoria text, descripcion text, monto int, created_at timestamptz default now(), empresa_id uuid, cajero text, apertura_id uuid, afecto_caja boolean default true);
create table propinas (id uuid primary key default gen_random_uuid(), empresa_id uuid, empleado text, monto int, metodo_pago text default 'efectivo', venta_id uuid, apertura_id uuid, cajero text, notas text, created_at timestamptz default now());
create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text, mp_order_id text, monto int, estado text default 'created', created_at timestamptz default now(), updated_at timestamptz default now(), restaurante_id text);
-- datos históricos que NO deben cambiar
insert into empresas values ('aaaaaaaa-0000-4000-8000-00000000000a'),('bbbbbbbb-0000-4000-8000-00000000000b');
insert into aperturas_caja(id,fecha,monto_inicial,empresa_id,created_at) values ('11111111-0000-4000-8000-000000000001','2026-10-30',5000,'aaaaaaaa-0000-4000-8000-00000000000a','2026-10-30 15:00+00');
insert into ventas(id,numero,metodo_pago,total,estado_pago,empresa_id,created_at,pagado_at) values ('22222222-0000-4000-8000-000000000001',1,'Point',1500,'pagado','aaaaaaaa-0000-4000-8000-00000000000a','2026-10-30 16:00+00','2026-10-30 16:00+00');
