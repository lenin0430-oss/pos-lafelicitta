'use client'
import { useEffect, useState } from 'react'
import { getSesion } from '@/lib/auth'

const LINKS_ADMIN = [
  { href: '/', label: '🧾 Caja' },
  { href: '/cocina', label: '🍳 Cocina' },
  { href: '/gastos', label: '💸 Gastos' },
  { href: '/reportes', label: '📊 Reportes' },
  { href: '/costeo', label: '💰 Costeo' },
  { href: '/stock', label: '📦 Stock' },
  { href: '/cierre', label: '🔒 Cierre' },
]

const LINKS_GARZON = [
  { href: '/', label: '🧾 Caja' },
  { href: '/cocina', label: '🍳 Cocina' },
  { href: '/gastos', label: '💸 Gastos' },
  { href: '/cierre', label: '🔒 Cierre' },
]

export default function Nav({ active }: { active: string }) {
  const [hora, setHora] = useState('')
  const [links, setLinks] = useState(LINKS_GARZON)

  useEffect(() => {
    const sesion = getSesion()
    setLinks(sesion?.rol === 'admin' ? LINKS_ADMIN : LINKS_GARZON)
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--gold)' }}>LA FELICITTA</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{hora}</span>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
        {links.map(link => (
          <a key={link.href} href={link.href} style={{
            flex: 1, textAlign: 'center', padding: '10px 8px', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
            borderBottom: active === link.href ? '2px solid var(--gold)' : '2px solid transparent',
            color: active === link.href ? 'var(--gold)' : 'var(--muted)',
            background: 'transparent', transition: 'color .15s',
          }}>
            {link.label}
          </a>
        ))}
      </div>
    </header>
  )
}
