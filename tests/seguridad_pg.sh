#!/usr/bin/env bash
# Prueba de supabase/07b con roles reales en PostgreSQL LOCAL. Datos ficticios.
set -u
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "RECHAZADO: solo contra PostgreSQL local"; exit 2;; esac
export PGOPTIONS="-c client_min_messages=warning"; P="psql -X -q -A -t -v ON_ERROR_STOP=0"; D=${SQLDIR:-supabase}; DB=seg_$$
fallos=0; ok(){ echo "  OK   $1"; }; ko(){ echo "  FALLA $1"; fallos=$((fallos+1)); }
chk(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 (esperado '$3', obtenido '$2')"; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
for r in anon authenticated service_role; do $P -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin $( [ $r = service_role ] && echo bypassrls ); end if; end \$\$" >/dev/null; done
$P -d $DB >/dev/null <<SQL
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table usuarios (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, email text, pin text, rol text);
insert into usuarios (empresa_id,nombre,pin,rol) values (gen_random_uuid(),'Ana','1234','admin');
SQL
S(){ psql -X -A -t -d $DB -c "set role service_role; $1" 2>&1 | tail -1; }
A(){ psql -X -A -t -d $DB -c "set role $1; $2" 2>&1 | tr '\n' ' ' | cut -c1-160; }
echo "== aplicar 07b (y dos veces: idempotente)"
$P -d $DB -f $D/07b_seguridad_aprobaciones_y_login.sql >/dev/null 2>&1; $P -d $DB -f $D/07b_seguridad_aprobaciones_y_login.sql 2>&1 | grep -i error && ko "07b no es idempotente" || ok "07b se aplica dos veces sin error"
chk "usuarios.pin_hash existe y está vacía" "$($P -d $DB -c "select count(*) from usuarios where pin_hash is not null")" 0
chk "el PIN existente no cambió" "$($P -d $DB -c "select pin from usuarios")" 1234
echo "== acceso cerrado"
for t in aprobaciones_operacion intentos_login eventos_seguridad; do for r in anon authenticated; do
  A $r "select count(*) from $t" | grep -qi "permission denied" && ok "$r no lee $t" || ko "$r lee $t"; done; done
for f in "registrar_fallo_login('x',3,60,60)" "login_bloqueado_hasta('x')" "limpiar_intentos_login('x')" "consumir_aprobacion('a','b','c','d',1,'e')"; do for r in anon authenticated; do
  A $r "select public.$f" | grep -qi "permission denied" && ok "$r no ejecuta ${f%%(*}" || ko "$r ejecuta ${f%%(*}"; done; done
echo "== límite de intentos (3 fallos, ventana 60 s, bloqueo 60 s)"
chk "fallo 1 no bloquea" "$(S "select registrar_fallo_login('ip:t',3,60,60) is null")" t
chk "fallo 2 no bloquea" "$(S "select registrar_fallo_login('ip:t',3,60,60) is null")" t
chk "fallo 3 bloquea" "$(S "select registrar_fallo_login('ip:t',3,60,60) is not null")" t
chk "login_bloqueado_hasta informa el bloqueo" "$(S "select login_bloqueado_hasta('ip:t') is not null")" t
chk "otra clave no está bloqueada" "$(S "select login_bloqueado_hasta('ip:otra') is null")" t
S "update intentos_login set bloqueado_hasta = now() - interval '1 second' where clave='ip:t'" >/dev/null
chk "el bloqueo vence" "$(S "select login_bloqueado_hasta('ip:t') is null")" t
for i in 1 2 3; do S "select registrar_fallo_login('ip:t',3,60,60)" >/dev/null; done
chk "segundo bloqueo dura el doble (>=100 s)" "$(S "select extract(epoch from (bloqueado_hasta - now())) >= 100 from intentos_login where clave='ip:t'")" t
S "select limpiar_intentos_login('ip:t')" >/dev/null; chk "éxito limpia el contador de la cuenta" "$(S "select count(*) from intentos_login where clave='ip:t'")" 0
echo "== concurrencia: 20 fallos simultáneos cuentan 20 (sin pérdidas)"
for i in $(seq 1 20); do ( psql -X -q -A -t -d $DB -c "set role service_role; select registrar_fallo_login('ip:c',1000,60,60)" >/dev/null 2>&1 ) & done; wait
chk "20 fallos concurrentes = n 20" "$(S "select n from intentos_login where clave='ip:c'")" 20
echo "== aprobación de un solo uso"
S "insert into aprobaciones_operacion (token_hash,empresa_id,tipo,actor,aprobador,monto,huella,expira_en) values ('h1','e1','gasto','Gaston','Ana',100000,'hu',now()+interval '5 min'),('h2','e1','gasto','Gaston','Ana',100000,'hu',now()-interval '1 min')" >/dev/null
chk "otro importe no consume" "$(S "select consumir_aprobacion('h1','e1','gasto','Gaston',99999,'hu')")" f
chk "otro empleado no consume" "$(S "select consumir_aprobacion('h1','e1','gasto','Pedro',100000,'hu')")" f
chk "otro negocio no consume" "$(S "select consumir_aprobacion('h1','e2','gasto','Gaston',100000,'hu')")" f
chk "otra operación (huella) no consume" "$(S "select consumir_aprobacion('h1','e1','gasto','Gaston',100000,'otra')")" f
chk "vencida no consume" "$(S "select consumir_aprobacion('h2','e1','gasto','Gaston',100000,'hu')")" f
chk "coincidente SÍ consume (control positivo)" "$(S "select consumir_aprobacion('h1','e1','gasto','Gaston',100000,'hu')")" t
chk "segundo uso NO consume" "$(S "select consumir_aprobacion('h1','e1','gasto','Gaston',100000,'hu')")" f
S "insert into aprobaciones_operacion (token_hash,empresa_id,tipo,actor,aprobador,monto,huella,expira_en) values ('h3','e1','gasto','G','Ana',5,'hu',now()+interval '5 min')" >/dev/null
for i in 1 2 3 4 5 6; do ( psql -X -q -A -t -d $DB -c "set role service_role; select consumir_aprobacion('h3','e1','gasto','G',5,'hu')" 2>&1 | tail -1 >> /tmp/seg_c_$$ ) & done; wait
chk "6 usos simultáneos: exactamente 1 gana" "$(grep -c '^t$' /tmp/seg_c_$$)" 1; rm -f /tmp/seg_c_$$
echo "== reversión"
$P -d $DB -f $D/07b_seguridad_REVERSION.sql 2>&1 | grep -i error && ko "reversión con error"
chk "reversión quita las tablas" "$($P -d $DB -c "select count(*) from pg_tables where tablename in ('aprobaciones_operacion','intentos_login','eventos_seguridad')")" 0
chk "reversión quita pin_hash (vacía)" "$($P -d $DB -c "select count(*) from information_schema.columns where table_name='usuarios' and column_name='pin_hash'")" 0
chk "reversión conserva el PIN y el usuario" "$($P -d $DB -c "select pin from usuarios")" 1234
$P -d postgres -c "drop database $DB" >/dev/null
echo; [ $fallos -eq 0 ] && echo "RESULTADO: TODO OK" || echo "RESULTADO: $fallos FALLA(S)"; exit $fallos
