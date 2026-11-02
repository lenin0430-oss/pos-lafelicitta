// Caso de uso del login (sin Next): límite persistente de intentos + verificación + registro sin PIN.
import { verificarAdmin, verificarGarzon, type Usuario } from "./credenciales";
import { POLITICAS, evento, hashClave, ipDeLaPeticion, limpiarCuenta, registrarFallo, segundosBloqueado } from "./limiteLogin";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
export type RespuestaLogin = { status: number; body: Record<string, unknown>; usuario?: Usuario; retryAfter?: number };

export async function atenderLogin(req: Request, db: Db, body: any): Promise<RespuestaLogin> {
  const ipH = "ip:" + hashClave(ipDeLaPeticion(req));
  const modo = body?.modo;
  if (modo !== "pin" && modo !== "admin") return { status: 400, body: { error: "Solicitud inválida" } };

  let cuentaK: string | null = null, pin = "", email = "";
  if (modo === "pin") {
    pin = String(body.pin ?? "");
    if (!/^\d{4}$/.test(pin)) { const s = await registrarFallo(db, [{ clave: ipH, politica: POLITICAS.ip }]); return s ? bloqueado(s) : { status: 401, body: { error: "PIN incorrecto" } }; }
  } else {
    email = String(body.email ?? "").toLowerCase().trim().slice(0, 200); pin = String(body.password ?? "").trim().slice(0, 64);
    if (!email || !pin) return { status: 400, body: { error: "Ingresa email y PIN" } };
    cuentaK = "cuenta:" + hashClave(email);
  }

  // 1) ¿ya bloqueado? (antes de tocar las credenciales: un bloqueo no se "prueba" con más intentos)
  const espera = await segundosBloqueado(db, cuentaK ? [ipH, cuentaK] : [ipH]);
  if (espera) { await evento(db, { tipo: "login", resultado: "bloqueado", ip_hash: ipH }); return bloqueado(espera); }

  // 2) verificar
  const usuario = modo === "pin" ? await verificarGarzon(db, pin) : await verificarAdmin(db, email, pin);
  if (!usuario) {
    const s = await registrarFallo(db, [{ clave: ipH, politica: POLITICAS.ip }, ...(cuentaK ? [{ clave: cuentaK, politica: POLITICAS.cuenta }] : [])]);
    await evento(db, { tipo: "login", resultado: "fallo", ip_hash: ipH });
    return s ? bloqueado(s) : { status: 401, body: { error: modo === "pin" ? "PIN incorrecto" : "Email o PIN incorrecto" } };
  }
  if (cuentaK) await limpiarCuenta(db, cuentaK);
  await evento(db, { tipo: "login", resultado: "ok", empresa_id: usuario.empresa_id, actor: usuario.nombre, ip_hash: ipH });
  return { status: 200, body: {}, usuario };
}
const bloqueado = (s: number): RespuestaLogin => ({ status: 429, retryAfter: s, body: { error: "Demasiados intentos. Intenta de nuevo en unos minutos." } });
