import { reglasVentas, reglasPropinas, reglasCaja, reglasGenericas, type Accion, type Chequeo, type Fila } from "./reglasNegocio";

// Reglas PURAS (sin red ni base de datos) de la "puerta de datos" del servidor (app/api/datos).
// El navegador ya no habla con las tablas privadas: manda una solicitud (tabla + pasos de consulta) y el servidor
//  - toma el negocio y el rol de la COOKIE firmada (nunca de lo que diga el navegador),
//  - comprueba tabla, operación, columnas y rol contra la lista de abajo,
//  - fuerza el filtro del negocio y vuelve a ensamblar la consulta en un orden canónico.
// Lo que no está en esta lista NO se puede hacer desde el navegador.

export type Rol = "admin" | "garzon";
export type Paso = { m: string; a: unknown[] };
export type Solicitud = { tabla: string; pasos: Paso[] };
export type SesionDatos = { rol: Rol; empresa_id: string; nombre?: string };
export type Operacion = "select" | "insert" | "update" | "delete";
export type Plan =
  | { ok: true; tabla: string; operacion: Operacion; pasos: Paso[]; accion: Accion; chequeos: Chequeo[]; reglas: Paso[] }
  | { ok: false; status: number; error: string };

const A: Rol[] = ["admin"];
const AG: Rol[] = ["admin", "garzon"];
type Regla = { clave: "empresa_id" | "id"; ops: Partial<Record<Operacion, Rol[]>>; embeds?: string[] };
const todoAdmin = { select: A, insert: A, update: A, delete: A };

// Derivado de las llamadas reales de la app (caja y cocina = garzón y admin; el resto = solo admin).
export const REGLAS: Record<string, Regla> = {
  ventas: { clave: "empresa_id", ops: { select: AG, insert: AG, update: AG, delete: A } },
  aperturas_caja: { clave: "empresa_id", ops: { select: AG, insert: A, update: A } },
  cierres_caja: { clave: "empresa_id", ops: { select: A, insert: A } },
  // Gastos: el alta NO es genérica; la hace el caso de uso /api/gastos (aprobación de admin verificada en el servidor).
  gastos: { clave: "empresa_id", ops: { select: AG, delete: A } },
  propinas: { clave: "empresa_id", ops: { select: AG, insert: AG, delete: A } },
  productos: { clave: "empresa_id", ops: { select: AG, insert: A, update: A }, embeds: ["categorias"] },
  categorias: { clave: "empresa_id", ops: { select: AG, insert: A, update: A } },
  mesas: { clave: "empresa_id", ops: { select: AG } },
  configuracion_empresa: { clave: "empresa_id", ops: { select: AG } },
  empresas: { clave: "id", ops: { select: AG } },
  insumos: { clave: "empresa_id", ops: todoAdmin },
  recetas: { clave: "empresa_id", ops: todoAdmin },
  stock_insumos: { clave: "empresa_id", ops: todoAdmin },
  stock_compras: { clave: "empresa_id", ops: todoAdmin },
  stock_movimientos: { clave: "empresa_id", ops: todoAdmin },
};
// Alta de negocios nuevos (app/admin/nueva-empresa): DESHABILITADA mientras no exista una administración de plataforma definida y probada.
// Aunque se defina PLATAFORMA_EMPRESA_ID, nada se habilita sin cambiar esta constante en una revisión de código.
export const ALTA_NEGOCIOS_HABILITADA = false;
export const REGLAS_PLATAFORMA: Record<string, { ops: Operacion[] }> = {
  empresas: { ops: ["insert", "delete"] },
  usuarios: { ops: ["insert"] },
  mesas: { ops: ["insert"] },
};

export const TABLAS_POR_ID = ["ventas", "aperturas_caja", "cierres_caja", "gastos", "propinas", "productos"];
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const FILTROS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"];
const MODIFICADORES = ["order", "limit", "range", "single", "maybeSingle"];
const OPERACIONES: Operacion[] = ["select", "insert", "update", "delete"];
const MAX_PASOS = 24, MAX_FILAS = 500, MAX_IN = 200;
const prim = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const falla = (status: number, error: string): Plan => ({ ok: false, status, error });
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// Columnas de un select: "*" | "a,b" | "a,categorias(nombre)". Solo se permiten relaciones de la lista `embeds` de la tabla.
export function columnasValidas(cols: unknown, embeds: string[] = []): boolean {
  if (cols === undefined || cols === null || cols === "") return true;
  if (typeof cols !== "string" || cols.length > 600) return false;
  let prof = 0, ini = 0; const items: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    if (cols[i] === "(") prof++;
    else if (cols[i] === ")") { prof--; if (prof < 0) return false; }
    else if (cols[i] === "," && prof === 0) { items.push(cols.slice(ini, i)); ini = i + 1; }
  }
  if (prof !== 0) return false;
  items.push(cols.slice(ini));
  return items.every((raw) => {
    const t = raw.replace(/\s+/g, "");
    if (t === "*" || IDENT.test(t)) return true;
    const m = t.match(/^([a-z_][a-z0-9_]*)\(([^()]*)\)$/);
    return !!m && embeds.includes(m[1]) && m[2].split(",").every((c) => c === "*" || IDENT.test(c));
  });
}

function reglasPorTabla(tabla: string, op: "insert" | "update", sesion: SesionDatos, filas: Fila[]) {
  if (["propinas", "aperturas_caja", "cierres_caja"].includes(tabla) && filas.length !== 1) return { ok: false as const, status: 400, error: "Un solo registro por operación" };
  if (tabla === "ventas") return reglasVentas(op, sesion.rol, filas);
  if (tabla === "propinas" && op === "insert") return reglasPropinas(filas[0], sesion);
  if (tabla === "propinas") return { ok: false as const, status: 403, error: "Operación no permitida" };
  if (tabla === "aperturas_caja" || tabla === "cierres_caja") return reglasCaja(tabla, op, filas[0], sesion);
  const r = reglasGenericas(tabla, filas);
  if (r.ok && op === "insert" && filas.length > 1 && !["productos", "categorias", "insumos", "recetas", "stock_insumos", "stock_compras", "stock_movimientos"].includes(tabla)) return { ok: false as const, status: 400, error: "Un solo registro por operación" };
  return r;
}

export function planificar(
  sesion: SesionDatos | null,
  sol: unknown,
  opts: { plataformaEmpresaId?: string | null } = {}
): Plan {
  if (!sesion?.empresa_id) return falla(401, "Sin sesión");
  if (!esObjeto(sol) || typeof sol.tabla !== "string" || !Array.isArray(sol.pasos)) return falla(400, "Solicitud inválida");
  const tabla = sol.tabla;
  const pasos = sol.pasos as Paso[];
  if (!IDENT.test(tabla)) return falla(400, "Tabla inválida");
  if (pasos.length === 0 || pasos.length > MAX_PASOS) return falla(400, "Cantidad de pasos inválida");
  if (!pasos.every((p) => esObjeto(p) && typeof p.m === "string" && Array.isArray(p.a))) return falla(400, "Pasos inválidos");

  const operacion = pasos[0].m as Operacion;
  if (!OPERACIONES.includes(operacion)) return falla(400, "La consulta debe empezar por select, insert, update o delete");

  const esPlataforma = ALTA_NEGOCIOS_HABILITADA && !!opts.plataformaEmpresaId && sesion.rol === "admin" && sesion.empresa_id === opts.plataformaEmpresaId;
  const regla = REGLAS[tabla];
  const reglaPlat = esPlataforma ? REGLAS_PLATAFORMA[tabla] : undefined;
  const viaPlataforma = !!reglaPlat && reglaPlat.ops.includes(operacion) && !(regla?.ops[operacion]?.includes(sesion.rol));
  if (!regla && !viaPlataforma) return falla(403, "Tabla no permitida");
  if (!viaPlataforma && !regla!.ops[operacion]?.includes(sesion.rol)) return falla(403, `Operación no permitida para el rol ${sesion.rol}`);

  const clave = regla?.clave ?? "empresa_id";
  const filtros: Paso[] = [], mods: Paso[] = [];
  let retorno: Paso | null = null;
  let payload: unknown;
  let accion: Accion = "generica", chequeos: Chequeo[] = [], extra: Paso[] = [];
  let cuerpo: Paso = { m: operacion, a: [] };

  // --- primer paso ---
  const p0 = pasos[0];
  if (operacion === "select") {
    if (!columnasValidas(p0.a[0], regla?.embeds)) return falla(400, "Columnas no permitidas");
    const o = p0.a[1];
    if (o !== undefined && !(esObjeto(o) && Object.keys(o).every((k) => ["count", "head"].includes(k)) && (o.count === undefined || ["exact", "planned", "estimated"].includes(String(o.count))))) return falla(400, "Opciones inválidas");
    cuerpo = { m: "select", a: p0.a.slice(0, 2) };
  } else if (operacion === "insert") {
    payload = p0.a[0];
    const filas = Array.isArray(payload) ? payload : [payload];
    if (filas.length === 0 || filas.length > MAX_FILAS || !filas.every(esObjeto)) return falla(400, "Datos inválidos");
    if (p0.a.length > 1) return falla(400, "Opciones de insert no permitidas");
    const salida: Record<string, unknown>[] = [];
    for (const f of filas as Record<string, unknown>[]) {
      if (!Object.keys(f).every((k) => IDENT.test(k))) return falla(400, "Columna inválida");
      if (!viaPlataforma) {
        if (clave === "empresa_id") {
          if ("empresa_id" in f && f.empresa_id !== sesion.empresa_id) return falla(403, "Negocio no autorizado");
          salida.push({ ...f, empresa_id: sesion.empresa_id });
        } else salida.push(f);
      } else salida.push(f);
    }
    let filasFinal: Fila[] = salida;
    if (!viaPlataforma) {
      const r = reglasPorTabla(tabla, "insert", sesion, salida);
      if (!r.ok) return falla(r.status, r.error);
      filasFinal = r.valor.filas; accion = r.valor.accion; chequeos = r.valor.chequeos;
    }
    cuerpo = { m: "insert", a: [Array.isArray(payload) ? filasFinal : filasFinal[0]] };
  } else if (operacion === "update") {
    payload = p0.a[0];
    if (!esObjeto(payload) || p0.a.length > 1 || !Object.keys(payload).every((k) => IDENT.test(k))) return falla(400, "Datos inválidos");
    if (Object.keys(payload).length === 0) return falla(400, "Sin cambios");
    if ("empresa_id" in payload && payload.empresa_id !== sesion.empresa_id) return falla(403, "Negocio no autorizado");
    if ("id" in payload) return falla(403, "No se puede cambiar el id");
    const { empresa_id: _e, ...resto } = payload as Record<string, unknown>;
    let cambios: Fila = resto;
    if (!viaPlataforma) {
      const r = reglasPorTabla(tabla, "update", sesion, [resto]);
      if (!r.ok) return falla(r.status, r.error);
      cambios = r.valor.filas[0]; accion = r.valor.accion; chequeos = r.valor.chequeos; extra = r.valor.filtrosExtra;
    }
    cuerpo = { m: "update", a: [cambios] };
  } else if (p0.a.length) return falla(400, "delete no admite argumentos");

  // --- pasos siguientes ---
  let filtrosPropios = 0;
  for (const p of pasos.slice(1)) {
    if (FILTROS.includes(p.m)) {
      if (operacion === "insert") return falla(400, "insert no admite filtros");
      const [col, val] = p.a;
      if (p.a.length !== 2 || typeof col !== "string" || !IDENT.test(col)) return falla(400, "Filtro inválido");
      if (p.m === "in") { if (!Array.isArray(val) || val.length > MAX_IN || !val.every(prim)) return falla(400, "Filtro in inválido"); }
      else if (p.m === "is") { if (!(val === null || typeof val === "boolean")) return falla(400, "Filtro is inválido"); }
      else if (!prim(val)) return falla(400, "Valor de filtro inválido");
      if (col === clave && !viaPlataforma) {
        if (p.m !== "eq" || val !== sesion.empresa_id) return falla(403, "Negocio no autorizado");
      } else filtrosPropios++;
      filtros.push({ m: p.m, a: [col, val] });
    } else if (p.m === "select") {
      if (operacion === "select") return falla(400, "select repetido");
      if (!columnasValidas(p.a[0], regla?.embeds)) return falla(400, "Columnas no permitidas");
      retorno = { m: "select", a: p.a.slice(0, 1) };
    } else if (p.m === "order") {
      const [col, o] = p.a;
      if (typeof col !== "string" || !IDENT.test(col)) return falla(400, "order inválido");
      if (o !== undefined && !(esObjeto(o) && Object.keys(o).every((k) => ["ascending", "nullsFirst"].includes(k)))) return falla(400, "order inválido");
      mods.push({ m: "order", a: [col, ...(o === undefined ? [] : [o])] });
    } else if (p.m === "limit") {
      if (!Number.isInteger(p.a[0]) || (p.a[0] as number) < 0 || (p.a[0] as number) > 5000) return falla(400, "limit inválido");
      mods.push({ m: "limit", a: [p.a[0]] });
    } else if (p.m === "range") {
      if (!Number.isInteger(p.a[0]) || !Number.isInteger(p.a[1]) || (p.a[0] as number) < 0 || (p.a[1] as number) - (p.a[0] as number) > 5000) return falla(400, "range inválido");
      mods.push({ m: "range", a: [p.a[0], p.a[1]] });
    } else if (p.m === "single" || p.m === "maybeSingle") {
      mods.push({ m: p.m, a: [] });
    } else return falla(400, `Método no permitido: ${p.m}`);
  }
  // Tablas con dinero o precios: update/delete SOLO sobre UNA fila identificada por id (nada de filtros amplios ni lotes).
  // Una limitación de lectura (p. ej. "se revisaron 50 filas") no puede ampliar lo que se escribe.
  if ((operacion === "update" || operacion === "delete") && !viaPlataforma && TABLAS_POR_ID.includes(tabla)) {
    const propios = filtros.filter((f) => !(f.a[0] === clave));
    const ok = propios.length === 1 && propios[0].m === "eq" && propios[0].a[0] === "id" && (typeof propios[0].a[1] === "string" || typeof propios[0].a[1] === "number") && String(propios[0].a[1]).length > 0;
    if (!ok) return falla(400, "Esta operación exige exactamente un filtro por id de un registro del negocio");
  }
  if (!viaPlataforma) {
    if ((operacion === "update" || operacion === "delete") && filtrosPropios === 0) return falla(400, "update/delete requieren un filtro (por ejemplo por id)");
  } else if (operacion === "delete" && filtrosPropios === 0) return falla(400, "delete requiere un filtro");
  // single/maybeSingle deben ir al final
  mods.sort((x, y) => Number(x.m === "single" || x.m === "maybeSingle") - Number(y.m === "single" || y.m === "maybeSingle"));

  const scope: Paso[] = (viaPlataforma || operacion === "insert") ? [] : [{ m: "eq", a: [clave, sesion.empresa_id] }];
  const final: Paso[] = [cuerpo, ...filtros, ...extra, ...scope, ...(retorno ? [retorno] : []), ...mods];
  return { ok: true, tabla, operacion, pasos: final, accion, chequeos, reglas: extra };
}

// Repite los pasos ya validados sobre un cliente de Supabase con llave de servicio (inyectado: se puede probar con un doble).
export async function ejecutarPlan(
  db: { from: (t: string) => any },
  plan: Extract<Plan, { ok: true }>
) {
  let q: any = db.from(plan.tabla);
  for (const p of plan.pasos) q = q[p.m](...p.a);
  const r = await q;
  return {
    data: r.data ?? null,
    count: r.count ?? null,
    status: r.status ?? 200,
    error: r.error ? { message: String(r.error.message ?? "Error"), code: r.error.code ?? null } : null,
  };
}
