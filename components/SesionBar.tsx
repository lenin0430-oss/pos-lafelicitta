'use client'
import { useEffect, useState } from 'react'
import { getSesion, cerrarSesion } from '@/lib/auth'

export default function SesionBar() {
  const [sesion, setSesion] = useState<{ nombre: string; rol: string } | null>(null)

  useEffect(() => {
    const s = getSesion()
    if (s) setSesion({ nombre: s.nombre, rol: s.rol })
  }, [])

  if (!sesion) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {sesion.rol === 'admin' ? '🔐' : '👤'} {sesion.nombre}
      </span>
      <button
        onClick={cerrarSesion}
        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
      >
        Salir
      </button>
    </div>
  )
}
