'use client'
// Aviso con punto rojo: hay cuotas de préstamos de trabajadores por descontar (hoy o días anteriores que se pasaron).
// Solo lo ve el administrador. Lee /api/prestamos cada minuto. Sin pendientes: no muestra nada.
import { useCallback, useEffect, useState } from 'react'
import { getSesion } from '@/lib/auth'

export const EVENTO_PRESTAMOS = 'lf:prestamos-cambio'
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

type P = { trabajador: string; cuota_diaria: number; saldo: number; dias_pendientes: string[] }

export default function AvisoPrestamos() {
  const [pend, setPend] = useState<{ dias: number; monto: number; nombres: string[] } | null>(null)

  const cargar = useCallback(async () => {
    if (getSesion()?.rol !== 'admin') { setPend(null); return }
    try {
      const r = await fetch('/api/prestamos', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) return
      const ps = ((j.prestamos ?? []) as P[]).filter(p => p.dias_pendientes?.length > 0)
      let dias = 0, monto = 0
      for (const p of ps) {
        dias += p.dias_pendientes.length
        monto += Math.min(p.dias_pendientes.length * p.cuota_diaria, p.saldo)
      }
      setPend({ dias, monto, nombres: ps.map(p => p.trabajador.split(' ')[0]) })
    } catch { /* sin conexión: se conserva lo último que se vio */ }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 60000)
    const f = () => cargar()
    window.addEventListener(EVENTO_PRESTAMOS, f)
    window.addEventListener('focus', f)
    return () => { clearInterval(t); window.removeEventListener(EVENTO_PRESTAMOS, f); window.removeEventListener('focus', f) }
  }, [cargar])

  if (!pend || pend.dias === 0) return null
  const atrasado = pend.dias > pend.nombres.length
  return (
    <a href="/prestamos" title="Cuotas de préstamo por descontar del sueldo" aria-label={`Préstamo por descontar: ${fmt(pend.monto)}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 14, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
      Descontar préstamo {fmt(pend.monto)} · {pend.nombres.join(', ')}{atrasado ? ` · ${pend.dias} días` : ''}
    </a>
  )
}
