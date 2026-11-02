// Núcleo de la puerta de datos (sin Next ni Supabase reales: se inyectan para poder probarlo).
import { sesionDelServidor } from "./restaurante";
import { ejecutarPlan, planificar } from "./datosAutorizados";
import { verificarContexto } from "./contextoNegocio";

export type Deps = { db: { from: (t: string) => any }; plataformaEmpresaId?: string | null };
const MAX_BYTES = 256 * 1024;

export async function atenderDatos(req: Request, deps: Deps): Promise<{ status: number; body: unknown }> {
  const sesion = sesionDelServidor(req);
  if (!sesion) return { status: 401, body: { data: null, error: { message: "Sin sesión", code: "401" } } };
  // Defensa contra peticiones desde otros sitios (CSRF): solo JSON, y si el navegador informa el origen debe ser el propio.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return { status: 415, body: { data: null, error: { message: "Se requiere application/json", code: "415" } } };
  const sf = req.headers.get("sec-fetch-site");
  if (sf && !["same-origin", "same-site", "none"].includes(sf)) return { status: 403, body: { data: null, error: { message: "Origen no permitido", code: "403" } } };
  const origen = req.headers.get("origin");
  if (origen) { try { if (new URL(origen).host !== new URL(req.url).host) return { status: 403, body: { data: null, error: { message: "Origen no permitido", code: "403" } } }; } catch { return { status: 403, body: { data: null, error: { message: "Origen no permitido", code: "403" } } }; } }

  const texto = await req.text();
  if (texto.length > MAX_BYTES) return { status: 413, body: { data: null, error: { message: "Solicitud demasiado grande", code: "413" } } };
  let sol: unknown; try { sol = JSON.parse(texto); } catch { return { status: 400, body: { data: null, error: { message: "JSON inválido", code: "400" } } }; }

  const plan = planificar({ rol: sesion.rol, empresa_id: sesion.empresa_id, nombre: sesion.nombre }, sol, { plataformaEmpresaId: deps.plataformaEmpresaId });
  if (!plan.ok) return { status: plan.status, body: { data: null, error: { message: plan.error, code: String(plan.status) } } };
  try {
    const v = await verificarContexto(deps.db, sesion.empresa_id, plan);
    if (!v.ok) return { status: v.status, body: { data: null, error: { message: v.error, code: String(v.status) } } };
    // Condiciones adicionales (p. ej. "sin medio de pago aún") viajan como filtros del update: comprobación y escritura atómicas.
    const pasos = v.filtrosExtra.length ? [plan.pasos[0], ...v.filtrosExtra, ...plan.pasos.slice(1)] : plan.pasos;
    return { status: 200, body: await ejecutarPlan(deps.db, { ...plan, pasos }) };
  } catch (e) {
    console.error("datos:", plan.tabla, plan.operacion, (e as Error).message);
    return { status: 500, body: { data: null, error: { message: "Error interno", code: "500" } } };
  }
}
