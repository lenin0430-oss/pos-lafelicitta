"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";

type Terminal = { id: string; operating_mode: string };

// Pantalla para que cada restaurante conecte su Mercado Pago y elija su Point.
// El restaurante lo decide el servidor a partir de la sesión (solo admin).
export default function ConfigMercadoPago() {
  const [info, setInfo] = useState<{ conectado: boolean; elegido?: string; terminales?: Terminal[] } | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mp") === "ok") setAviso("¡Mercado Pago conectado! ✅");
    if (p.get("mp") === "error") setAviso("No se pudo conectar. Intenta de nuevo.");
    cargar();
  }, []);

  async function cargar() {
    const r = await fetch("/api/mp/terminales");
    setInfo(await r.json());
  }

  async function elegir(terminalId: string, modo?: "PDV" | "STANDALONE") {
    const r = await fetch("/api/mp/terminales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminalId, modo }),
    });
    const d = await r.json();
    setAviso(r.ok ? d.aviso ?? "Guardado ✅" : d.error);
    cargar();
  }

  return (
    <AuthGuard rolRequerido="admin">
    <main style={{ maxWidth: 560, margin: "24px auto", padding: 16 }}>
      <h1>Mercado Pago Point</h1>
      {aviso && <p><strong>{aviso}</strong></p>}

      {!info?.conectado && (
        <a href="/api/mp/conectar">
          <button>Conectar mi cuenta de Mercado Pago</button>
        </a>
      )}

      {info?.conectado && (
        <>
          <p>Cuenta conectada ✅</p>
          <h2>Tus Point</h2>
          {(info.terminales ?? []).length === 0 && <p>No encontramos Point en tu cuenta.</p>}
          {(info.terminales ?? []).map((t) => (
            <div key={t.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div><strong>Serie:</strong> {t.id.split("__").pop()}</div>
              <div><strong>Modo:</strong> {t.operating_mode === "PDV" ? "Cobra desde MesaPOS" : "Manual"}</div>
              {info.elegido === t.id ? <p>✔ Elegido para cobrar</p> : <button onClick={() => elegir(t.id)}>Usar este Point</button>}
              <button onClick={() => elegir(t.id, "PDV")}>Activar cobro desde MesaPOS</button>{" "}
              <button onClick={() => elegir(t.id, "STANDALONE")}>Volver a modo manual</button>
            </div>
          ))}
          <p style={{ fontSize: 13 }}>Después de cambiar el modo, reinicia el Point.</p>
        </>
      )}
    </main>
    </AuthGuard>
  );
}
