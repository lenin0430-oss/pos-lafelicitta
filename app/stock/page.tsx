'use client'
import Link from 'next/link'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

export default function StockPage() {
  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
        <Nav active="stock" />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: 'var(--gold)' }}>📦 Control de Stock</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 18px' }}>
              Para crear, editar, corregir categorías, cambiar precios y cargar insumos base usa el administrador completo.
            </p>
            <Link href="/stock-admin" style={{ display: 'block', textAlign: 'center', padding: '13px 16px', borderRadius: 10, background: 'var(--gold)', color: '#000', fontWeight: 900, textDecoration: 'none' }}>
              Abrir administrador editable de insumos
            </Link>
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
