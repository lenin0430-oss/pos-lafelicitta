// Reglas de negocio PURAS (sin red ni base de datos) para lo que el navegador puede escribir en tablas financieras.
// La puerta de datos (datosAutorizados.ts) las usa para decidir QUÉ campos y QUÉ acciones permite cada rol.
// Lo que el navegador envíe fuera de estas listas se rechaza; autor, fechas y estado inicial los fija el servidor.

export type Fila = Record<string, unknown>;
export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; error: string };
const ok = <T,>(valor: T): Resultado<T> => ({ ok: true, valor });
const no = (error: string, status = 400): Resultado<never> => ({ ok: false, status, error });

export const MAX_MONTO = 50_000_000;            // tope de cordura por importe (CLP)
export const UMBRAL_GASTO_SIN_APROBACION = 30000; // igual que app/gastos (garzón necesita aprobación de admin desde este monto)
export const ESTADOS_COCINA = ["pendiente", "en_proceso", "listo"] as const;
export const MEDIOS_MIXTO = ["Efectivo", "Débito", "Transferencia", "Crédito"] as const;
// Estados del pedido de Point que NO bloquean (terminaron sin cobrar).
export const ESTADOS_POINT_TERMINADOS_SIN_COBRO = ["canceled", "cancelled", "failed", "expired", "refunded"];

const esObj = (v: unknown): v is Fila => !!v && typeof v === "object" && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const texto = (v: unknown, max: number, min = 0) => typeof v === "string" && v.length >= min && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const soloClaves = (o: Fila, permitidas: string[]) => Object.keys(o).every((k) => permitidas.includes(k));

export type Linea = { nombre: string; cantidad: number; precio_unit: number; nota?: string; ingredientes?: string };

export function validarItems(v: unknown): Resultado<{ items: Linea[]; total: number }> {
  if (!Array.isArray(v) || v.length === 0 || v.length > 100) return no("items inválidos");
  const items: Linea[] = []; let total = 0;
  for (const it of v) {
    if (!esObj(it) || !soloClaves(it, ["nombre", "cantidad", "precio_unit", "nota", "ingredientes"])) return no("Línea de pedido inválida");
    if (!texto(it.nombre, 120, 1) || !entero(it.cantidad, 1, 99) || !entero(it.precio_unit, 0, 10_000_000)) return no("Línea de pedido inválida");
    if (it.nota !== undefined && !texto(it.nota, 300)) return no("Nota inválida");
    if (it.ingredientes !== undefined && !texto(it.ingredientes, 800)) return no("Ingredientes inválidos");
    total += (it.cantidad as number) * (it.precio_unit as number);
    items.push({ ...(it as unknown as Linea) });
  }
  if (total > MAX_MONTO) return no("Total fuera de rango");
  return ok({ items, total });
}

export function normalizarMedioPago(m: unknown): string | null {
  if (typeof m !== "string") return null;
  const t = m.trim();
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{1,29}$/.test(t)) return null;
  if (/point|mercado|mp\b/i.test(t) || /^mixto$/i.test(t)) return null; // "Point" solo lo escribe el servidor con evidencia del proveedor
  return t;
}

// "Mixto: Efectivo $2.000 + Débito $3.000" → suma por medio. null si el formato no es válido.
export function parseMixto(m: unknown): { partes: { medio: string; monto: number }[]; suma: number } | null {
  if (typeof m !== "string" || !m.startsWith("Mixto: ") || m.length > 200) return null;
  const partes: { medio: string; monto: number }[] = []; const vistos = new Set<string>();
  for (const trozo of m.slice(7).split(" + ")) {
    const r = trozo.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+) \$([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)$/);
    if (!r || !(MEDIOS_MIXTO as readonly string[]).includes(r[1]) || vistos.has(r[1])) return null;
    const monto = Number(r[2].replace(/\./g, ""));
    if (!entero(monto, 1, MAX_MONTO)) return null;
    vistos.add(r[1]); partes.push({ medio: r[1], monto });
  }
  return partes.length >= 2 ? { partes, suma: partes.reduce((s, p) => s + p.monto, 0) } : null;
}

export type Accion =
  | "ventas.crear" | "ventas.estado_cocina" | "ventas.cobro_manual" | "ventas.corregir_pago" | "ventas.editar_comanda"
  | "propinas.crear" | "aperturas.abrir" | "aperturas.cerrar" | "cierres.crear" | "generica";

export type Chequeo =
  | "catalogo"                  // las líneas deben existir en productos del negocio con el precio vigente (líneas ya existentes se toleran)
  | "venta_sin_cobro"           // la venta existe, no tiene medio de pago y no tiene cobro Point en curso/aprobado
  | "venta_no_point"            // la venta existente no está cobrada con Point
  | "total_coincide_mixto"      // si el medio es Mixto, la suma debe ser igual al total guardado
  | "venta_del_negocio";        // venta_id referenciado pertenece al negocio

export type Sesion = { rol: "admin" | "garzon"; empresa_id: string; nombre?: string };
export type ResultadoCampos = { filas: Fila[]; accion: Accion; chequeos: Chequeo[]; filtrosExtra: { m: string; a: unknown[] }[] };

const ahora = () => new Date().toISOString();

export function reglasVentas(op: "insert" | "update", rol: Sesion["rol"], filas: Fila[]): Resultado<ResultadoCampos> {
  if (op === "insert") {
    const salida: Fila[] = [];
    for (const f of filas) {
      if (!soloClaves(f, ["empresa_id", "numero", "mesa", "mesero", "personas", "metodo_pago", "total", "items", "estado", "created_at", "tipo_servicio"])) return no("Campos no permitidos en la venta", 403);
      if ("metodo_pago" in f && f.metodo_pago !== "" && f.metodo_pago !== null) return no("Una venta nueva no puede traer medio de pago", 403);
      if ("estado" in f && f.estado !== "pendiente") return no("Una venta nueva debe estar pendiente", 403);
      if (!entero(f.numero, 0, 9_999_999) || !texto(f.mesa, 60, 1) || !texto(f.mesero ?? "Caja", 60) || !entero(f.personas ?? 1, 0, 200)) return no("Datos de venta inválidos");
      if (f.tipo_servicio !== undefined && !texto(f.tipo_servicio, 40)) return no("Datos de venta inválidos");
      const it = validarItems(f.items); if (!it.ok) return it;
      if (f.total !== it.valor.total) return no("El total no coincide con las líneas del pedido", 422);
      salida.push({ empresa_id: f.empresa_id, numero: f.numero, mesa: f.mesa, mesero: f.mesero ?? "Caja", personas: f.personas ?? 1, metodo_pago: "", total: it.valor.total, items: it.valor.items, estado: "pendiente", created_at: ahora(), ...(f.tipo_servicio !== undefined ? { tipo_servicio: f.tipo_servicio } : {}) });
    }
    return ok({ filas: salida, accion: "ventas.crear", chequeos: ["catalogo"], filtrosExtra: [] });
  }
  // update: una sola fila de cambios; la acción se deduce del conjunto de campos
  const p = filas[0]; const k = Object.keys(p).sort().join(",");
  if (k === "estado") {
    if (!(ESTADOS_COCINA as readonly string[]).includes(p.estado as string)) return no("Estado no permitido", 403);
    return ok({ filas: [{ estado: p.estado }], accion: "ventas.estado_cocina", chequeos: [], filtrosExtra: [] });
  }
  if (k === "estado,metodo_pago") {
    if (p.estado !== "listo") return no("El cobro solo puede dejar la venta en estado listo", 403);
    const m = cobroMedio(p.metodo_pago); if (!m.ok) return m;
    return ok({ filas: [{ metodo_pago: m.valor.medio, estado: "listo" }], accion: "ventas.cobro_manual", chequeos: ["venta_sin_cobro", ...(m.valor.mixto ? ["total_coincide_mixto" as Chequeo] : [])], filtrosExtra: [{ m: "eq", a: ["metodo_pago", ""] }] });
  }
  if (k === "metodo_pago") {
    if (rol !== "admin") return no("Solo el administrador corrige medios de pago", 403);
    const m = cobroMedio(p.metodo_pago); if (!m.ok) return m;
    return ok({ filas: [{ metodo_pago: m.valor.medio }], accion: "ventas.corregir_pago", chequeos: ["venta_no_point", ...(m.valor.mixto ? ["total_coincide_mixto" as Chequeo] : [])], filtrosExtra: [{ m: "neq", a: ["metodo_pago", "Point"] }] });
  }
  if (soloClaves(p, ["mesa", "mesero", "personas", "total", "items"]) && "items" in p && "total" in p) {
    if (!texto(p.mesa ?? "x", 60, 1) || !texto(p.mesero ?? "Caja", 60) || !entero(p.personas ?? 1, 0, 200)) return no("Datos de venta inválidos");
    const it = validarItems(p.items); if (!it.ok) return it;
    if (p.total !== it.valor.total) return no("El total no coincide con las líneas del pedido", 422);
    const cambios: Fila = { total: it.valor.total, items: it.valor.items };
    for (const c of ["mesa", "mesero", "personas"]) if (c in p) cambios[c] = p[c];
    return ok({ filas: [cambios], accion: "ventas.editar_comanda", chequeos: ["catalogo", "venta_sin_cobro"], filtrosExtra: [{ m: "eq", a: ["metodo_pago", ""] }] });
  }
  return no("Cambio no permitido en ventas: use una acción válida (cocina, cobro, corrección de pago o edición de comanda)", 403);
}

function cobroMedio(v: unknown): Resultado<{ medio: string; mixto: boolean }> {
  if (typeof v === "string" && v.startsWith("Mixto")) {
    return parseMixto(v) ? ok({ medio: v, mixto: true }) : no("Detalle de pago mixto inválido");
  }
  const n = normalizarMedioPago(v);
  return n ? ok({ medio: n, mixto: false }) : no("Medio de pago no permitido", 403);
}

export function reglasPropinas(f: Fila, s: Sesion): Resultado<ResultadoCampos> {
  if (!soloClaves(f, ["empresa_id", "empleado", "monto", "metodo_pago", "cajero", "notas", "venta_id", "created_at"])) return no("Campos no permitidos en la propina", 403);
  if (!texto(f.empleado, 80, 1) || !entero(f.monto, 1, 5_000_000) || !texto(f.notas ?? "", 300)) return no("Datos de propina inválidos");
  const mp = f.metodo_pago === "Point" ? "Point" : normalizarMedioPago(f.metodo_pago ?? "Efectivo");
  if (!mp) return no("Medio de pago no permitido", 403);
  const fila: Fila = { empresa_id: f.empresa_id, empleado: f.empleado, monto: f.monto, metodo_pago: mp, cajero: s.nombre ?? "Caja", notas: f.notas ?? "", created_at: ahora() };
  const ch: Chequeo[] = [];
  if (f.venta_id !== undefined && f.venta_id !== null) { if (!texto(f.venta_id, 80, 1)) return no("venta_id inválido"); fila.venta_id = f.venta_id; ch.push("venta_del_negocio"); }
  return ok({ filas: [fila], accion: "propinas.crear", chequeos: ch, filtrosExtra: [] });
}

export function reglasCaja(tabla: "aperturas_caja" | "cierres_caja", op: "insert" | "update", f: Fila, s: Sesion): Resultado<ResultadoCampos> {
  if (tabla === "aperturas_caja" && op === "insert") {
    if (!soloClaves(f, ["empresa_id", "monto_inicial", "cajero", "estado", "fecha", "created_at"]) || !entero(f.monto_inicial, 0, MAX_MONTO) || (f.estado !== undefined && f.estado !== "abierta")) return no("Apertura inválida", 403);
    return ok({ filas: [{ empresa_id: f.empresa_id, monto_inicial: f.monto_inicial, cajero: s.nombre ?? "Admin", estado: "abierta", fecha: ahora().slice(0, 10), created_at: ahora() }], accion: "aperturas.abrir", chequeos: [], filtrosExtra: [] });
  }
  if (tabla === "aperturas_caja" && op === "update") {
    if (!soloClaves(f, ["estado", "cerrada_at"]) || f.estado !== "cerrada") return no("Solo se puede cerrar una apertura", 403);
    return ok({ filas: [{ estado: "cerrada", cerrada_at: ahora() }], accion: "aperturas.cerrar", chequeos: [], filtrosExtra: [{ m: "eq", a: ["estado", "abierta"] }] });
  }
  if (tabla === "cierres_caja" && op === "insert") {
    const nums = ["ventas_total", "ventas_efectivo", "ventas_debito", "ventas_qr", "ventas_transferencia", "efectivo_fisico", "diferencia"];
    if (!soloClaves(f, ["empresa_id", "fecha", ...nums, "notas", "apertura_id", "created_at"])) return no("Campos no permitidos en el cierre", 403);
    for (const n of nums) if (n in f && !entero(f[n], -MAX_MONTO, MAX_MONTO)) return no("Importe de cierre inválido");
    if (f.notas !== undefined && !texto(f.notas, 500)) return no("Notas inválidas");
    if (f.apertura_id !== undefined && f.apertura_id !== null && !texto(f.apertura_id, 80, 1)) return no("Apertura inválida");
    const fila: Fila = { ...f, fecha: ahora().slice(0, 10), created_at: ahora() };
    return ok({ filas: [fila], accion: "cierres.crear", chequeos: [], filtrosExtra: [] });
  }
  return no("Operación de caja no permitida", 403);
}

// Resto de tablas (solo administrador): solo valores simples y de tamaño razonable; productos con lista de campos.
export function reglasGenericas(tabla: string, filas: Fila[]): Resultado<ResultadoCampos> {
  const permitidasProductos = ["empresa_id", "categoria_id", "nombre", "precio", "disponible", "activo", "ingredientes", "descripcion", "orden"];
  for (const f of filas) {
    if (tabla === "productos") {
      if (!soloClaves(f, permitidasProductos)) return no("Campos no permitidos en productos", 403);
      if ("precio" in f && !entero(f.precio, 0, 10_000_000)) return no("Precio inválido");
      if ("nombre" in f && !texto(f.nombre, 120, 1)) return no("Nombre inválido");
    }
    for (const [k, v] of Object.entries(f)) {
      const simple = v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12) || (typeof v === "string" && v.length <= 2000);
      if (!simple) return no(`Valor no permitido en ${k}`);
    }
  }
  return ok({ filas, accion: "generica", chequeos: [], filtrosExtra: [] });
}

// Gasto: lo registra un caso de uso del servidor (app/api/gastos). Aquí solo la validación pura.
export function validarGasto(b: unknown): Resultado<{ categoria: string; descripcion: string; monto: number; afecto_caja: boolean }> {
  if (!esObj(b) || !soloClaves(b, ["categoria", "descripcion", "monto", "afecto_caja", "aprobacion"])) return no("Solicitud inválida");
  if (!texto(b.categoria, 60, 1) || !texto(b.descripcion, 300, 1) || !entero(b.monto, 1, MAX_MONTO)) return no("Datos del gasto inválidos");
  if (b.afecto_caja !== undefined && typeof b.afecto_caja !== "boolean") return no("Datos del gasto inválidos");
  return ok({ categoria: b.categoria as string, descripcion: (b.descripcion as string).trim(), monto: b.monto as number, afecto_caja: b.afecto_caja !== false });
}
export const gastoRequiereAprobacion = (rol: Sesion["rol"], monto: number) => rol !== "admin" && monto >= UMBRAL_GASTO_SIN_APROBACION;
