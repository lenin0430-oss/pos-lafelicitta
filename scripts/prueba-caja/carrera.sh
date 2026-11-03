#!/usr/bin/env bash
# Carrera real (dos conexiones) entre cierre de turno y DELETE/UPDATE de gasto, en AMBOS órdenes. Requiere PGHOST/PGPORT y la base $DB con 08 aplicada.
set -u; DB=${DB:-caja}; P="psql -X -q -A -t -d $DB"; A=aaaaaaaa-0000-4000-8000-0000000000c1; fallos=0
prep(){ $P -c "insert into empresas values ('$A') on conflict do nothing" >/dev/null
  T=$($P -c "select (public.turno_abrir('$A',0,'c')->>'turno_id')"); G=$($P -c "insert into gastos(categoria,descripcion,monto,empresa_id,afecto_caja) values ('x','g',500,'$A',true) returning id" | head -1); }
fin(){ $P -c "delete from gastos where empresa_id='$A'" >/dev/null 2>&1; }
mk(){ if [ $OP = delete ]; then SQL_OP="delete from gastos where id='$G'"; else SQL_OP="update gastos set monto=1 where id='$G'"; fi; }
cierre(){ $P -c "select public.turno_cerrar('$T','{\"efectivo\":0}'::jsonb,null,gen_random_uuid(),'c')->>'ok'" ; }
snap(){ $P -c "select (resumen->>'gastos_caja') from cierres_turno where turno_id='$T'"; }
for OP in delete update; do
 # Orden 1: la operación sobre el gasto empieza primero y espera antes de COMMIT; el cierre debe esperar y NO incluir un gasto que luego desaparece/cambia.
 prep; mk; ( $P -c "begin; $SQL_OP; select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6; cierre >/dev/null; wait
 s=$(snap); ex=$($P -c "select coalesce(monto::text,'borrado') from (select 1) x left join gastos on id='$G'")
 coherente=0; [ "$OP" = delete ] && [ "$s" = "0" ] && coherente=1; [ "$OP" = update ] && [ "$s" = "1" ] && coherente=1
 echo "orden1 $OP: cierre guardó gastos=$s ; gasto ahora=$ex ; $( [ $coherente = 1 ] && echo OK || echo FALLA )"; [ $coherente = 1 ] || fallos=1; fin
 # Orden 2: el cierre empieza primero (lento); la operación sobre el gasto espera y debe ser rechazada; el cierre incluye el gasto intacto.
 prep; mk; ( $P -c "begin; select public.turno_cerrar('$T','{\"efectivo\":0}'::jsonb,null,gen_random_uuid(),'c')->>'ok'; select pg_sleep(2); commit" >/dev/null 2>&1 ) & sleep 0.6
 r=$($P -c "$SQL_OP" 2>&1 | head -1); wait; s=$(snap); ex=$($P -c "select monto from gastos where id='$G'")
 ok=0; echo "$r" | grep -q TURNO_CERRADO && [ "$s" = "500" ] && [ "$ex" = "500" ] && ok=1
 echo "orden2 $OP: operación -> '$r' ; cierre guardó gastos=$s ; gasto=$ex ; $( [ $ok = 1 ] && echo OK || echo FALLA )"; [ $ok = 1 ] || fallos=1; fin
done
exit $fallos
