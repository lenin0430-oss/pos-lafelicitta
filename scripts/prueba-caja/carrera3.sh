#!/usr/bin/env bash
# Concurrencia real (muchas conexiones a la vez) de los folios internos. Requiere PGHOST/PGPORT y la base $DB con 08 + 09 aplicadas.
set -u; DB=${DB:-caja}; P="psql -X -q -A -t -d $DB"; fallos=0; n=0; TMP=$(mktemp -d)
chk(){ if [ "$2" = 1 ]; then echo "OK    $1"; else echo "FALLA $1"; fallos=1; fi; }
nuevo(){ n=$((n+1)); E=$(printf 'e%07d-0000-4000-8000-0000000000e%d' $n $n); $P -c "insert into empresas values ('$E')" >/dev/null; }

# C1: 60 comandas simultáneas desde 60 "equipos" distintos (cada conexión es un navegador nuevo, sin localStorage compartido)
nuevo; $P -c "insert into ventas(numero,mesa,total,empresa_id,estado,estado_pago) values (500,'hist',1,'$E','entregado','pagado')" >/dev/null 2>&1 || true
seq 1 60 | xargs -P 20 -I{} $P -c "insert into ventas(numero,mesa,total,empresa_id) values (7,'Mesa {}',1000,'$E')" >/dev/null 2>"$TMP/e1"
r=$($P -c "select count(*)||'/'||count(distinct folio)||'/'||min(folio)||'/'||max(folio) from ventas where empresa_id='$E' and folio is not null")
u=$($P -c "select ultimo from correlativos where empresa_id='$E' and tipo='comanda'")
IFS=/ read c d mn mx <<<"$r"
chk "C1 60 comandas simultáneas: 60 filas, 60 folios distintos, consecutivos (mín–máx = 59) y contador = máximo [$r contador=$u]" $([ "$c" = 60 ] && [ "$d" = 60 ] && [ $((mx-mn)) = 59 ] && [ "$u" = "$mx" ] && [ ! -s "$TMP/e1" ] && echo 1 || echo 0)

# C2: 20 intentos simultáneos con LA MISMA clave (doble clic / reintentos): una sola comanda, sin hueco en la numeración
nuevo; K=$(cat /proc/sys/kernel/random/uuid)
seq 1 20 | xargs -P 20 -I{} $P -c "insert into ventas(mesa,total,empresa_id,clave_idempotencia) values ('Mesa',1000,'$E','$K')" >/dev/null 2>"$TMP/e2"
filas=$($P -c "select count(*) from ventas where clave_idempotencia='$K'"); dup=$(grep -c "duplicate key" "$TMP/e2")
$P -c "insert into ventas(mesa,total,empresa_id) values ('sig',1,'$E')" >/dev/null; sig=$($P -c "select folio from ventas where empresa_id='$E' and mesa='sig'")
chk "C2 20 envíos simultáneos con la misma clave: 1 comanda, 19 rechazados (23505), la siguiente es la 2 (sin hueco) [filas=$filas rechazos=$dup sig=$sig]" $([ "$filas" = 1 ] && [ "$dup" = 19 ] && [ "$sig" = 2 ] && echo 1 || echo 0)

# C3: 20 aperturas simultáneas con claves distintas (varias cajeras/equipos): un solo turno abierto, número 1
nuevo
seq 1 20 | xargs -P 20 -I{} $P -c "select public.turno_abrir('$E',0,'Cajera',gen_random_uuid())->>'ok'" > "$TMP/o3" 2>&1
abiertos=$($P -c "select count(*) from aperturas_caja where empresa_id='$E' and estado='abierta' and modelo='v2'"); okc=$(grep -c "^true" "$TMP/o3"); ult=$($P -c "select ultimo from correlativos where empresa_id='$E' and tipo='turno'")
chk "C3 20 aperturas simultáneas: 1 turno abierto, 1 exitosa, contador 1 [abiertos=$abiertos ok=$okc contador=$ult]" $([ "$abiertos" = 1 ] && [ "$okc" = 1 ] && [ "$ult" = 1 ] && echo 1 || echo 0)

# C4: 20 aperturas simultáneas con la MISMA clave: todas devuelven el mismo turno
nuevo; K=$(cat /proc/sys/kernel/random/uuid)
seq 1 20 | xargs -P 20 -I{} $P -c "select public.turno_abrir('$E',0,'Cajera','$K')->>'turno_id'" > "$TMP/o4" 2>&1
distintos=$(sort -u "$TMP/o4" | grep -c .); filas=$($P -c "select count(*) from aperturas_caja where empresa_id='$E' and clave_apertura='$K'")
chk "C4 20 aperturas con la misma clave: todas devuelven el mismo turno; 1 sola fila [turnos distintos=$distintos filas=$filas]" $([ "$distintos" = 1 ] && [ "$filas" = 1 ] && echo 1 || echo 0)
T=$($P -c "select id from aperturas_caja where empresa_id='$E' and clave_apertura='$K'")

# C5: 20 cierres simultáneos del mismo turno con LA MISMA clave: un cierre, un número
KC=$(cat /proc/sys/kernel/random/uuid)
seq 1 20 | xargs -P 20 -I{} $P -c "select (public.turno_cerrar('$T','{\"efectivo\":0}'::jsonb,null,'$KC','c')->>'numero_cierre')" > "$TMP/o5" 2>&1
nums=$(sort -u "$TMP/o5" | grep -c .); filas=$($P -c "select count(*) from cierres_turno where turno_id='$T'"); ult=$($P -c "select ultimo from correlativos where empresa_id='$E' and tipo='cierre'")
chk "C5 20 cierres simultáneos con la misma clave: 1 cierre, todos ven el número 1, contador 1 [numeros=$nums filas=$filas contador=$ult]" $([ "$nums" = 1 ] && [ "$filas" = 1 ] && [ "$ult" = 1 ] && [ "$(sort -u "$TMP/o5")" = 1 ] && echo 1 || echo 0)

# C6: 20 cierres simultáneos con claves DISTINTAS: uno solo cierra, el resto ya_cerrado, un solo número
nuevo; T=$($P -c "select (public.turno_abrir('$E',0,'Cajera')->>'turno_id')")
seq 1 20 | xargs -P 20 -I{} $P -c "select (public.turno_cerrar('$T','{\"efectivo\":0}'::jsonb,null,gen_random_uuid(),'c')->>'ok')" > "$TMP/o6" 2>&1
filas=$($P -c "select count(*) from cierres_turno where turno_id='$T'"); ult=$($P -c "select ultimo from correlativos where empresa_id='$E' and tipo='cierre'"); oks=$(grep -c "^true" "$TMP/o6")
chk "C6 20 cierres con claves distintas: 1 exitoso, 1 cierre y 1 número [ok=$oks filas=$filas contador=$ult]" $([ "$filas" = 1 ] && [ "$ult" = 1 ] && [ "$oks" = 1 ] && echo 1 || echo 0)

# C7: comandas entrando mientras otros equipos abren/cierran turnos: sin duplicados ni huecos
nuevo
( seq 1 40 | xargs -P 10 -I{} $P -c "insert into ventas(mesa,total,empresa_id,estado,estado_pago,metodo_pago) values ('Mesa {}',1000,'$E','entregado','pagado','Efectivo')" >/dev/null 2>"$TMP/e7" ) &
for i in 1 2 3 4 5 6; do $P -c "select public.turno_abrir('$E',0,'Cajera',gen_random_uuid())->>'ok'" >/dev/null 2>&1; sleep 0.05; $P -c "select public.turno_cerrar((select id from aperturas_caja where empresa_id='$E' and estado='abierta' limit 1),'{\"efectivo\":0}'::jsonb,null,gen_random_uuid(),'c')->>'ok'" >/dev/null 2>&1; done; wait
r=$($P -c "select count(*)||'/'||count(distinct folio)||'/'||min(folio)||'/'||max(folio) from ventas where empresa_id='$E'")
IFS=/ read c d mn mx <<<"$r"
t=$($P -c "select count(*)||'/'||count(distinct numero_turno) from aperturas_caja where empresa_id='$E' and modelo='v2'"); IFS=/ read tc td <<<"$t"
ci=$($P -c "select count(*)||'/'||count(distinct numero_cierre)||'/'||coalesce(max(numero_cierre),0) from cierres_turno where empresa_id='$E'"); IFS=/ read cc cd cm <<<"$ci"
echo "      (C7: comandas $c únicas $d; turnos $tc/$td; cierres $cc/$cd máx $cm; errores de comanda: $(wc -l < "$TMP/e7"))"
chk "C7 mezcla de comandas, aperturas y cierres simultáneos: folios únicos, consecutivos y sin huecos" $([ "$c" = "$d" ] && [ $((mx-mn+1)) = "$c" ] && [ "$tc" = "$td" ] && [ "$cc" = "$cd" ] && [ "$cm" = "$cc" ] && echo 1 || echo 0)
rm -rf "$TMP"; exit $fallos
