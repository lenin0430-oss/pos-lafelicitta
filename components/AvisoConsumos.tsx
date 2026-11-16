'use client'
// Aviso con punto rojo: hay consumos de trabajadores sin descontar de su pago. Se ve durante todo el turno y lleva a /consumos.
// Lee /api/consumo-personal cada minuto (y cuando otra parte de la pantalla registra o descuenta un consumo). Sin pendientes: no muestra nada.
import { useCallback, useEffect, useState } from 'react'

export const EVENTO_CONSUMOS = 'lf:consumos-cambio'
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

export default function AvisoConsumos() {
  const [datos, setDatos] = useState<{ cantidad: number; total: number; trabajadores: number } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/consumo-personal', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) return
      setDatos({ cantidad: j.cantidad ?? 0, total: j.total ?? 0, trabajadores: (j.trabajadores ?? []).length })
    } catch { /* sin conexión: se conserva lo último que se vio */ }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 60000)
    const f = () => cargar()
    window.addEventListener(EVENTO_CONSUMOS, f)
    window.addEventListener('focus', f)
    return () => { clearInterval(t); window.removeEventListener(EVENTO_CONSUMOS, f); window.removeEventListener('focus', f) }
  }, [cargar])

  if (!datos || datos.cantidad === 0) return null
  return (
    <a href="/consumos" title="Consumos de trabajadores sin descontar" aria-label={`Por descontar a trabajadores: ${fmt(datos.total)}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 14, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
      Por descontar {fmt(datos.total)} · {datos.trabajadores} {datos.trabajadores === 1 ? 'trabajador' : 'trabajadores'}
    </a>
  )
}
