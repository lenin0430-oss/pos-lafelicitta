// Nombre y teléfono del cliente de un abono. Se guardan juntos en abonos.cliente (máx. 80) como «Nombre · Teléfono»; así no hace falta migrar la base.
const SEP = " · ";
export const limpiarNombre = (v: string) => v.replace(/[\u0000-\u001f\u007f·]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
export const limpiarTelefono = (v: string) => v.replace(/[^0-9+\- ]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
const pareceTelefono = (t: string) => /^[0-9+\- ]{6,}$/.test(t);

export function componerCliente(nombre: string, telefono: string): string {
  return [limpiarNombre(nombre), limpiarTelefono(telefono)].filter(Boolean).join(SEP);
}
export function separarCliente(c: string | null | undefined): { nombre: string; telefono: string } {
  const t = (c ?? "").trim();
  if (!t) return { nombre: "", telefono: "" };
  const p = t.split(SEP);
  if (p.length >= 2) return { nombre: p[0].trim(), telefono: p.slice(1).join(SEP).trim() };
  return pareceTelefono(t) ? { nombre: "", telefono: t } : { nombre: t, telefono: "" };
}
