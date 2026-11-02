-- MesaPOS · Migración 03 — separa "preparación/entrega" (ventas.estado) del "estado financiero" (ventas.estado_pago).
-- REVISAR ANTES DE APLICAR. No aplicada en ningún entorno remoto.
-- Aditiva y compatible con el código actual: se puede aplicar ANTES de desplegar el código nuevo.
-- Orden: 1) respaldo  2) este archivo  3) desplegar código  4) (más tarde) 03b_retirar_compatibilidad.sql
-- Reversión: 03_estados_separados_REVERSION.sql
begin;

alter table ventas add column if not exists estado_pago text not null default 'pendiente';
alter table ventas add column if not exists pagado_at  timestamptz;

alter table ventas drop constraint if exists ventas_estado_pago_chk;
alter table ventas add constraint ventas_estado_pago_chk check (estado_pago in ('pendiente','pagado'));

-- Histórico: hasta hoy 'listo' significaba "cobrada" (6095 ventas listo, 2 pendiente en la lectura del 02/11/2026).
-- No se modifica ventas.estado, metodo_pago, total ni created_at. pagado_at queda NULL en el histórico (hora real desconocida).
update ventas set estado_pago = 'pagado' where estado = 'listo' and estado_pago = 'pendiente';

create index if not exists idx_ventas_empresa_pago_fecha on ventas (empresa_id, estado_pago, created_at);

-- Compatibilidad durante el despliegue: el código ANTIGUO cobra haciendo estado='listo' + metodo_pago.
-- Mientras corra, este disparador marca estado_pago='pagado' en ese caso exacto.
-- El código NUEVO no depende de él (escribe estado_pago explícitamente); cocina marcando 'listo'
-- no cambia metodo_pago, así que NO marca pagado. Se retira con 03b.
create or replace function ventas_compat_estado_pago() returns trigger language plpgsql as $$
begin
  if new.estado = 'listo'
     and coalesce(btrim(new.metodo_pago), '') <> ''
     and new.estado_pago = 'pendiente'
     and (tg_op = 'INSERT' or old.estado is distinct from 'listo') then
    new.estado_pago := 'pagado';
  end if;
  return new;
end $$;

drop trigger if exists trg_ventas_compat_estado_pago on ventas;
create trigger trg_ventas_compat_estado_pago before insert or update on ventas
  for each row execute function ventas_compat_estado_pago();

commit;
