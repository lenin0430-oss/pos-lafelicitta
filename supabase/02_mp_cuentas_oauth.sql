-- Ejecutar en Supabase > SQL Editor (después de 01_tabla_pagos_point.sql)
-- Una fila por restaurante que conectó su cuenta de Mercado Pago.

create table if not exists mp_cuentas (
  restaurante_id text primary key,
  mp_user_id     text not null,
  access_token   text not null,          -- cifrado (AES-256-GCM) desde el backend
  refresh_token  text not null,          -- cifrado
  expires_at     timestamptz not null,
  terminal_id    text,                   -- Point elegido por el restaurante
  live_mode      boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists mp_cuentas_user_idx on mp_cuentas (mp_user_id);

alter table mp_cuentas enable row level security;
-- Sin políticas: solo el backend (service role) puede leer/escribir.

-- Los pagos ahora saben de qué restaurante son.
alter table pagos_point add column if not exists restaurante_id text;
create index if not exists pagos_point_rest_idx on pagos_point (restaurante_id);
