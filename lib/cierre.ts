import { estaPagada } from "./estados";

export type ResumenVentas = {
  total: number;
  efectivo: number;
  debito: number;
  qr: number;
  transferencia: number;
  cantidad: number;
};

type VentaCierre = {
  total: number;
  metodo_pago?: string | null;
  estado?: string | null;
  estado_pago?: string | null;
};

export const resumenVacio = (): ResumenVentas => ({ total: 0, efectivo: 0, debito: 0, qr: 0, transferencia: 0, cantidad: 0 });

// Suma SOLO ventas pagadas; el estado de preparación/entrega no influye.
// "Point" (Mercado Pago) se agrupa en qr, igual que "Mercado Pago"/"QR".
export function resumirVentasPagadas(ventas: VentaCierre[]): ResumenVentas {
  const pagadas = ventas.filter(estaPagada);
  const res: ResumenVentas = { ...resumenVacio(), cantidad: pagadas.length };
  for (const v of pagadas) {
    const mp = (v.metodo_pago || "").toLowerCase();
    if (!mp) continue;
    res.total += v.total;
    // "mixto" se evalúa primero: "Mixto: Efectivo $1.000 + Débito $4.000" también contiene "efectivo".
    if (mp.includes("mixto")) {
      for (const p of mp.split("+")) {
        const num = parseInt(p.replace(/[^0-9]/g, "")) || 0;
        if (p.includes("efectivo")) res.efectivo += num;
        else if (p.includes("débito") || p.includes("debito")) res.debito += num;
        else if (p.includes("transfer")) res.transferencia += num;
        else if (p.includes("qr") || p.includes("mercado") || p.includes("point")) res.qr += num;
      }
    }
    else if (mp.includes("efectivo")) res.efectivo += v.total;
    else if (mp.includes("débito") || mp.includes("debito")) res.debito += v.total;
    else if (mp.includes("qr") || mp.includes("mercado") || mp.includes("point")) res.qr += v.total;
    else if (mp.includes("transfer")) res.transferencia += v.total;
  }
  return res;
}
