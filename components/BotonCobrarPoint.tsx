"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  ventaId: string;
  monto: number;
  onPagado?: () => void;
};

const TEXTO: Record<string, string> = {
  created: "Enviado al Point… presiona Actualizar en la máquina",
  at_terminal: "Esperando que el cliente pague…",
  processed: "¡Pago aprobado! ✅",
  canceled: "Cobro cancelado",
  expired: "El cobro expiró",
  failed: "Pago rechazado",
};
const FINALES = ["processed", "canceled", "expired", "failed"];

export default function BotonCobrarPoint({ ventaId, monto, onPagado }: Props) {
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function cobrar() {
    setError(null);
    setEstado("enviando");
    const r = await fetch("/api/point/cobrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ventaId, monto }),
    });
    const data = await r.json();
    if (!r.ok) { setEstado(null); setError(data.error); return; }

    setEstado(data.estado);
    timer.current = setInterval(async () => {
      const s = await fetch(`/api/point/estado?orderId=${data.orderId}`).then((x) => x.json());
      if (!s.estado) return;
      setEstado(s.estado);
      if (FINALES.includes(s.estado)) {
        clearInterval(timer.current!);
        if (s.estado === "processed") onPagado?.();
      }
    }, 3000);
  }

  const ocupado = estado !== null && !FINALES.includes(estado);

  return (
    <div>
      <button
        onClick={cobrar}
        disabled={ocupado}
        style={{
          width: "100%", padding: 14, borderRadius: 10, border: "none",
          background: ocupado ? "var(--muted)" : "var(--brand-blue)", color: "#fff",
          fontSize: 15, fontWeight: 700, cursor: ocupado ? "wait" : "pointer",
        }}
      >
        {ocupado ? "Cobrando…" : `Cobrar con Point $${monto.toLocaleString("es-CL")}`}
      </button>
      {estado && estado !== "enviando" && <p>{TEXTO[estado] ?? estado}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
