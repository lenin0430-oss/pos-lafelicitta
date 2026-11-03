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
