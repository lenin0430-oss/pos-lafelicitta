// Cliente del navegador con la misma forma que supabase-js (from().select().eq()…), pero que envía las consultas a /api/datos.
// Se activa con NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1 (ver lib/supabase.ts). No contiene llaves ni reglas de seguridad: las reglas viven en el servidor.
import type { Paso } from "./datosAutorizados";

type Real = { from: (t: string) => any };
const PUBLICAS = ["empresas", "categorias", "productos"]; // lectura pública (carta) cuando todavía no hay sesión (p. ej. pantalla de login)

async function enviar(tabla: string, pasos: Paso[]) {
  try {
    const r = await fetch("/api/datos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabla, pasos }), credentials: "same-origin" });
    const j = await r.json().catch(() => null);
    if (j && "error" in j) return { data: j.data ?? null, error: j.error ?? null, count: j.count ?? null, status: r.status };
    return { data: null, error: { message: "Respuesta inválida del servidor", code: String(r.status) }, count: null, status: r.status };
  } catch (e) {
    return { data: null, error: { message: "Sin conexión con el servidor", code: "red" }, count: null, status: 0 };
  }
}

export function crearClienteDatos(real: Real, haySesion: () => boolean) {
  const from = (tabla: string) => {
    const pasos: Paso[] = [];
    const ejecutar = () => {
      if (PUBLICAS.includes(tabla) && pasos[0]?.m === "select" && !haySesion()) {
        let q: any = real.from(tabla);
        for (const p of pasos) q = q[p.m](...p.a);
        return q;
      }
      return enviar(tabla, pasos);
    };
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop: string) {
        if (prop === "then") return (ok: any, ko: any) => Promise.resolve(ejecutar()).then(ok, ko);
        return (...a: unknown[]) => { pasos.push({ m: prop, a }); return proxy; };
      },
    });
    return proxy;
  };
  const canalNulo: any = { on: () => canalNulo, subscribe: () => canalNulo };
  return { from, channel: () => canalNulo, removeChannel: () => undefined, rpc: () => Promise.resolve({ data: null, error: { message: "rpc no disponible desde el navegador", code: "403" } }) };
}
