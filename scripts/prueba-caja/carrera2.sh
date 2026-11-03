#!/usr/bin/env bash
# Carrera real (dos conexiones) entre CIERRE de turno y: comanda nueva, venta creada ya pagada, reserva de cobro Point. AMBOS órdenes.
# Requiere PGHOST/PGPORT y la base $DB con 08 aplicada. Orden 1: la operación empieza primero y espera antes de COMMIT. Orden 2: el cierre empieza primero (lento).
set -u; DB=${DB:-caja}; P="psql -X -q -A -t -d $DB"; fallos=0; n=0
nuevo(){ n=$((n+1)); E=$(printf 'f%07d-0000-4000-8000-0000000000f%d' $n $n); $P -c "insert into empresas values ('$E')" >/dev/null
  T=$($P -c "select (public.turno_abrir('$E',0,'c')->>'turno_id')"); V=$(printf 'a%07d-0000-4000-8000-0000000000a%d' $n $n); }
CIERRE="select public.turno_cerrar('$'T'','{\"efectivo\":0}'::jsonb,null,gen_random_uuid(),'c')"
cierre_sql(){ echo "select public.turno_cerrar('$T','{\"efectivo\":700}'::jsonb,null,gen_random_uuid(),'c')::text"; }
snap(){ $P -c "select estado from aperturas_caja where id='$T'"; }
chk(){ # nombre cond
  if [ "$2" = 1 ]; then echo "OK    $1"; else echo "FALLA $1"; fallos=1; fi; }

# ---- R1: comanda nueva vs cierre ----
OPSQL(){ case $1 in
  comanda) echo "insert into ventas(id,numero,mesa,total,empresa_id) values ('$V',7,'Mesa 9',1000,'$E')";;
  pagada)  echo "insert into ventas(id,numero,mesa,total,empresa_id,estado,estado_pago,metodo_pago) values ('$V',8,'Mesa 3',700,'$E','entregado','pagado','Efectivo')";;
  point)   echo "insert into pagos_point(venta_id,monto,estado,restaurante_id) values ('$V',700,'reservado','$E')";;
 esac; }
prep_venta(){ [ "$1" = point ] && $P -c "insert into ventas(id,numero,mesa,total,empresa_id,estado,estado_pago,metodo_pago,pagado_at) values ('$V',9,'Mesa 5',700,'$E','entregado','pagado','Efectivo',now())" >/dev/null; }
for K in comanda pagada point; do
 # Orden 1
 nuevo; prep_venta $K; SQL=$(OPSQL $K)
 ( $P -c "begin; $SQL; select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6
 R=$($P -c "$(cierre_sql)"); wait; est=$(snap)
 case $K in
  comanda) chk "orden1 $K: la comanda guardada primero BLOQUEA el cierre (turno sigue abierto, comanda listada)" $([ "$est" = abierta ] && echo "$R" | grep -q '"codigo": "bloqueado"' && echo "$R" | grep -q '"numero": 7' && echo 1 || echo 0);;
  pagada)  chk "orden1 $K: la venta pagada guardada primero entra en el cierre (efectivo 700)" $([ "$est" = cerrada ] && [ "$($P -c "select resumen->'cobros'->>'efectivo' from cierres_turno where turno_id='$T'")" = 700 ] && echo 1 || echo 0);;
  point)   chk "orden1 $K: la reserva Point guardada primero BLOQUEA el cierre (listada como pago en proceso)" $([ "$est" = abierta ] && echo "$R" | grep -q 'point_en_proceso' && echo 1 || echo 0);;
 esac
 # Orden 2
 nuevo; prep_venta $K; SQL=$(OPSQL $K)
 ( $P -c "begin; $(cierre_sql); select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6
 R=$($P -c "$SQL" 2>&1 | head -1); wait; est=$(snap)
 existe=$($P -c "select (select count(*) from ventas where id='$V')::text||'/'||(select count(*) from pagos_point where venta_id='$V')")
 case $K in
  comanda) chk "orden2 $K: el cierre guardado primero deja la comanda FUERA del turno cerrado; no se puede cobrar sin turno" $([ "$est" = cerrada ] && [ "${existe%%/*}" = 1 ] && [ "$($P -c "select jsonb_array_length(resumen->'bloqueos') from cierres_turno where turno_id='$T'")" = 0 ] && echo 1 || echo 0);;
  pagada)  chk "orden2 $K: venta pagada tras el cierre se rechaza (P0413) y no queda guardada" $([ "$est" = cerrada ] && echo "$R" | grep -q SIN_TURNO_ABIERTO && [ "${existe%%/*}" = 0 ] && echo 1 || echo 0);;
  point)   chk "orden2 $K: reserva Point tras el cierre se rechaza (P0413) y no se crea la reserva" $([ "$est" = cerrada ] && echo "$R" | grep -q SIN_TURNO_ABIERTO && [ "${existe##*/}" = 0 ] && echo 1 || echo 0);;
 esac
done
# ---- R4: cobro manual de una venta (UPDATE) vs cierre; la venta ya está entregada y SIN cobrar ----
nuevo; $P -c "insert into ventas(id,numero,mesa,total,empresa_id,estado) values ('$V',11,'Mesa 6',700,'$E','entregado')" >/dev/null
( $P -c "begin; update ventas set metodo_pago='Efectivo',estado_pago='pagado',pagado_at=now() where id='$V'; select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6
R=$($P -c "$(cierre_sql)"); wait
chk "orden1 cobro manual: el cobro guardado primero entra en el cierre (efectivo 700)" $([ "$(snap)" = cerrada ] && [ "$($P -c "select resumen->'cobros'->>'efectivo' from cierres_turno where turno_id='$T'")" = 700 ] && echo 1 || echo 0)
nuevo; $P -c "insert into ventas(id,numero,mesa,total,empresa_id,estado) values ('$V',12,'Mesa 6',700,'$E','entregado')" >/dev/null
( $P -c "begin; $(cierre_sql); select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6; wait
R=$($P -c "update ventas set metodo_pago='Efectivo',estado_pago='pagado' where id='$V'" 2>&1 | head -1)
chk "orden2 cobro manual: con el cierre en curso la venta sin cobrar BLOQUEA el cierre; el cobro posterior entra con turno abierto" $([ "$(snap)" = abierta ] && ! echo "$R" | grep -q SIN_TURNO && echo 1 || echo 0)
exit $fallos
