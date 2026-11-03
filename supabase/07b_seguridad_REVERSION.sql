-- Reversión de 07b: elimina SOLO lo que 07b creó. La columna usuarios.pin_hash se conserva si tiene datos (no se pierde información).
begin;
drop function if exists public.registrar_fallo_login(text, integer, integer, integer), public.login_bloqueado_hasta(text), public.limpiar_intentos_login(text),
  public.consumir_aprobacion(text, text, text, text, bigint, text);
drop table if exists public.aprobaciones_operacion, public.intentos_login, public.eventos_seguridad;
do $$ begin
  if to_regclass('public.usuarios') is not null and not exists (select 1 from public.usuarios where pin_hash is not null) then
    alter table public.usuarios drop column if exists pin_hash;
  end if;
end $$;
commit;
