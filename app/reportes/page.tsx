'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Venta {
  id: string
  numero: number
  mesa: string
  metodo_pago: string
  total: number
  items: { nombre: string; cantidad: number; precio_unit: number }[]
  created_at: string
  estado: string
}

type Periodo = 'hoy' | 'semana' | 'mes'

export default function ReportesPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargarVentas() }, [periodo])

  async function cargarVentas() {
    setCargando(true)
    const ahora = new Date()
    let desde: Date

    if (periodo === 'hoy') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    } else if (periodo === 'semana') {
      desde = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    }

    const { data } = await supabase
      .from('ventas')
      .select('*')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })

    if (data) setVentas(data)
    setCargando(false)
  }

  function exportarCSV() {
    const filas = [
      ['#', 'Mesa', 'Método pago', 'Total', 'Estado', 'Fecha'],
      ...ventas.map(v => [
        v.numero,
        v.mesa,
        v.metodo_pago,
        v.total,
        v.estado,
        new Date(v.created_at).toLocaleString('es-CL')
      ])
    ]
    const csv = filas.map(f => f.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${periodo}_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.csv`
    a.click()
  }

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const ticketPromedio = ventas.length ? totalVentas / ventas.length : 0
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

  // Productos más vendidos
  const conteoProductos: Record<string, { cantidad: number; ingresos: number }> = {}
  ventas.forEach(v => {
    (v.items || []).forEach(item => {
      if (!conteoProductos[item.nombre]) conteoProductos[item.nombre] = { cantidad: 0, ingresos: 0 }
      conteoProductos[item.nombre].cantidad += item.cantidad
      conteoProductos[item.nombre].ingresos += item.cantidad * item.precio_unit
    })
  })
  const topProductos = Object.entries(conteoProductos)
    .sort((a, b) => b[1].cantidad - a[1].cantidad)
    .slice(0, 8)

  // Por método de pago
  const porMetodo: Record<string, number> = {}
  ventas.forEach(v => {
    porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] || 0) + v.total
  })

  const card = (titulo: string, valor: string, sub?: string): React.ReactNode => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 3, color: 'var(--gold)' }}>LA FELICITTA</span>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
          {[['/', '🧾 Caja'], ['/cocina', '🍳 Cocina'], ['/reportes', '📊 Reportes']].map(([href, label]) => (
            <a key={href} href={href} style={{ padding: '5px 14px', borderRadius: 6, background: href === '/reportes' ? 'var(--gold)' : 'transparent', color: href === '/reportes' ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid ' + (href === '/reportes' ? 'var(--gold)' : 'var(--border)') }}>{label}</a>
          ))}
        </nav>
      </header>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        {/* Controles */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, marginRight: 8 }}>REPORTES</span>
          {(['hoy', 'semana', 'mes'] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{ padding: '6px 16px', borderRadius: 20, border: '1px solid ' + (periodo === p ? 'var(--gold)' : 'var(--border)'), background: periodo === p ? 'var(--gold)' : 'transparent', color: periodo === p ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textTransform: 'capitalize' }}>
              {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Últimos 7 días' : 'Este mes'}
            </button>
          ))}
          <button onClick={exportarCSV} style={{ marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            ⬇️ Exportar CSV
          </button>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Cargando...</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {card('Total ventas', fmt(totalVentas))}
              {card('N° comandas', String(ventas.length), 'órdenes registradas')}
              {card('Ticket promedio', fmt(ticketPromedio))}
              {card('Productos vendidos', String(Object.values(conteoProductos).reduce((s, p) => s + p.cantidad, 0)))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {/* Top productos */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Top Productos</div>
                {topProductos.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : topProductos.map(([nombre, data]) => (
                  <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{nombre}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12 }}>{data.cantidad}u — {fmt(data.ingresos)}</span>
                  </div>
                ))}
              </div>

              {/* Por método de pago */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Por Método de Pago</div>
                {Object.entries(porMetodo).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : Object.entries(porMetodo).map(([metodo, monto]) => (
                  <div key={metodo} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13 }}>{metodo}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 13 }}>{fmt(monto)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{totalVentas ? Math.round(monto / totalVentas * 100) : 0}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla de ventas */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                Detalle de Ventas ({ventas.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Mesa', 'Productos', 'Método', 'Total', 'Fecha', 'Estado'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.map(v => (
                      <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>#{String(v.numero).padStart(3, '0')}</td>
                        <td style={{ padding: '9px 12px', fontSize: 13 }}>{v.mesa}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)' }}>{(v.items || []).map(i => `${i.cantidad}× ${i.nombre}`).join(', ').substring(0, 40)}...</td>
                        <td style={{ padding: '9px 12px', fontSize: 12 }}>{v.metodo_pago}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>{fmt(v.total)}</td>
                        <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--muted)' }}>{new Date(v.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: v.estado === 'listo' ? 'rgba(76,175,125,.15)' : 'rgba(201,168,76,.1)', color: v.estado === 'listo' ? 'var(--green)' : 'var(--gold)', border: `1px solid ${v.estado === 'listo' ? 'var(--green)' : 'var(--gold)'}` }}>
                            {v.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventas.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No hay ventas en este período</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
