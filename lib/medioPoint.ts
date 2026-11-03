// Medio de pago informado por Mercado Pago en una orden Point. Solo valores CONOCIDOS; todo lo demás → null
// (el cobro queda "por conciliar" y la cajera lo confirma con el comprobante). Nunca se agrupa como QR por defecto.
// Nota: la documentación de Mercado Pago solo muestra `credit_card`; `debit_card` y `qr` se aceptan por convención
// y deben confirmarse con una orden real de la cuenta Point (pendiente).
export type MedioPoint = "credito" | "debito" | "qr";

export function medioDesdeOrden(orden: unknown): MedioPoint | null {
  const pagos = (orden as { transactions?: { payments?: unknown[] } } | null)?.transactions?.payments;
  if (!Array.isArray(pagos) || pagos.length !== 1) return null; // 0 o varios pagos: no se adivina
  const tipo = String((pagos[0] as { payment_method?: { type?: unknown } })?.payment_method?.type ?? "").toLowerCase();
  if (tipo === "credit_card") return "credito";
  if (tipo === "debit_card") return "debito";
  if (tipo === "qr") return "qr";
  return null;
}
