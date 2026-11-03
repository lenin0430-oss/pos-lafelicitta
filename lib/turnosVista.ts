// Reglas de presentación del cierre (puras, probadas). Con Point por confirmar el efectivo esperado puede cambiar:
// la diferencia es PROVISIONAL y nunca debe presentarse como un faltante o sobrante definitivo.
type ResumenMin = { pendientes: { cobros_por_conciliar: number }; esperado: { por_conciliar: number } };

export const esProvisional = (x: ResumenMin | null | undefined): boolean =>
  Boolean(x && (x.pendientes?.cobros_por_conciliar > 0 || x.esperado?.por_conciliar > 0));

// Texto de la diferencia de efectivo: diff = contado − esperado.
export function textoDiferenciaEfectivo(diff: number, provisional: boolean): string {
  const signo = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const monto = "$" + Math.abs(Math.round(diff)).toLocaleString("es-CL");
  if (provisional) return `Diferencia PROVISIONAL: ${signo}${monto}`;
  return diff === 0 ? "Cuadra" : diff > 0 ? `Sobran ${monto}` : `Faltan ${monto}`;
}

// Lo que impide cerrar el turno (lo calcula y valida la base dentro del cierre; esto solo lo presenta).
export type Bloqueo = { tipo: string; venta_id: string; numero: number | null; mesa: string | null; monto: number; motivo: string; ir: "cocina" | "caja" | "cierre"; cobro_id?: string };
export const TITULO_BLOQUEO: Record<string, string> = {
  comanda_sin_entregar: "Comandas sin entregar", venta_sin_cobrar: "Ventas sin cobrar",
  point_en_proceso: "Pagos Point en proceso", cobro_medio_sin_confirmar: "Cobros con medio por confirmar",
};
export const RUTA_BLOQUEO: Record<string, { href: string; texto: string }> = {
  cocina: { href: "/cocina", texto: "Ir a Cocina" }, caja: { href: "/", texto: "Ir a Caja" }, cierre: { href: "#por-confirmar", texto: "Confirmar medio aquí" },
};
export function agruparBloqueos(b: Bloqueo[] | null | undefined): { tipo: string; titulo: string; items: Bloqueo[] }[] {
  const g: Record<string, Bloqueo[]> = {};
  for (const x of b ?? []) (g[x.tipo] ??= []).push(x);
  return Object.keys(g).map((tipo) => ({ tipo, titulo: TITULO_BLOQUEO[tipo] ?? tipo, items: g[tipo] }));
}
export const etiquetaBloqueo = (x: Bloqueo) =>
  `${x.numero != null ? `Comanda #${x.numero}` : "Venta"}${x.mesa ? ` · mesa ${x.mesa}` : ""} · $${Math.round(x.monto).toLocaleString("es-CL")} — ${x.motivo}`;

// Folios internos (los asigna la base; no son numeración tributaria del SII). Históricos sin folio: null → no se muestra.
export const folioTexto = (n: number | null | undefined, ancho = 4): string => (n == null ? "" : String(n).padStart(ancho, "0"));
export const etiquetaFolio = (prefijo: string, n: number | null | undefined): string => (n == null ? "" : `${prefijo} N° ${folioTexto(n)}`);
