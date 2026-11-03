#!/usr/bin/env bash
# Prueba de concurrencia de 04/04b con DOS conexiones psql independientes a un PostgreSQL REAL y LOCAL (nunca remoto).
# Uso: PGHOST=<socket> PGPORT=<puerto> SQLDIR=<carpeta supabase> bash tests/concurrencia_04b.sh
set -u
export PGOPTIONS="-c client_min_messages=warning"; SQLDIR=${SQLDIR:-supabase}; P="psql -X -q -A -t -v ON_ERROR_STOP=0"; A=aaaaaaaa-0000-0000-0000-00000000000a; B=bbbbbbbb-0000-0000-0000-00000000000b
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "RECHAZADO: solo se ejecuta contra un PostgreSQL local (PGHOST socket/localhost)"; exit 2;; esac
fallos=0; ok(){ echo "  OK   $1"; }; ko(){ echo "  FALLA $1"; fallos=$((fallos+1)); }
nueva(){ # $1 nombre; $2 = con04b|sin04b
  $P -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null
  $P -d $1 >/dev/null <<SQL
create table ventas (id uuid primary key default gen_random_uuid(), numero int not null, mesa text not null, metodo_pago text default 'Débito', total int not null, estado text default 'pendiente', created_at timestamptz default now(), empresa_id uuid);
create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text not null, mp_order_id text unique, monto int not null, estado text not null default 'created', created_at timestamptz default now(), updated_at timestamptz default now(), restaurante_id text);
insert into ventas (id,numero,mesa,total,empresa_id) values ('11111111-1111-1111-1111-111111111111',1,'A1',5000,'$A'),('22222222-2222-2222-2222-222222222222',2,'B1',6000,'$B'),('33333333-3333-3333-3333-333333333333',3,'A2',4000,'$A');
SQL
  $P -d $1 -f $SQLDIR/03_estados_separados.sql >/dev/null; $P -d $1 -f $SQLDIR/04_pagos_point_reserva.sql >/dev/null
  [ "$2" = con04b ] && $P -d $1 -f $SQLDIR/04b_pagos_point_aislamiento.sql >/dev/null
  return 0; }
V1=11111111-1111-1111-1111-111111111111; V2=22222222-2222-2222-2222-222222222222; V3=33333333-3333-3333-3333-333333333333
q(){ $P -d "$1" -c "$2"; }

echo "C1  dos reservas simultáneas de la MISMA venta (04): una gana, la otra recibe 23505"
nueva c1 con04b
( $P -d c1 <<SQL > /tmp/c1_s1.out 2>&1
begin; insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado'); select pg_sleep(1.5); commit;
SQL
) & ( sleep 0.4; $P -d c1 <<SQL > /tmp/c1_s2.out 2>&1
insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado');
SQL
) & wait
n=$(q c1 "select count(*) from pagos_point where estado in ('reservado','created','at_terminal')")
[ "$n" = 1 ] && ok "queda 1 intento activo" || ko "intentos activos=$n"
grep -q "23505\|pagos_point_un_intento_activo" /tmp/c1_s2.out && ok "la segunda conexión fue rechazada por el índice único" || { ko "la segunda no fue rechazada"; cat /tmp/c1_s2.out; }

echo "C2  una conexión crea el cobro A sobre la venta; otra intenta CAMBIAR la empresa de esa venta a B en paralelo (con 04b)"
nueva c2 con04b
( $P -d c2 <<SQL > /tmp/c2_s1.out 2>&1
begin; insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado'); select pg_sleep(2); commit;
SQL
) & ( sleep 0.5; t0=$(date +%s.%N); $P -d c2 -c "update ventas set empresa_id='$B' where id='$V1'" > /tmp/c2_s2.out 2>&1; t1=$(date +%s.%N); echo "$t0 $t1" > /tmp/c2_t ) & wait
read t0 t1 < /tmp/c2_t; esp=$(echo "$t1 - $t0" | bc)
[ "$(echo "$esp > 1.2" | bc)" = 1 ] && ok "la segunda conexión ESPERÓ el bloqueo de la primera (${esp}s)" || ko "no esperó (${esp}s)"
grep -q "tiene cobros Point" /tmp/c2_s2.out && ok "el cambio de empresa fue rechazado una vez confirmado el cobro" || { ko "no fue rechazado"; cat /tmp/c2_s2.out; }
inc=$(q c2 "select count(*) from pagos_point p join ventas v on v.id::text=p.venta_id where v.empresa_id::text<>p.restaurante_id")
[ "$inc" = 0 ] && ok "0 cobros incompatibles al final" || ko "incompatibles=$inc"

echo "C3  orden inverso: una conexión cambia la empresa de la venta a B (sin confirmar); otra intenta cobrar como A"
nueva c3 con04b
( $P -d c3 <<SQL > /tmp/c3_s1.out 2>&1
begin; update ventas set empresa_id='$B' where id='$V1'; select pg_sleep(2); commit;
SQL
) & ( sleep 0.5; t0=$(date +%s.%N); $P -d c3 -c "insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado')" > /tmp/c3_s2.out 2>&1; t1=$(date +%s.%N); echo "$t0 $t1" > /tmp/c3_t ) & wait
read t0 t1 < /tmp/c3_t; esp=$(echo "$t1 - $t0" | bc)
[ "$(echo "$esp > 1.2" | bc)" = 1 ] && ok "el cobro ESPERÓ el cambio pendiente (${esp}s)" || ko "no esperó (${esp}s)"
grep -q "no pertenece al negocio" /tmp/c3_s2.out && ok "el cobro fue rechazado (la venta ya es de B)" || { ko "no fue rechazado"; cat /tmp/c3_s2.out; }
[ "$(q c3 "select count(*) from pagos_point")" = 0 ] && ok "no quedó ningún cobro" || ko "quedó un cobro"

echo "C4  CONTROL sin 04b: el mismo cruce SÍ deja un cobro de A sobre una venta de B (demuestra que la carrera es real)"
nueva c4 sin04b
( $P -d c4 <<SQL > /tmp/c4_s1.out 2>&1
begin; insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado'); select pg_sleep(1.5); commit;
SQL
) & ( sleep 0.5; $P -d c4 -c "update ventas set empresa_id='$B' where id='$V1'" > /tmp/c4_s2.out 2>&1 ) & wait
inc=$(q c4 "select count(*) from pagos_point p join ventas v on v.id::text=p.venta_id where v.empresa_id::text<>p.restaurante_id")
[ "$inc" = 1 ] && ok "sin 04b queda 1 cobro incompatible (esperado en el control)" || ko "el control no reprodujo la carrera (incompatibles=$inc)"

echo "C5  A y B cobran a la vez: A su venta, B la venta de A"
nueva c5 con04b
( $P -d c5 -c "insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V1',5000,'reservado')" > /tmp/c5_a.out 2>&1 ) & ( $P -d c5 -c "insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$B','$V1',5000,'reservado')" > /tmp/c5_b.out 2>&1 ) & wait
[ "$(q c5 "select string_agg(restaurante_id,',') from pagos_point")" = "$A" ] && ok "solo quedó el cobro de A" || ko "contenido inesperado"
grep -q "no pertenece" /tmp/c5_b.out && ok "el de B fue rechazado" || ko "el de B no fue rechazado"

echo "C6  10 conexiones × 10 intentos (5 de A sobre su venta y 5 de B sobre la venta de A, cada una): ninguna cruza negocios"
nueva c6 con04b
for i in $(seq 1 10); do ( for j in 1 2 3 4 5; do $P -d c6 -c "insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$B','$V3',1,'failed')" >/dev/null 2>&1; $P -d c6 -c "insert into pagos_point (restaurante_id,venta_id,monto,estado) values ('$A','$V3',1,'failed')" >/dev/null 2>&1; done ) & done; wait
inc=$(q c6 "select count(*) from pagos_point p join ventas v on v.id::text=p.venta_id where v.empresa_id::text<>p.restaurante_id")
tot=$(q c6 "select count(*) from pagos_point")
[ "$inc" = 0 ] && [ "$tot" = 50 ] && ok "50 cobros de A aceptados, 0 de B, 0 incompatibles" || ko "incompatibles=$inc total=$tot"
echo; [ $fallos = 0 ] && echo "RESULTADO: TODO OK" || echo "RESULTADO: $fallos fallo(s)"; exit $fallos
