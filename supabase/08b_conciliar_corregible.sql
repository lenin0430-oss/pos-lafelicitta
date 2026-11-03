-- 08b: permite CORREGIR la conciliación de un cobro Point mientras el turno esté abierto. Solo reemplaza la función (08 ya aplicada).
-- Mismos permisos: solo service_role. Una transacción.
begin;
-- Conciliar un cobro Point con el medio real del comprobante. Se puede CORREGIR mientras el turno siga abierto (queda en eventos con el medio anterior).
-- Un medio informado por Mercado Pago o un cobro manual no se reclasifican aquí.
create or replace function public.cobro_conciliar(p_cobro uuid, p_medio text, p_por text)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare c public.cobros_turno; t public.aperturas_caja;
begin
  if p_medio not in ('efectivo','debito','credito','qr','transferencia') then return jsonb_build_object('ok', false, 'codigo', 'medio_invalido'); end if;
  select * into c from public.cobros_turno where id = p_cobro for update;
  if not found or c.anulado_at is not null then return jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); end if;
  if c.proveedor <> 'point' then return jsonb_build_object('ok', false, 'codigo', 'no_es_point'); end if;
  if c.medio <> 'por_conciliar' and c.conciliado_at is null then return jsonb_build_object('ok', false, 'codigo', 'medio_informado_por_point'); end if;
  if c.medio = p_medio then return jsonb_build_object('ok', false, 'codigo', 'ya_conciliado'); end if;
  select * into t from public.aperturas_caja where id = c.turno_id for share;
  if t.id is null or t.estado <> 'abierta' then return jsonb_build_object('ok', false, 'codigo', 'turno_cerrado'); end if;
  if exists (select 1 from public.cobros_turno where venta_id = c.venta_id and medio = p_medio and id <> c.id and anulado_at is null) then
    return jsonb_build_object('ok', false, 'codigo', 'medio_duplicado_en_venta');
  end if;
  update public.cobros_turno set medio = p_medio, conciliado_por = p_por, conciliado_at = clock_timestamp() where id = c.id;
  insert into public.turno_eventos(empresa_id, turno_id, evento, detalle, actor)
    values (c.empresa_id, c.turno_id, case when c.medio = 'por_conciliar' then 'cobro_conciliado' else 'cobro_corregido' end,
            jsonb_build_object('cobro_id', c.id, 'venta_id', c.venta_id, 'monto', c.monto, 'medio', p_medio, 'antes', c.medio), p_por);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.cobro_conciliar(uuid,text,text) from public, anon, authenticated;
grant execute on function public.cobro_conciliar(uuid,text,text) to service_role;
commit;
