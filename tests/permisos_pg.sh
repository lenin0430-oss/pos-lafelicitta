#!/usr/bin/env bash
# Prueba de supabase/07 con roles reales de PostgreSQL (anon, authenticated, service_role) en un PostgreSQL LOCAL. Datos ficticios.
set -u
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "RECHAZADO: solo contra PostgreSQL local"; exit 2;; esac
export PGOPTIONS="-c client_min_messages=warning"; P="psql -X -q -A -t -v ON_ERROR_STOP=0"; D=${SQLDIR:-supabase}; DB=perm_$$
fallos=0; ok(){ echo "  OK   $1"; }; ko(){ echo "  FALLA $1"; fallos=$((fallos+1)); }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
for r in anon authenticated service_role; do $P -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin $( [ $r = service_role ] && echo bypassrls ); end if; end \$\$" >/dev/null; done
A=aaaaaaaa-0000-0000-0000-00000000000a; B=bbbbbbbb-0000-0000-0000-00000000000b
$P -d $DB >/dev/null <<SQL
create schema auth; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table empresas (id uuid primary key default gen_random_uuid(), nombre text, slug text, logo_url text, ciudad text, color_primario text, activo bool default true, secreto_interno text);
create table categorias (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text);
create table productos (id uuid primary key default gen_random_uuid(), empresa_id uuid, categoria_id uuid, nombre text, precio int, disponible bool default true, activo bool default true);
create table usuarios (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, email text, pin text, rol text, activo bool default true);
create table ventas (id uuid primary key default gen_random_uuid(), numero serial, empresa_id uuid, mesa text, total int, estado text default 'pendiente', metodo_pago text, created_at timestamptz default now());
create table mesas (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text);
create table configuracion_empresa (empresa_id uuid primary key, metodos_pago text[]);
create table aperturas_caja (id uuid primary key default gen_random_uuid(), empresa_id uuid, monto int);
create table cierres_caja (id uuid primary key default gen_random_uuid(), empresa_id uuid, total int);
create table gastos (id uuid primary key default gen_random_uuid(), empresa_id uuid, monto int);
create table propinas (id uuid primary key default gen_random_uuid(), empresa_id uuid, monto int);
create table insumos (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text);
create table recetas (id uuid primary key default gen_random_uuid(), empresa_id uuid, producto_nombre text);
create table stock_insumos (id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text);
create table stock_compras (id uuid primary key default gen_random_uuid(), empresa_id uuid, monto int);
create table stock_movimientos (id uuid primary key default gen_random_uuid(), empresa_id uuid, cantidad int);
create table pedidos (id uuid primary key default gen_random_uuid(), empresa_id uuid);
create table pedido_items (id uuid primary key default gen_random_uuid(), pedido_id uuid);
create table usuarios_pos (id uuid primary key default gen_random_uuid(), empresa_id uuid);
create table mp_cuentas (restaurante_id text primary key, access_token text);
create table pagos_point (id uuid primary key default gen_random_uuid(), venta_id text, restaurante_id text, monto int, estado text);
create table respaldo_ventas_pre03 (like ventas);
create function verificar_pin_garzon(p_pin text) returns table(nombre text, rol text, empresa_id uuid) language sql security definer as \$\$ select nombre, rol, empresa_id from usuarios where pin = p_pin and rol <> 'admin' limit 1 \$\$;
create function verificar_login_admin(p_email text, p_pin text) returns table(nombre text, rol text, empresa_id uuid) language sql security definer as \$\$ select nombre, rol, empresa_id from usuarios where email = p_email and pin = p_pin and rol = 'admin' limit 1 \$\$;
-- estado "producción" observado: RLS apagada en usuarios y respaldo; allow_all en tablas privadas; lectura pública de carta; política authenticated en usuarios
alter table usuarios disable row level security; alter table respaldo_ventas_pre03 disable row level security;
do \$\$ declare t text; begin foreach t in array array['ventas','aperturas_caja','cierres_caja','gastos','recetas','stock_insumos','stock_compras','stock_movimientos'] loop
  execute format('alter table %I enable row level security', t); execute format('create policy allow_all on %I for all using (true) with check (true)', t); end loop; end \$\$;
alter table propinas enable row level security; create policy prop_sel on propinas for select using (true); create policy prop_ins on propinas for insert with check (true);
alter table productos enable row level security; create policy prod_anon on productos for select to anon using (disponible = true);
alter table categorias enable row level security; create policy cat_pub on categorias for select using (true);
alter table empresas enable row level security; create policy emp_pub on empresas for select using (true);
alter table usuarios enable row level security; alter table usuarios disable row level security; create policy usr_sel_auth on usuarios for select to authenticated using (true);
alter table mesas enable row level security; alter table configuracion_empresa enable row level security; alter table mp_cuentas enable row level security; alter table pagos_point enable row level security;
insert into empresas (id,nombre,slug,secreto_interno) values ('$A','Negocio A','a','x'),('$B','Negocio B','b','y');
insert into usuarios (id,empresa_id,nombre,email,pin,rol) values ('11111111-1111-1111-1111-111111111111','$A','Dueña A','a@x.test','1234','admin'),('22222222-2222-2222-2222-222222222222','$B','Dueño B','b@x.test','4321','admin');
insert into productos (empresa_id,nombre,precio,disponible) values ('$A','Hamburguesa',5000,true),('$A','Oculto',1,false);
insert into categorias (empresa_id,nombre) values ('$A','Fondos');
insert into ventas (empresa_id,mesa,total) values ('$A','M1',5000),('$B','M9',7000);
insert into gastos (empresa_id,monto) values ('$A',100); insert into mp_cuentas values ('$A','TEST-cifrado'); insert into pagos_point (venta_id,restaurante_id,monto,estado) values ('v','$A',1,'processed');
SQL
q(){ $P -d $DB -c "$2" 2>&1 | head -3 | tr '\n' ' '; }          # $1 rol: se pasa dentro del SQL
como(){ local rol=$1 sub=${3:-}; psql -X -A -t -v ON_ERROR_STOP=0 -d $DB -c "set role $rol; $( [ -n "$sub" ] && echo "set request.jwt.claim.sub='$sub';" ) $2" 2>&1 | tr '\n' ' ' | cut -c1-200; }
n(){ local r; r=$(psql -X -A -t -d $DB -c "set role $1; select count(*) from $2" 2>&1 | tail -1); [[ "$r" =~ ^[0-9]+$ ]] && echo "$r" || echo ERR; }
denegado(){ local r; r=$(como "$1" "$2"); echo "$r" | grep -qiE "connection to server|Connection refused" && { echo "   (sin conexión al servidor)"; return 1; }; echo "$r" | grep -qiE "permission denied|violates row-level|must be owner" && return 0; return 1; }
$P -d postgres -c "select 1" >/dev/null 2>&1 || { echo "No hay PostgreSQL local en $PGHOST:$PGPORT"; exit 3; }

foto(){ $P -d $DB -c "select md5(coalesce((select string_agg(tablename||'.'||policyname||'.'||cmd||'.'||roles::text||'.'||coalesce(qual,'')||'.'||coalesce(with_check,''), '|' order by tablename, policyname) from pg_policies where schemaname='public'),'') || '#' || coalesce((select string_agg(c.relname||':'||c.relrowsecurity::text||':'||(select string_agg(p||has_table_privilege('anon',c.oid,p)::text||has_table_privilege('authenticated',c.oid,p)::text, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p), '|' order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not in ('permisos_respaldo_07','nueva_tabla')),'') || '#' || coalesce((select string_agg(f.oid::regprocedure::text||has_function_privilege('anon',f.oid,'EXECUTE')::text||has_function_privilege('authenticated',f.oid,'EXECUTE')::text, '|' order by f.oid::regprocedure::text) from pg_proc f join pg_namespace n on n.oid=f.pronamespace where n.nspname='public' and f.prokind='f' and f.prorettype<>'trigger'::regtype),''))"; }
ANTES=$(foto)
echo "0) Control positivo: ANTES de 07 el problema existe (anon lee y escribe)"
[ "$(n anon usuarios)" = 2 ] && ok "anon lee usuarios (2 filas) — el problema reportado" || ko "no se reprodujo lectura anon de usuarios"
[ "$(n anon ventas)" = 2 ] && ok "anon lee las ventas de TODOS los negocios (2)" || ko "no se reprodujo ventas"
como anon "update ventas set total=1 where mesa='M9'" | grep -q "UPDATE 1" && ok "anon modifica ventas de otro negocio" || ko "no se reprodujo escritura"
como anon "select count(*) from verificar_pin_garzon('0000')" | grep -qv ERROR && ok "anon ejecuta verificar_pin_garzon (fuerza bruta posible)" || ko "no se reprodujo RPC"
$P -d $DB -c "update ventas set total=7000 where mesa='M9'" >/dev/null

if [ "${ETAPA:-completa}" = "07a" ]; then
echo "1) Aplicar 07a (etapa 1: usuarios + login)"
$P -d $DB -f $D/07a_cierre_usuarios_y_login.sql 2>&1 | grep -iE "error" && ko "07a falló" || ok "07a aplicada sin errores"
$P -d $DB -f $D/07a_cierre_usuarios_y_login.sql 2>&1 | grep -iE "error" && ko "07a no es repetible" || ok "07a repetida sin errores (idempotente)"
echo "2) Cerrado en la etapa 1"
denegado anon "select count(*) from usuarios" && ok "anon NO lee usuarios (PIN y credenciales)" || ko "anon lee usuarios"
for s in "update usuarios set pin='0000'" "insert into usuarios (nombre) values ('x')" "delete from usuarios"; do denegado anon "$s" && ok "anon NO puede: ${s:0:40}" || ko "anon pudo: $s"; done
denegado anon "select * from verificar_pin_garzon('1234')" && ok "anon NO ejecuta verificar_pin_garzon" || ko "anon ejecuta el RPC"
denegado anon "select * from verificar_login_admin('a@x.test','1234')" && ok "anon NO ejecuta verificar_login_admin" || ko "anon ejecuta el RPC admin"
denegado authenticated "select pin from usuarios" 11111111-1111-1111-1111-111111111111 && ok "authenticated NO lee pin" || ko "authenticated lee pin"
[ "$(como authenticated "select count(*) from usuarios" 11111111-1111-1111-1111-111111111111 | grep -oE '[0-9]+' | tail -1)" = 1 ] && ok "authenticated ve solo su fila" || ko "authenticated ve ajenas"
echo "3) Lo que la etapa 1 NO cierra todavía (esperado; lo cierra 07 en la etapa 2): la app sigue operando"
[ "$(n anon ventas)" = 2 ] && ok "ventas sigue abierta a anon (la app actual necesita esto hasta la etapa 2)" || ko "ventas cambió inesperadamente"
[ "$(n anon productos)" = 1 ] && ok "carta pública intacta" || ko "carta"
echo "4) service_role (servidor): login y PIN de admin siguen funcionando"
como service_role "select nombre from verificar_login_admin('a@x.test','1234')" | grep -q "Dueña A" && ok "login admin (RPC) desde el servidor" || ko "login admin"
como service_role "select nombre from verificar_pin_garzon('0000')" | grep -qv ERROR && ok "login por PIN (RPC) desde el servidor" || ko "login pin"
como service_role "select count(*) from usuarios where pin='1234' and rol='admin'" | grep -qE '\b1\b' && ok "verificar PIN de admin (gastos) desde el servidor" || ko "verificar pin"
echo "5) Reversión de emergencia (restaura lo anterior, inseguro) y huella idéntica"
$P -d $DB -f $D/07a_cierre_usuarios_y_login_REVERSION_EMERGENCIA.sql 2>&1 | grep -iE "error" && ko "reversión falló" || ok "reversión sin errores"
[ "$(n anon usuarios)" = 2 ] && ok "anon vuelve a leer usuarios (estado anterior)" || ko "no restauró"
[ "$(foto)" = "$ANTES" ] && ok "huella IDÉNTICA a la de antes de 07a" || ko "huella distinta tras la reversión"
echo; $P -d postgres -c "drop database $DB" >/dev/null; [ $fallos = 0 ] && echo "RESULTADO 07a: TODO OK" || echo "RESULTADO 07a: $fallos fallo(s)"; exit $fallos
fi
echo "1) Aplicar 07 (una transacción)"
$P -d $DB -f $D/07_permisos_cierre_acceso.sql 2>&1 | grep -iE "error" && ko "07 falló" || ok "07 aplicada sin errores"
$P -d $DB -f $D/07_permisos_cierre_acceso.sql 2>&1 | grep -iE "error" && ko "07 no es repetible" || ok "07 repetida: sin errores (idempotente)"
[ "$($P -d $DB -c "select count(*) from permisos_respaldo_07 where tipo='politica'")" = 14 ] && ok "respaldo del estado anterior: 14 políticas guardadas (no se pisa al repetir)" || ko "respaldo inesperado: $($P -d $DB -c "select count(*) from permisos_respaldo_07 where tipo='politica'")"

echo "2) anon (llave pública): no lee ni escribe nada privado"
for t in usuarios ventas gastos aperturas_caja cierres_caja propinas insumos recetas stock_insumos stock_compras stock_movimientos mesas configuracion_empresa pedidos pedido_items usuarios_pos mp_cuentas pagos_point respaldo_ventas_pre03 permisos_respaldo_07; do
  denegado anon "select count(*) from $t" && ok "anon NO lee $t" || ko "anon todavía lee $t"; done
for s in "insert into ventas (empresa_id,total) values ('$A',1)" "update ventas set total=1" "delete from ventas" "insert into usuarios (nombre) values ('x')" "update usuarios set pin='0000'" "delete from gastos" "insert into gastos (empresa_id,monto) values ('$A',1)" "update propinas set monto=0" "insert into propinas (empresa_id,monto) values ('$A',1)" "truncate ventas"; do
  denegado anon "$s" && ok "anon NO puede: ${s:0:48}" || ko "anon pudo: $s"; done
echo "   funciones de login:"
denegado anon "select * from verificar_pin_garzon('1234')" && ok "anon NO ejecuta verificar_pin_garzon" || ko "anon ejecuta verificar_pin_garzon"
denegado anon "select * from verificar_login_admin('a@x.test','1234')" && ok "anon NO ejecuta verificar_login_admin" || ko "anon ejecuta verificar_login_admin"
denegado authenticated "select * from verificar_pin_garzon('1234')" && ok "authenticated NO ejecuta verificar_pin_garzon" || ko "authenticated ejecuta el RPC"

echo "3) Lo que sigue abierto: solo la carta"
[ "$(n anon productos)" = 1 ] && ok "anon ve solo productos disponibles (1 de 2)" || ko "productos: $(n anon productos)"
[ "$(n anon categorias)" = 1 ] && ok "anon lee categorías" || ko "categorías"
como anon "select id,nombre,slug,logo_url from empresas" | grep -q "Negocio A" && ok "anon lee empresas (id,nombre,slug,logo_url) para el login" || ko "empresas no legible"
denegado anon "select secreto_interno from empresas" && ok "anon NO lee columnas no públicas de empresas" || ko "anon lee secreto_interno"
denegado anon "select * from empresas" && ok "select * en empresas se rechaza (solo columnas públicas)" || ko "select * en empresas"
for s in "insert into productos (empresa_id,nombre,precio) values ('$A','x',1)" "update productos set precio=1" "delete from productos" "insert into categorias (empresa_id,nombre) values ('$A','x')" "update empresas set nombre='x'" "delete from empresas"; do denegado anon "$s" && ok "anon NO puede: ${s:0:52}" || ko "anon pudo: $s"; done

echo "4) authenticated (usuario de Supabase Auth): solo su propia fila y sin PIN"
[ "$(como authenticated "select count(*) from usuarios" 11111111-1111-1111-1111-111111111111 | grep -oE '[0-9]+' | head -1)" = 1 ] && ok "ve 1 fila (la propia)" || ko "ve filas ajenas"
como authenticated "select nombre,empresa_id from usuarios" 11111111-1111-1111-1111-111111111111 | grep -q "Dueña A" && ok "lee nombre/empresa propios" || ko "no lee lo propio"
denegado authenticated "select pin from usuarios" 11111111-1111-1111-1111-111111111111 && ok "NO puede leer la columna pin" || ko "lee pin"
denegado authenticated "update usuarios set rol='admin'" 11111111-1111-1111-1111-111111111111 && ok "NO puede modificar usuarios" || ko "modifica usuarios"
denegado authenticated "select count(*) from ventas" 11111111-1111-1111-1111-111111111111 && ok "NO lee ventas (ni siquiera de su negocio: todo pasa por el servidor)" || ko "authenticated lee ventas"

echo "5) service_role (servidor): todo el flujo operativo sigue funcionando"
como service_role "insert into ventas (empresa_id,mesa,total) values ('$A','M7',3000)" | grep -q "INSERT 0 1" && ok "crear venta" || ko "crear venta"
como service_role "update ventas set estado='listo' where mesa='M7'" | grep -q "UPDATE 1" && ok "pasar a listo (cocina)" || ko "cocina"
como service_role "insert into gastos (empresa_id,monto) values ('$A',5)" | grep -q "INSERT 0 1" && ok "registrar gasto" || ko "gasto"
como service_role "insert into cierres_caja (empresa_id,total) values ('$A',1)" | grep -q "INSERT 0 1" && ok "cierre de caja" || ko "cierre"
como service_role "insert into pagos_point (venta_id,restaurante_id,monto,estado) values ('v','$A',1,'created')" | grep -q "INSERT 0 1" && ok "cobro Point (pagos_point)" || ko "pagos_point"
como service_role "select count(*) from mp_cuentas" | grep -qE '\b1\b' && ok "lee mp_cuentas (token cifrado) en el servidor" || ko "mp_cuentas"
como service_role "select nombre from verificar_login_admin('a@x.test','1234')" | grep -q "Dueña A" && ok "login admin (RPC) desde el servidor" || ko "login admin"
como service_role "select nombre from verificar_pin_garzon('0000')" | grep -qv ERROR && ok "login por PIN (RPC) desde el servidor" || ko "login pin"
como service_role "select count(*) from usuarios where pin='1234'" | grep -qE '\b1\b' && ok "verificar PIN de admin (gastos) desde el servidor" || ko "verificar pin"
como service_role "delete from ventas where mesa='M7'" | grep -q "DELETE 1" && ok "eliminar venta (admin)" || ko "delete venta"

echo "6) Verificador de solo lectura: bloques B, C y D vacíos"
out=$($P -d $DB -f $D/verificar_07.sql 2>&1)
if echo "$out" | grep -qE "^(ventas|usuarios|gastos|mp_cuentas|pagos_point)\b.*(t\|t|t$)"; then :; fi
b=$($P -d $DB -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (has_table_privilege('anon',c.oid,'insert') or has_table_privilege('anon',c.oid,'update') or has_table_privilege('anon',c.oid,'delete') or has_table_privilege('authenticated',c.oid,'insert') or has_table_privilege('authenticated',c.oid,'update') or has_table_privilege('authenticated',c.oid,'delete'))")
[ "$b" = 0 ] && ok "B: 0 tablas con escritura abierta" || ko "B: $b"
cc=$($P -d $DB -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('anon',c.oid,'select') and c.relname not in ('productos','categorias','empresas')"); [ "$cc" = 0 ] && ok "C: 0 lecturas abiertas fuera de la carta" || ko "C: $cc"
grep -iE "\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b" <(sed "s/--.*$//; s/'[^']*'//g" $D/verificar_07.sql) >/dev/null && ko "verificar_07.sql escribe" || ok "verificar_07.sql es solo lectura"
dd=$($P -d $DB -f $D/verificar_07.sql 2>&1 | tail -n +1 | grep -E "^(politica|funcion)\|" | wc -l); [ "$dd" = 0 ] && ok "D: 0 políticas públicas indebidas ni funciones abiertas" || ko "D: $dd"

echo "7) Tablas nuevas ya no nacen abiertas (privilegios por defecto)"
$P -d $DB -c "create table nueva_tabla (id int)" >/dev/null; denegado anon "select * from nueva_tabla" && ok "anon NO ve una tabla creada después" || ko "tabla nueva abierta"

echo "8) Reversión de emergencia restaura EXACTAMENTE el estado anterior"
$P -d $DB -f $D/07_permisos_REVERSION_EMERGENCIA.sql 2>&1 | grep -iE "error" && ko "la reversión falló" || ok "reversión aplicada sin errores"
[ "$(n anon usuarios)" = 2 ] && ok "anon vuelve a leer usuarios (estado anterior, inseguro)" || ko "no restauró usuarios"
como anon "update ventas set total=7000 where mesa='M9'" | grep -q "UPDATE 1" && ok "anon vuelve a modificar ventas" || ko "no restauró escritura"
como anon "select count(*) from verificar_pin_garzon('0000')" | grep -qv ERROR && ok "RPC de login vuelve a ser público" || ko "no restauró RPC"
pol=$($P -d $DB -c "select count(*) from pg_policies where schemaname='public'"); [ "$pol" = 14 ] && ok "14 políticas restauradas (las del estado anterior)" || ko "políticas tras reversión: $pol"
[ "$(foto)" = "$ANTES" ] && ok "huella (políticas + privilegios + RLS + funciones) IDÉNTICA a la de antes de 07" || ko "la huella tras la reversión difiere de la original"
echo; $P -d postgres -c "drop database $DB" >/dev/null; [ $fallos = 0 ] && echo "RESULTADO: TODO OK" || echo "RESULTADO: $fallos fallo(s)"; exit $fallos
