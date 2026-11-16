-- Reversión de 12_consumo_personal.sql. Se detiene si ya hay consumos registrados, para no perder el historial de descuentos.
begin;
do $$ begin
  if exists (select 1 from public.consumos_personal where anulado_at is null) or exists (select 1 from public.ventas where estado_pago = 'consumo_personal') then
    raise exception 'Hay consumos personales registrados: exporta public.consumos_personal antes de revertir';
  end if;
end $$;
drop trigger if exists ventas_eliminada_anula_consumo on public.ventas;
drop function if exists public.trg_consumo_venta_eliminada();
drop function if exists public.registrar_consumo_personal(uuid, uuid, text, text);
drop function if exists public.descontar_consumos_personal(uuid, uuid[], text);
drop table if exists public.consumos_personal;
alter table public.ventas drop constraint if exists ventas_estado_pago_chk;
alter table public.ventas add constraint ventas_estado_pago_chk
  check (estado_pago in ('pendiente','abonada','pagado','cortesia','sin_identificar'));
commit;
