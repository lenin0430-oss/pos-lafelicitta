-- MesaPOS · verificación SOLO LECTURA de 04b: lista cobros Point cuya venta no es del mismo negocio. No corrige nada.
select p.id, p.venta_id, p.restaurante_id, p.estado, p.monto, p.mp_order_id, v.empresa_id::text as empresa_de_la_venta,
       case when v.id is null then 'venta_inexistente'
            when p.restaurante_id is null then 'cobro_sin_negocio'
            when v.empresa_id is null then 'venta_sin_empresa'
            else 'empresa_distinta' end as motivo
  from pagos_point p left join ventas v on v.id::text = p.venta_id
 where v.id is null or p.restaurante_id is null or v.empresa_id is null or v.empresa_id::text <> p.restaurante_id::text
 order by p.created_at;
