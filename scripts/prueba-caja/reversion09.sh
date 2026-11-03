#!/usr/bin/env bash
# Reversión y re-aplicación de 09: los contadores, folios y claves se restauran (B sigue en 60 → 61). Requiere PGHOST/PGPORT/PGUSER.
# Uso: bash scripts/prueba-caja/reversion09.sh   (crea y borra la base de prueba "rv09"; NUNCA contra un proyecto real)
set -u; D=$(cd "$(dirname "$0")" && pwd); S="$D/../../supabase"; DB=rv09
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null || exit 1
for f in "$D/base.sql" "$D/folios_pre.sql" "$S/08_turnos_caja.sql" "$S/09_correlativos.sql"; do psql -X -q -d $DB -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FALLA en $f"; exit 1; }; done
psql -X -d $DB -f "$D/folios.sql" 2>&1 | grep -E "FALLA"
psql -X -q -d $DB >/dev/null <<'SQL'
create table z_snap_corr as select * from correlativos;
create table z_snap_h(k text, v text);
insert into z_snap_h select 'v', md5(string_agg(id::text||coalesce(folio::text,'')||coalesce(clave_idempotencia::text,''),',' order by id)) from ventas;
insert into z_snap_h select 'a', md5(string_agg(id::text||coalesce(numero_turno::text,'')||coalesce(clave_apertura::text,''),',' order by id)) from aperturas_caja;
insert into z_snap_h select 'c', md5(string_agg(id::text||coalesce(numero_cierre::text,''),',' order by id)) from cierres_turno;
insert into z_snap_h select 'n', md5(string_agg(id::text||':'||coalesce(numero::text,''),',' order by id)) from ventas;
insert into z_snap_h select 'maxa', max(numero)::text from ventas where empresa_id='aaaaaaaa-0000-4000-8000-00000000000a';
SQL
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f "$S/09_correlativos_REVERSION.sql" >/dev/null || { echo "FALLA la reversión"; exit 1; }
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f "$S/09_correlativos.sql" >/dev/null 2>&1 || { echo "FALLA la re-aplicación"; exit 1; }
psql -X -d $DB -f "$D/folios_reversion.sql" 2>&1 | tail -12
