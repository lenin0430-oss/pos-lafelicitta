// Base de datos en memoria que imita lo mínimo del cliente de Supabase (solo para pruebas; datos ficticios).
export function crearDb(tablas = {}, rpcs = {}) {
  const T = Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const log = [];
  let seq = 1;
  const coincide = (r, f) => f.every(([m, c, v]) => m === "eq" ? r[c] === v : m === "neq" ? r[c] !== v : m === "in" ? v.includes(r[c]) : m === "is" ? r[c] === v : m === "gte" ? r[c] >= v : true);
  function from(nombre) {
    const st = { op: "select", filtros: [], limit: null, single: null, cuerpo: null, ret: false };
    const filas = () => (T[nombre] ??= []);
    const q = new Proxy({}, { get: (_x, m) => {
      if (m === "then") return (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko);
      return (...a) => {
        if (["select"].includes(m)) { if (st.op === "select") st.op = "select"; else st.ret = true; }
        else if (m === "insert" || m === "update") { st.op = m; st.cuerpo = a[0]; }
        else if (m === "delete") st.op = "delete";
        else if (["eq", "neq", "in", "is", "gte", "lte", "gt", "lt"].includes(m)) st.filtros.push([m, ...a]);
        else if (m === "limit") st.limit = a[0];
        else if (m === "single" || m === "maybeSingle") st.single = m;
        return q;
      };
    } });
    function ejecutar() {
      log.push({ tabla: nombre, op: st.op, filtros: st.filtros, cuerpo: st.cuerpo });
      let data;
      if (st.op === "insert") { const nuevas = (Array.isArray(st.cuerpo) ? st.cuerpo : [st.cuerpo]).map((r) => ({ id: "id" + seq++, ...r })); filas().push(...nuevas); data = nuevas; }
      else if (st.op === "update") { data = filas().filter((r) => coincide(r, st.filtros)); data.forEach((r) => Object.assign(r, st.cuerpo)); }
      else if (st.op === "delete") { data = filas().filter((r) => coincide(r, st.filtros)); T[nombre] = filas().filter((r) => !data.includes(r)); }
      else data = filas().filter((r) => coincide(r, st.filtros));
      if (st.limit != null) data = data.slice(0, st.limit);
      if (st.single) { if (data.length > 1) return { data: null, error: { message: "varias filas" } }; return { data: data[0] ?? null, error: null }; }
      return { data: data.map((r) => ({ ...r })), error: null, status: 200 };
    }
    return q;
  }
  function rpc(fn, args) {
    const h = rpcs[fn];
    const p = Promise.resolve(h ? h(args, T) : { data: null, error: { code: "42883", message: `function ${fn} does not exist` } });
    p.maybeSingle = () => p; return p;
  }
  return { from, rpc, T, log };
}
// Réplica en JS de las funciones SQL de 07b (su comportamiento real se prueba en PostgreSQL: tests/seguridad_pg.sh).
export function rpcsSeguridad() {
  const intentos = new Map();
  return {
    registrar_fallo_login: ({ p_clave, p_max, p_ventana_s, p_bloqueo_s }) => {
      const ahora = Date.now(); let r = intentos.get(p_clave);
      if (!r || (r.ini + p_ventana_s * 1000 < ahora && r.hasta < ahora)) r = { n: 0, ini: ahora, hasta: 0, b: r?.b ?? 0 };
      r.n++; if (r.n >= p_max && r.hasta < ahora) { r.hasta = ahora + p_bloqueo_s * 2 ** r.b * 1000; r.b++; r.n = 0; }
      intentos.set(p_clave, r); return { data: r.hasta > ahora ? new Date(r.hasta).toISOString() : null, error: null };
    },
    login_bloqueado_hasta: ({ p_clave }) => { const r = intentos.get(p_clave); return { data: r && r.hasta > Date.now() ? new Date(r.hasta).toISOString() : null, error: null }; },
    limpiar_intentos_login: ({ p_clave }) => { intentos.delete(p_clave); return { data: null, error: null }; },
    consumir_aprobacion: (a, T) => {
      const f = (T.aprobaciones_operacion ?? []).find((r) => r.token_hash === a.p_token_hash && r.empresa_id === a.p_empresa && r.tipo === a.p_tipo && r.actor === a.p_actor && Number(r.monto) === Number(a.p_monto) && r.huella === a.p_huella && !r.usada_en && new Date(r.expira_en) > new Date());
      if (f) f.usada_en = new Date().toISOString(); return { data: !!f, error: null };
    },
    _intentos: intentos,
  };
}
// Réplica en JS de cobrar_venta_manual / editar_comanda_venta de 07c (el bloqueo real se prueba en PostgreSQL: tests/concurrencia_cobro_pg.sh).
export function rpcsVentas(registro = []) {
  const TERMINADOS = ["canceled", "cancelled", "failed", "expired", "refunded"];
  const comunes = (a, T) => {
    const v = (T.ventas ?? []).find((x) => String(x.id) === a.p_venta && String(x.empresa_id) === a.p_empresa);
    if (!v) return { v: null, cod: "no_encontrada" };
    if ((v.metodo_pago ?? "") !== "" || (v.estado_pago ?? "pendiente") !== "pendiente") return { v, cod: "ya_cobrada" };
    if ((T.pagos_point ?? []).some((p) => p.venta_id === a.p_venta && !TERMINADOS.includes(String(p.estado ?? "").toLowerCase()))) return { v, cod: "point_en_curso" };
    return { v, cod: "ok" };
  };
  return {
    cobrar_venta_manual: (a, T) => {
      registro.push(["cobrar_venta_manual", a]);
      const { v, cod } = comunes(a, T); if (cod !== "ok") return { data: cod, error: null };
      if (a.p_mixto_suma != null && a.p_mixto_suma !== Math.round(v.total)) return { data: "mixto_no_suma", error: null };
      v.metodo_pago = a.p_medio; v.estado_pago = /^cortes[ií]a$/i.test(a.p_medio.trim()) ? "cortesia" : "pagado"; v.pagado_at = new Date().toISOString(); return { data: "ok", error: null };
    },
    editar_comanda_venta: (a, T) => {
      registro.push(["editar_comanda_venta", a]);
      const suma = a.p_items.reduce((s, i) => s + i.cantidad * i.precio_unit, 0); if (suma !== a.p_total) return { data: "total_no_coincide", error: null };
      const { v, cod } = comunes(a, T); if (cod !== "ok") return { data: cod, error: null };
      v.total = a.p_total; v.items = a.p_items; if (a.p_mesa != null) v.mesa = a.p_mesa; if (a.p_mesero != null) v.mesero = a.p_mesero; if (a.p_personas != null) v.personas = a.p_personas;
      return { data: "ok", error: null };
    },
  };
}
