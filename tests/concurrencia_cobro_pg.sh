#!/usr/bin/env bash
# Concurrencia cobro manual / edición de comanda / reserva Point con DOS conexiones reales a PostgreSQL LOCAL (07c + 04 + 04b). Datos ficticios.
set -u
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "RECHAZADO: solo contra PostgreSQL local"; exit 2;; esac
export PGOPTIONS="-c client_min_messages=warning"; D=${SQLDIR:-supabase}; D04=${SQL04DIR:-$D};   # 04 y 04b viven en la rama de preparación (SQL04DIR=<su carpeta supabase>)
 DB=conc_$$; P="psql -X -q -A -t -v ON_ERROR_STOP=0"
fallos=0; ok(){ echo "  OK   $1"; }; ko(){ echo "  FALLA $1"; fallos=$((fallos+1)); }
chk(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 (esperado '$3', obtenido '$2')"; fi; }
E=aaaaaaaa-0000-0000-0000-00000000000a; V=11111111-1111-1111-1111-111111111111
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
nueva(){ $P -d $DB >/dev/null <<SQL
drop table if exists pagos_point, ventas cascade;
create table ventas (id uuid primary key, empresa_id uuid, total integer, metodo_pago text default '', estado text default 'pendiente', items jsonb default '[]', mesa text, mesero text, personas int);
create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text not null, restaurante_id text, monto int default 1, estado text default 'reservado', mp_order_id text unique);
insert into ventas (id,empresa_id,total,items,mesa) values ('$V','$E',10000,'[{"nombre":"H","cantidad":2,"precio_unit":5000}]','M1');
SQL
}
cargar(){ for f in "$@"; do d=$D; case $f in 04*) d=$D04;; esac; $P -d $DB -f $d/$f >/dev/null 2>/tmp/err_$$; [ -s /tmp/err_$$ ] && { echo "error cargando $f:"; cat /tmp/err_$$; }; done; rm -f /tmp/err_$$; }
S(){ $P -d $DB -c "$1" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
estado(){ echo "$(S "select coalesce(nullif(metodo_pago,''),'∅')||'/'||(select count(*) from pagos_point where lower(estado) not in ('canceled','failed','expired'))::text from ventas where id='$V'")"; }

echo "== CONTROL: el diseño anterior (leer Point, luego escribir) SÍ deja un cobro manual y uno Point juntos"
nueva
( $P -d $DB -c "select 1 from pagos_point where venta_id='$V'" >/dev/null; sleep 1.2; $P -d $DB -c "update ventas set metodo_pago='Efectivo', estado='listo' where id='$V' and metodo_pago=''" >/dev/null ) &
( sleep 0.5; $P -d $DB -c "insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','created')" >/dev/null ) & wait
chk "sin 07c: queda Efectivo Y un Point activo (la vulnerabilidad se reproduce)" "$(estado)" "Efectivo/1"

echo "== con 07c + 04 + 04b"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
chk "las tres migraciones se cargan y 07c es idempotente" "$($P -d $DB -f $D/07c_cobro_manual_atomico.sql 2>&1 | grep -ci error)" 0

echo "-- A) gana la RESERVA Point (transacción abierta 1,5 s); el cobro manual espera y responde point_en_curso"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
( $P -d $DB -c "begin; insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','reservado'); select pg_sleep(1.5); commit" >/dev/null ) &
( sleep 0.5; echo "$($P -d $DB -c "select cobrar_venta_manual('$E','$V','Efectivo')")" > /tmp/r_$$ ) & wait
chk "cobro manual → point_en_curso" "$(cat /tmp/r_$$)" point_en_curso; chk "estado final: venta sin cobrar, 1 reserva" "$(estado)" "∅/1"

echo "-- B) gana el COBRO MANUAL (transacción abierta 1,5 s); la reserva Point espera y se rechaza"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
( $P -d $DB -c "begin; select cobrar_venta_manual('$E','$V','Efectivo'); select pg_sleep(1.5); commit" >/dev/null ) &
( sleep 0.5; $P -d $DB -c "insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','reservado')" 2>&1 | tr '\n' ' ' > /tmp/r_$$ ) & wait
grep -q "ya tiene medio de pago" /tmp/r_$$ && ok "reserva Point rechazada: 'La venta ya tiene medio de pago'" || ko "la reserva no fue rechazada: $(cat /tmp/r_$$)"
chk "estado final: Efectivo y 0 cobros Point" "$(estado)" "Efectivo/0"

echo "-- C) EDITAR COMANDA vs reserva Point (ambos órdenes)"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
( $P -d $DB -c "begin; insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','reservado'); select pg_sleep(1.5); commit" >/dev/null ) &
( sleep 0.5; echo "$($P -d $DB -c "select editar_comanda_venta('$E','$V',15000,'[{\"nombre\":\"H\",\"cantidad\":3,\"precio_unit\":5000}]'::jsonb)")" > /tmp/r_$$ ) & wait
chk "editar con Point en curso → point_en_curso" "$(cat /tmp/r_$$)" point_en_curso; chk "total intacto" "$(S "select total from ventas where id='$V'")" 10000
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
( $P -d $DB -c "begin; select editar_comanda_venta('$E','$V',15000,'[{\"nombre\":\"H\",\"cantidad\":3,\"precio_unit\":5000}]'::jsonb); select pg_sleep(1.5); commit" >/dev/null ) &
( sleep 0.5; $P -d $DB -c "insert into pagos_point (venta_id,restaurante_id,estado,monto) values ('$V','$E','reservado',10000)" >/dev/null 2>&1 ) & wait
chk "editar primero: la reserva espera y queda creada con la venta ya editada (el servidor Point lee el total nuevo antes de cobrar)" "$(S "select total||'/'||(select count(*) from pagos_point) from ventas where id='$V'")" "15000/1"

echo "-- D) dos cobros manuales simultáneos: exactamente uno gana"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql; rm -f /tmp/d_$$
for i in 1 2 3 4 5 6; do ( $P -d $DB -c "select cobrar_venta_manual('$E','$V','Efectivo')" >> /tmp/d_$$ ) & done; wait
chk "6 cobros simultáneos: 1 ok" "$(grep -c '^ok$' /tmp/d_$$)" 1; chk "los otros 5 → ya_cobrada" "$(grep -c '^ya_cobrada$' /tmp/d_$$)" 5; rm -f /tmp/d_$$

echo "-- E) 30 carreras al azar cobro manual vs reserva Point: NUNCA queda cobro manual junto a un Point activo"
malos=0
for i in $(seq 1 30); do
  nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
  ( sleep 0.0$((RANDOM%9)); $P -d $DB -c "select cobrar_venta_manual('$E','$V','Efectivo')" >/dev/null ) &
  ( sleep 0.0$((RANDOM%9)); $P -d $DB -c "insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','reservado')" >/dev/null 2>&1 ) & wait
  r=$(estado); case "$r" in Efectivo/0|∅/1) ;; *) malos=$((malos+1)); echo "   caso inválido: $r";; esac
done
chk "30 carreras sin estado incompatible" "$malos" 0

echo "-- F) reglas del cobro: mixto, otro negocio, Point cancelado no bloquea, función cerrada a anon/authenticated"
nueva; cargar 04_pagos_point_reserva.sql 04b_pagos_point_aislamiento.sql 07c_cobro_manual_atomico.sql
chk "mixto que no suma → mixto_no_suma" "$(S "select cobrar_venta_manual('$E','$V','Mixto: Efectivo \$4.000 + Débito \$5.000', 9000)")" mixto_no_suma
chk "otro negocio → no_encontrada" "$(S "select cobrar_venta_manual('bbbbbbbb-0000-0000-0000-00000000000b','$V','Efectivo')")" no_encontrada
$P -d $DB -c "insert into pagos_point (venta_id,restaurante_id,estado) values ('$V','$E','canceled')" >/dev/null
chk "Point cancelado no bloquea" "$(S "select cobrar_venta_manual('$E','$V','Efectivo')")" ok
chk "venta ya cobrada no admite edición" "$(S "select editar_comanda_venta('$E','$V',1,'[{\"nombre\":\"x\",\"cantidad\":1,\"precio_unit\":1}]'::jsonb)")" ya_cobrada
chk "edición con total que no suma → total_no_coincide" "$(S "select editar_comanda_venta('$E','$V',2,'[{\"nombre\":\"x\",\"cantidad\":1,\"precio_unit\":1}]'::jsonb)")" total_no_coincide
for r in anon authenticated service_role; do $P -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end \$\$" >/dev/null; done
$P -d $DB -c "grant usage on schema public to anon, authenticated, service_role" >/dev/null; $P -d $DB -f $D/07c_cobro_manual_atomico.sql >/dev/null 2>&1
for r in anon authenticated; do psql -X -A -t -d $DB -c "set role $r; select cobrar_venta_manual('$E','$V','Efectivo')" 2>&1 | grep -qi "permission denied" && ok "$r no ejecuta cobrar_venta_manual" || ko "$r ejecuta"; done
echo "== reversión"
$P -d $DB -f $D/07c_cobro_manual_atomico_REVERSION.sql 2>&1 | grep -i error && ko "reversión con error"
chk "reversión quita funciones y trigger" "$(S "select (select count(*) from pg_proc where proname in ('cobrar_venta_manual','editar_comanda_venta','pagos_point_bloquea_venta'))+(select count(*) from pg_trigger where tgname='pagos_point_bloquea_venta')")" 0
$P -d postgres -c "drop database $DB" >/dev/null; rm -f /tmp/r_$$
echo; [ $fallos -eq 0 ] && echo "RESULTADO: TODO OK" || echo "RESULTADO: $fallos FALLA(S)"; exit $fallos
