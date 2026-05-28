import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

const panes = [
  { nombre: 'Pan perro pequeno 70g', costo: 35, detalle: '80 unidades aprox.' },
  { nombre: 'Pan perro grande 105g', costo: 47, detalle: '60 unidades aprox.' },
  { nombre: 'Pan completo 120g', costo: 51, detalle: '55 unidades aprox.' },
  { nombre: 'Pan churrasco 150g', costo: 71, detalle: '150g exactos' },
]

export default function PanesSaladosPage() {
  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="costeo" />
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '22px 14px' }}>
          <h1 style={{ color: 'var(--gold)', fontSize: 24, fontWeight: 800, margin: 0 }}>Panes salados</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Costos calculados desde la receta: harina 3.850g, agua 1.750ml, azúcar 220g, sal 60g, levadura 20g.</p>
          {panes.map(p => (
            <div key={p.nombre} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginTop: 14 }}>
              <h2 style={{ color: 'var(--gold)', fontSize: 18, margin: '0 0 8px' }}>{p.nombre}</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>{p.detalle}</p>
              <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Costo estimado por unidad</span>
                <strong style={{ color: 'var(--gold)', fontSize: 24 }}>{fmt(p.costo)}</strong>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <a href="/panaderia" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Ver brioche</a>
            <a href="/costeo" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Ver Costeo</a>
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
