'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual, getSesion } from '@/lib/auth'
import AuthGuard from '@/components/AuthGuard'
import { useEmpresaNombre } from '@/lib/useEmpresaNombre'
import { cobrosDelPeriodo, etiquetaMetodo, resumenPeriodo } from '@/lib/reportes'
import { estadoPagoParaMetodo } from '@/lib/estados'

interface Venta {
  id: string
  numero: number
  mesa: string
  mesero: string
  metodo_pago: string
  tipo_servicio: string
  total: number
  items: { nombre: string; cantidad: number; precio_unit: number }[]
  created_at: string
  estado: string
  estado_pago?: string
}

interface AperturaCaja {
  id: string
  fecha: string
  monto_inicial: number
  cajero: string
  created_at: string
}

type Periodo = 'hoy' | 'semana' | 'mes' | 'dia'

export default function ReportesPage() {
  const empresaNombre = useEmpresaNombre()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [aperturas, setAperturas] = useState<AperturaCaja[]>([])
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [fechaDia, setFechaDia] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [cargando, setCargando] = useState(true)
  const [editandoPago, setEditandoPago] = useState<string | null>(null)
  const [nuevoPago, setNuevoPago] = useState('')
  // Ventas creadas antes del período pero cobradas dentro de él (para "cobros recibidos")
  const [cobrosExtra, setCobrosExtra] = useState<Venta[]>([])
  const [rango, setRango] = useState<{ desde: string; hasta: string | null }>({ desde: new Date(0).toISOString(), hasta: null })
  const esAdmin = getSesion()?.rol === 'admin'

  useEffect(() => { cargarDatos() }, [periodo, fechaDia])

  async function cargarDatos() {
    setCargando(true)
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setVentas([]); setAperturas([]); setCargando(false); return }

    const ahora = new Date()
    let desde: Date
    let hasta: Date | null = null

    if (periodo === 'hoy') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    } else if (periodo === 'semana') {
      desde = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (periodo === 'mes') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    } else {
      // dia especifico
      const [y, m, d] = fechaDia.split('-').map(Number)
      desde = new Date(y, m - 1, d, 0, 0, 0)
      hasta = new Date(y, m - 1, d + 1, 0, 0, 0)
    }

    let ventasQ = supabase.from('ventas').select('*').eq('empresa_id', empresaId).gte('created_at', desde.toISOString()).order('created_at', { ascending: false })
    let aperturasQ = supabase.from('aperturas_caja').select('*').eq('empresa_id', empresaId).gte('created_at', desde.toISOString()).order('created_at', { ascending: false })

    if (hasta) {
      ventasQ = ventasQ.lt('created_at', hasta.toISOString())
      aperturasQ = aperturasQ.lt('created_at', hasta.toISOString())
    }

    let cobrosQ = supabase.from('ventas').select('*').eq('empresa_id', empresaId).eq('estado_pago', 'pagado').gte('pagado_at', desde.toISOString())
    if (hasta) cobrosQ = cobrosQ.lt('pagado_at', hasta.toISOString())

    const [{ data: ventasData }, { data: aperturasData }, { data: cobrosData }] = await Promise.all([ventasQ, aperturasQ, cobrosQ])

    setRango({ desde: desde.toISOString(), hasta: hasta ? hasta.toISOString() : null })
    setCobrosExtra((cobrosData as Venta[]) || [])

    if (ventasData) setVentas(ventasData)
    if (aperturasData) setAperturas(aperturasData)
    setCargando(false)
  }

  async function corregirPago(id: string) {
    if (!esAdmin) { alert('Solo el administrador puede corregir pagos.'); return }
    if (!nuevoPago) { alert('Selecciona el método de pago correcto.'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    // Si la venta estaba "Sin identificar", asignarle un método es declarar que fue cobrada con ese método.
    const actual = ventas.find(v => v.id === id)
    const cambios: Record<string, string> = { metodo_pago: nuevoPago }
    if (actual?.estado_pago === 'sin_identificar') cambios.estado_pago = estadoPagoParaMetodo(nuevoPago)
    const { error } = await supabase.from('ventas').update(cambios).eq('empresa_id', empresaId).eq('id', id)
    if (error) { alert('Error al corregir pago: ' + error.message); return }
    setEditandoPago(null); setNuevoPago(''); cargarDatos()
    alert('Método de pago corregido correctamente.')
  }

  async function eliminarVenta(id: string, numero: number) {
    if (!esAdmin) { alert('Solo el administrador puede eliminar ventas.'); return }
    const motivo = prompt(`Motivo para eliminar/anular la venta #${String(numero).padStart(3, '0')}:`)
    if (!motivo) return
    const ok = confirm(`¿Seguro que deseas eliminar/anular la venta #${String(numero).padStart(3, '0')}? Esta acción afecta los reportes.`)
    if (!ok) return
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    const { error } = await supabase.from('ventas').delete().eq('empresa_id', empresaId).eq('id', id)
    if (error) { alert('Error al eliminar venta: ' + error.message); return }
    cargarDatos(); alert('Venta eliminada correctamente.')
  }

  function exportarCSV() {
    const filas = [
      ['#', 'Mesa', 'Mesero', 'Tipo', 'Método pago', 'Total', 'Estado cocina', 'Estado pago', 'Fecha'],
      ...ventas.map(v => [v.numero, v.mesa, v.mesero || '', v.tipo_servicio || '', etiquetaMetodo(v), v.total, v.estado, v.estado_pago || '', new Date(v.created_at).toLocaleString('es-CL')])
    ]
    const csv = filas.map(f => f.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${periodo === 'dia' ? fechaDia : periodo}_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.csv`
    a.click()
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  // Tres cifras distintas: registradas (comandas creadas), cobros recibidos (por fecha de cobro) y saldo pendiente.
  const resumen = resumenPeriodo(ventas, cobrosExtra, rango.desde, rango.hasta)
  const cobros = cobrosDelPeriodo([...ventas, ...cobrosExtra], rango.desde, rango.hasta)
  const totalVentas = resumen.registradas.total
  const ticketPromedio = ventas.length ? totalVentas / ventas.length : 0

  const porDia: Record<string, number> = {}
  ventas.forEach(v => {
    const dia = new Date(v.created_at).toLocaleDateString('es-CL')
    porDia[dia] = (porDia[dia] || 0) + v.total
  })
  const diasOrdenados = Object.entries(porDia).sort((a, b) => {
    const [dA, mA, yA] = a[0].split('-').map(Number)
    const [dB, mB, yB] = b[0].split('-').map(Number)
    return new Date(yB, mB - 1, dB).getTime() - new Date(yA, mA - 1, dA).getTime()
  })

  const porMetodo: Record<string, { total: number; count: number }> = {}
  // Por método: solo cobros recibidos + ventas sin identificar (las pendientes y cortesías no son cobros)
  const paraMetodo = [...cobros, ...ventas.filter(v => v.estado_pago === 'sin_identificar')]
  const totalMetodos = paraMetodo.reduce((s, v) => s + v.total, 0)
  paraMetodo.forEach(v => {
    const m = etiquetaMetodo(v)
    if (!porMetodo[m]) porMetodo[m] = { total: 0, count: 0 }
    porMetodo[m].total += v.total
    porMetodo[m].count += 1
  })

  const porTipo: Record<string, number> = {}
  ventas.forEach(v => { const t = v.tipo_servicio || 'Mesa'; porTipo[t] = (porTipo[t] || 0) + v.total })

  const conteoProductos: Record<string, { cantidad: number; ingresos: number }> = {}
  ventas.forEach(v => {
    (v.items || []).forEach(item => {
      if (!conteoProductos[item.nombre]) conteoProductos[item.nombre] = { cantidad: 0, ingresos: 0 }
      conteoProductos[item.nombre].cantidad += item.cantidad
      conteoProductos[item.nombre].ingresos += item.cantidad * item.precio_unit
    })
  })
  const topProductos = Object.entries(conteoProductos).sort((a, b) => b[1].cantidad - a[1].cantidad).slice(0, 8)

  const aperturaHoy = aperturas.length > 0 ? aperturas[aperturas.length - 1] : null

  const METODO_COLOR: Record<string, string> = {
    'Efectivo': 'var(--green)', 'Débito': 'var(--amber)', 'Transferencia': '#1D5FD1',
    'Crédito': '#7E22CE', 'Cortesía': '#BE185D',
  }

  const card = (titulo: string, valor: string, sub?: string, color?: string) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: color || 'var(--gold)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  const labelPeriodo = periodo === 'hoy' ? 'Hoy' : periodo === 'semana' ? 'Últimos 7 días' : periodo === 'mes' ? 'Este mes' : fechaDia

  return (
    <AuthGuard rolRequerido="admin">
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
        <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 3, color: 'var(--gold)' }}>{empresaNombre}</span>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
            {[['/', '🧾 Caja'], ['/cocina', '🍳 Cocina'], ['/reportes', '📊 Reportes']].map(([href, label]) => (
              <a key={href} href={href} style={{ padding: '5px 14px', borderRadius: 6, background: href === '/reportes' ? 'var(--gold)' : 'transparent', color: href === '/reportes' ? 'var(--on-accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid ' + (href === '/reportes' ? 'var(--gold)' : 'var(--border)') }}>{label}</a>
            ))}
          </nav>
        </header>

        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
          {/* Controles */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, marginRight: 8 }}>REPORTES</span>
            {(['hoy', 'semana', 'mes'] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)} style={{ padding: '6px 16px', borderRadius: 20, border: '1px solid ' + (periodo === p ? 'var(--gold)' : 'var(--border)'), background: periodo === p ? 'var(--gold)' : 'transparent', color: periodo === p ? 'var(--on-accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Últimos 7 días' : 'Este mes'}
              </button>
            ))}
            {/* Filtro por día específico */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid ' + (periodo === 'dia' ? 'var(--gold)' : 'var(--border)'), borderRadius: 20, padding: '3px 12px', background: periodo === 'dia' ? 'var(--gold-bg)' : 'transparent' }}>
              <span style={{ fontSize: 13, color: periodo === 'dia' ? 'var(--gold)' : 'var(--muted)', fontWeight: 600 }}>📅</span>
              <input
                type="date"
                value={fechaDia}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => { setFechaDia(e.target.value); setPeriodo('dia') }}
                onClick={() => setPeriodo('dia')}
                style={{ background: 'transparent', border: 'none', color: periodo === 'dia' ? 'var(--gold)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none', fontFamily: 'var(--font)' }}
              />
            </div>
            <button onClick={exportarCSV} style={{ marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              ⬇️ CSV
            </button>
          </div>

          {cargando ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Cargando...</div>
          ) : (
            <>
              {/* APERTURA DE CAJA */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>🔓 Apertura de Caja — {labelPeriodo}</div>
                  {aperturaHoy ? (
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{fmt(aperturaHoy.monto_inicial)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>monto inicial</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cajero: <strong style={{ color: 'var(--text)' }}>{aperturaHoy.cajero}</strong></div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Hora: <strong style={{ color: 'var(--text)' }}>{new Date(aperturaHoy.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</strong></div>
                      <div style={{ fontSize: 13 }}>Efectivo en caja estimado: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(aperturaHoy.monto_inicial + (porMetodo['Efectivo']?.total || 0))}</strong></div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>No se registró apertura en este período</div>
                  )}
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {card('Ventas registradas', fmt(resumen.registradas.total), `${resumen.registradas.cantidad} comandas creadas en el período`)}
                {card('Cobros recibidos', fmt(resumen.cobrado.total), `${resumen.cobrado.cantidad} cobros con fecha en el período`)}
                {card('Saldo pendiente', fmt(resumen.pendiente.total), `${resumen.pendiente.cantidad} comandas sin cobrar`)}
                {card('Ticket promedio', fmt(ticketPromedio))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {card('Sin identificar', fmt(resumen.sinIdentificar.total), `${resumen.sinIdentificar.cantidad} ventas históricas sin método`)}
                {card('Cortesías', fmt(resumen.cortesias.total), `${resumen.cortesias.cantidad} sin cobro`)}
                {card('N° comandas', String(ventas.length), 'órdenes registradas')}
                {card('Productos vendidos', String(Object.values(conteoProductos).reduce((s, p) => s + p.cantidad, 0)))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* VENTAS POR DÍA */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>📅 Ventas por Día</div>
                  {diasOrdenados.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : diasOrdenados.map(([dia, monto]) => (
                    <div key={dia} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>{dia}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 600 }}>{fmt(monto)}</span>
                    </div>
                  ))}
                  {diasOrdenados.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 13, fontWeight: 700 }}>
                      <span>Total</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(totalVentas)}</span>
                    </div>
                  )}
                </div>

                {/* POR MÉTODO DE PAGO */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>💳 Por Método de Pago</div>
                  {Object.entries(porMetodo).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : Object.entries(porMetodo).sort((a, b) => b[1].total - a[1].total).map(([metodo, data]) => (
                    <div key={metodo} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: METODO_COLOR[metodo] || 'var(--muted)' }} />
                          <span style={{ fontSize: 13 }}>{metodo}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{data.count} cmd</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: METODO_COLOR[metodo] || 'var(--gold)' }}>{fmt(data.total)}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{totalMetodos ? Math.round(data.total / totalMetodos * 100) : 0}%</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 4, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${totalMetodos ? Math.round(data.total / totalMetodos * 100) : 0}%`, background: METODO_COLOR[metodo] || 'var(--gold)', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* POR TIPO DE SERVICIO */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>🍽 Por Tipo de Servicio</div>
                  {Object.entries(porTipo).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([tipo, monto]) => {
                    const emoji = tipo === 'Para llevar' ? '🥡' : tipo === 'Delivery' ? '🚗' : '🍽'
                    return (
                      <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span>{emoji} {tipo}</span>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 600 }}>{fmt(monto)}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{totalVentas ? Math.round(monto / totalVentas * 100) : 0}%</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* TOP PRODUCTOS */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>🏆 Top Productos</div>
                  {topProductos.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</div> : topProductos.map(([nombre, data]) => (
                    <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span>{nombre}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12 }}>{data.cantidad}u — {fmt(data.ingresos)}</span>
                    </div>
                  ))}
                </div>

                {/* APERTURAS DE CAJA */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>🔓 Aperturas de Caja</div>
                  {aperturas.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin registros</div> : aperturas.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.cajero}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(a.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>{fmt(a.monto_inicial)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TABLA DE VENTAS */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Detalle de Ventas ({ventas.length})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['#', 'Mesa', 'Tipo', 'Productos', 'Método', 'Total', 'Fecha', 'Estado', ...(esAdmin ? ['Acciones'] : [])].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map(v => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>#{String(v.numero).padStart(3, '0')}</td>
                          <td style={{ padding: '9px 12px', fontSize: 13 }}>{v.mesa}</td>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)' }}>
                            {v.tipo_servicio === 'Para llevar' ? '🥡' : v.tipo_servicio === 'Delivery' ? '🚗' : '🍽'} {v.tipo_servicio || 'Mesa'}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>
                            {(v.items || []).map(i => `${i.cantidad}× ${i.nombre}`).join(', ').substring(0, 50)}{(v.items || []).length > 2 ? '...' : ''}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12 }}>
                            {editandoPago === v.id ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select value={nuevoPago} onChange={e => setNuevoPago(e.target.value)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}>
                                  <option value="">Seleccionar</option>
                                  {['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mixto', 'Cortesía'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <button onClick={() => corregirPago(v.id)} style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: 'var(--green)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                                <button onClick={() => { setEditandoPago(null); setNuevoPago('') }} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
                              </div>
                            ) : (
                              <>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: METODO_COLOR[v.metodo_pago] || 'var(--muted)', marginRight: 6 }} />
                                {etiquetaMetodo(v)}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>{fmt(v.total)}</td>
                          <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--muted)' }}>{new Date(v.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: (v.estado_pago === 'pagado' || v.estado_pago === 'cortesia') ? 'var(--green-bg)' : 'var(--gold-bg)', color: v.estado_pago === 'pagado' ? 'var(--green)' : 'var(--gold)', border: `1px solid ${v.estado === 'listo' ? 'var(--green)' : 'var(--gold)'}` }}>
                              {v.estado} · {v.estado_pago === 'pagado' ? 'pagado' : v.estado_pago === 'cortesia' ? 'cortesía' : v.estado_pago === 'sin_identificar' ? 'sin identificar' : 'sin pagar'}
                            </span>
                          </td>
                          {esAdmin && (
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => { setEditandoPago(v.id); setNuevoPago(v.metodo_pago || '') }} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✏️ Editar pago</button>
                                <button onClick={() => eliminarVenta(v.id, v.numero)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>🗑 Eliminar</button>
                              </div>
                            </td>
                          )}
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
    </AuthGuard>
  )
}
