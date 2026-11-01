-- Ejecutar en Supabase > SQL Editor
create table if not exists pagos_point (
  id uuid primary key default gen_random_uuid(),
  venta_id text not null,
  mp_order_id text unique,
  monto integer not null,
  estado text not null default 'created',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists pagos_point_venta_idx on pagos_point (venta_id);

alter table pagos_point enable row level security;
-- Solo el backend (service role) escribe/lee esta tabla.
