'use client'
import Link from 'next/link'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

export default function RecetasPage() {
  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
        <Nav active="recetas" />
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--gold)' }}>🍽️ Recetas</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
              Las recetas ahora se crean y editan desde la pantalla de Costeo para evitar duplicar insumos.
            </p>
            <Link href="/costeo" style={{ display: 'block', textAlign: 'center', padding: '12px 14px', borderRadius: 10, background: 'var(--gold)', color: '#000', fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
              Ir a Costeo →
            </Link>
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
