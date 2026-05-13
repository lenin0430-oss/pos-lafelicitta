'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface ResumenVentas {
  total: number
  efectivo: number
  debito: number
  qr: number
  transferencia: number
  cantidad: number
}

interface CierreCaja {
  id: string
  fecha: string
  ventas_total: number
  ventas_efectivo: number
  ventas_debito: number
  ventas_qr: number
  ventas_transferencia: number
  efectivo_fisico: number
  diferencia: number
  notas: string
  created_at: string
}

export default function CierrePage() {
  const [resumen, setResumen] = useState<ResumenVentas>({ total: 0, efectivo: 0, debito: 0, qr: 0, transferencia: 0, cantidad: 0 })
  const [efectivoFisico, setEfectivoFisico] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cierres, setCierres] = useState<CierreCaja[]>([])
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [tab, setTab] = useState<'nuevo' | 'historial'>('nuevo')
  const [montoApertura, setMontoApertura] = useState('')
  const [aperturaHoy, setAperturaHoy] = useState<{ id: string; monto_inicial: number; created_at: string } | null>(null)
  const [guardandoApertura, setGuardandoApertura] = useState(false)

  useEffect(() => {
    cargarVentasHoy()
    cargarCierres()
    cargarAperturaHoy()
  }, [])

  async function cargarAperturaHoy() {
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
    const { data } = await supabase
      .from('aperturas_caja')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (data) setAperturaHoy(data)
  }

  async function registrarApertura() {
    const monto = parseInt(montoApertura) || 0
    setGuardandoApertura(true)
    const { error } = await supabase.from('aperturas_caja').insert({
      monto_inicial: monto,
      cajero: 'Lenin',
      fecha: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    })
    if (error) {
      mostrarMensaje('Error al abrir caja: ' + error.message, 'err')
    } else {
      mostrarMensaje('✅ Caja abierta — Adriana ya puede tomar pedidos', 'ok')
      cargarAperturaHoy()
      setMontoApertura('')
    }
    setGuardandoApertura(false)
  }

  async function cargarVentasHoy() {
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString()

    const { data } = await supabase
      .from('ventas')
      .select('*')
      .gte('created_at', desde)
      .lt('created_at', hasta)

    if (!data) return

    const res: ResumenVentas = { total: 0, efectivo: 0, debito: 0, qr: 0, transferencia: 0, cantidad: data.length }
    data.forEach(v => {
      res.total += v.total
      const mp = (v.metodo_pago || '').toLowerCase()
      if (mp.includes('efectivo')) res.efectivo += v.total
      else if (mp.includes('débito') || mp.includes('debito')) res.debito += v.total
      else if (mp.includes('qr') || mp.includes('mercado')) res.qr += v.total
      else if (mp.includes('transfer')) res.transferencia += v.total
      else res.efectivo += v.total
    })
    setResumen(res)
  }

  async function cargarCierres() {
    const { data } = await supabase
      .from('cierres_caja')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setCierres(data)
  }

  async function registrarCierre() {
    const fisico = parseInt(efectivoFisico) || 0
    const diferencia = fisico - resumen.efectivo
    setGuardando(true)
    const { error } = await supabase.from('cierres_caja').insert({
      fecha: new Date().toISOString().split('T')[0],
      ventas_total: resumen.total,
      ventas_efectivo: resumen.efectivo,
      ventas_debito: resumen.debito,
      ventas_qr: resumen.qr,
      ventas_transferencia: resumen.transferencia,
      efectivo_fisico: fisico,
      diferencia,
      notas,
      created_at: new Date().toISOString()
    })
    if (error) {
      mostrarMensaje('Error: ' + error.message, 'err')
    } else {
      mostrarMensaje('Cierre registrado ✓', 'ok')
      cargarCierres()
      setTimeout(() => {
        window.print()
        setEfectivoFisico('')
        setNotas('')
      }, 400)
    }
    setGuardando(false)
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  const fisico = parseInt(efectivoFisico) || 0
  const diferencia = fisico - resumen.efectivo
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const fechaHoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const horaActual = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return (
    <AuthGuard rolRequerido="admin">
      <>
        {/* PRINT */}
        <div id="cierre-print" style={{ display: 'none' }}>
          <div className="t-logo">LA FELICITTA</div>
          <div className="t-sub">@lafelicittacl</div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span><strong>CIERRE DE CAJA</strong></span>
            <span>{fechaHoy}</span>
            <span>Hora: {horaActual}</span>
          </div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span>Comandas del día: {resumen.cantidad}</span>
            <span>Efectivo: {fmt(resumen.efectivo)}</span>
            <span>Débito: {fmt(resumen.debito)}</span>
            <span>QR MercadoPago: {fmt(resumen.qr)}</span>
            <span>Transferencia: {fmt(resumen.transferencia)}</span>
          </div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span><strong>TOTAL VENTAS: {fmt(resumen.total)}</strong></span>
            <span>Efectivo esperado: {fmt(resumen.efectivo)}</span>
            <span>Efectivo físico: {fmt(fisico)}</span>
            <span><strong>DIFERENCIA: {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}</strong></span>
          </div>
          {notas && <><hr className="t-divider" /><div className="t-meta"><span>Notas: {notas}</span></div></>}
          <hr className="t-divider" />
          <div className="t-footer">Firma: _______________<br />¡Gracias por tu trabajo hoy!</div>
        </div>

        <div className="no-print" style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)', paddingBottom: 80 }}>
          <Nav active="/cierre" />

          <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
            {mensaje && (
              <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 12, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(217,79,61,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                {mensaje.txt}
              </div>
            )}

            {/* APERTURA DE CAJA */}
            <div style={{ background: aperturaHoy ? 'rgba(76,175,125,.08)' : 'rgba(217,79,61,.08)', border: `1px solid ${aperturaHoy ? 'var(--green)' : 'var(--red)'}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>
                {aperturaHoy ? '✅ Caja Abierta' : '🔴 Caja Cerrada — Abre la caja primero'}
              </div>
              {aperturaHoy ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{fmt(aperturaHoy.monto_inicial)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      Apertura: {new Date(aperturaHoy.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>Adriana puede vender ✓</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Efectivo inicial en caja</label>
                    <input
                      type="number"
                      value={montoApertura}
                      onChange={e => setMontoApertura(e.target.value)}
                      placeholder="Ej: 30000"
                      style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 18, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                  <button
                    onClick={registrarApertura}
                    disabled={guardandoApertura || !montoApertura}
                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}
                  >
                    {guardandoApertura ? '...' : '🔓 Abrir Caja'}
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
              {[['nuevo', '🔒 Nuevo Cierre'], ['historial', '📋 Historial']].map(([val, label]) => (
                <button key={val} onClick={() => setTab(val as 'nuevo' | 'historial')} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: tab === val ? 'var(--gold)' : 'transparent', color: tab === val ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{label}</button>
              ))}
            </div>

            {tab === 'nuevo' && (
              <>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 }}>Fecha del cierre</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{fechaHoy}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{resumen.cantidad} comandas registradas hoy</div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>Ventas del día</div>
                  {[
                    { label: '💵 Efectivo', valor: resumen.efectivo, color: '#4caf7d' },
                    { label: '💳 Débito', valor: resumen.debito, color: '#4a9fd4' },
                    { label: '📱 QR MercadoPago', valor: resumen.qr, color: '#9b59b6' },
                    { label: '🏦 Transferencia', valor: resumen.transferencia, color: '#e8a32c' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, color: item.color }}>{item.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: item.valor > 0 ? 'var(--text)' : 'var(--muted)' }}>{fmt(item.valor)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', alignItems: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>TOTAL VENTAS</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{fmt(resumen.total)}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>Arqueo de caja</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>¿Cuánto efectivo hay físicamente en caja?</label>
                    <input
                      type="number"
                      value={efectivoFisico}
                      onChange={e => setEfectivoFisico(e.target.value)}
                      placeholder="0"
                      style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '12px', fontFamily: 'var(--mono)', fontSize: 22, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                  {efectivoFisico && (
                    <div style={{ background: diferencia === 0 ? 'rgba(76,175,125,.1)' : diferencia > 0 ? 'rgba(74,159,212,.1)' : 'rgba(217,79,61,.1)', border: `1px solid ${diferencia === 0 ? 'var(--green)' : diferencia > 0 ? 'var(--blue)' : 'var(--red)'}`, borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {diferencia === 0 ? '✅ Cuadra perfecto' : diferencia > 0 ? '📈 Sobrante en caja' : '📉 Faltante en caja'}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: diferencia === 0 ? 'var(--green)' : diferencia > 0 ? 'var(--blue)' : 'var(--red)' }}>
                          {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                        Esperado: {fmt(resumen.efectivo)} · Físico: {fmt(fisico)}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Notas (opcional)</label>
                  <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones del cierre..." style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>

                <button onClick={registrarCierre} disabled={guardando || !efectivoFisico} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: !efectivoFisico ? 'var(--surface2)' : 'var(--gold)', color: !efectivoFisico ? 'var(--muted)' : '#000', fontSize: 16, fontWeight: 700, cursor: !efectivoFisico ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: !efectivoFisico ? 0.5 : 1 }}>
                  {guardando ? 'Guardando...' : '🔒 Cerrar Caja e Imprimir'}
                </button>
              </>
            )}

            {tab === 'historial' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cierres.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay cierres registrados</div>
                ) : cierres.map(c => (
                  <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{fmt(c.ventas_total)}</div>
                        <div style={{ fontSize: 11, color: c.diferencia === 0 ? 'var(--green)' : c.diferencia > 0 ? 'var(--blue)' : 'var(--red)', fontFamily: 'var(--mono)' }}>
                          {c.diferencia >= 0 ? '+' : ''}{fmt(c.diferencia)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                      <span>💵 Efectivo: {fmt(c.ventas_efectivo)}</span>
                      <span>💳 Débito: {fmt(c.ventas_debito)}</span>
                      <span>📱 QR: {fmt(c.ventas_qr)}</span>
                      <span>🏦 Transfer: {fmt(c.ventas_transferencia)}</span>
                    </div>
                    {c.notas && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>📝 {c.notas}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    </AuthGuard>
  )
}
