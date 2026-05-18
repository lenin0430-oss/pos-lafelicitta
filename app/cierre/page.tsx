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

interface AperturaCaja {
  id: string
  monto_inicial: number
  cajero: string
  estado: string
  created_at: string
  cerrada_at: string | null
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
  apertura_id: string | null
}

export default function CierrePage() {
  const [resumen, setResumen] = useState<ResumenVentas>({ total: 0, efectivo: 0, debito: 0, qr: 0, transferencia: 0, cantidad: 0 })
  const [resumenTurno, setResumenTurno] = useState<ResumenVentas>({ total: 0, efectivo: 0, debito: 0, qr: 0, transferencia: 0, cantidad: 0 })
  const [efectivoFisico, setEfectivoFisico] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cierres, setCierres] = useState<CierreCaja[]>([])
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [tab, setTab] = useState<'nuevo' | 'historial'>('nuevo')
  const [montoApertura, setMontoApertura] = useState('')
  const [aperturaActiva, setAperturaActiva] = useState<AperturaCaja | null>(null)
  const [todasAperturasHoy, setTodasAperturasHoy] = useState<AperturaCaja[]>([])
  const [guardandoApertura, setGuardandoApertura] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    await Promise.all([
      cargarAperturaActiva(),
      cargarVentasHoy(),
      cargarCierres()
    ])
  }

  async function cargarAperturaActiva() {
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()

    // Traer todas las aperturas de hoy
    const { data } = await supabase
      .from('aperturas_caja')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })

    if (data) {
      setTodasAperturasHoy(data)
      // La activa es la primera con estado 'abierta'
      const activa = data.find(a => a.estado === 'abierta') || null
      setAperturaActiva(activa)

      // Si hay apertura activa, cargar ventas del turno
      if (activa) {
        await cargarVentasTurno(activa.id, activa.created_at)
      }
    }
  }

  async function cargarVentasTurno(aperturaId: string, desde: string) {
    // Ventas desde la apertura hasta ahora (o hasta el cierre del turno)
    const { data } = await supabase
      .from('ventas')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: true })

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
    setResumenTurno(res)
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
      .limit(20)
    if (data) setCierres(data)
  }

  async function registrarApertura() {
    const monto = parseInt(montoApertura) || 0
    setGuardandoApertura(true)

    // Obtener nombre del cajero de la sesión
    let cajero = 'Admin'
    try {
      const { getSesion } = await import('@/lib/auth')
      const sesion = getSesion()
      cajero = sesion?.nombre || 'Admin'
    } catch { /* sin sesión */ }

    const turnoNum = todasAperturasHoy.length + 1

    const { error } = await supabase.from('aperturas_caja').insert({
      monto_inicial: monto,
      cajero,
      estado: 'abierta',
      fecha: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    })

    if (error) {
      mostrarMensaje('Error al abrir caja: ' + error.message, 'err')
    } else {
      mostrarMensaje(`✅ Turno ${turnoNum} abierto — caja lista para vender`, 'ok')
      setMontoApertura('')
      await cargarDatos()
    }
    setGuardandoApertura(false)
  }

  async function cerrarTurnoActual() {
    if (!aperturaActiva) return
    if (!efectivoFisico) { mostrarMensaje('Ingresa el efectivo físico', 'err'); return }

    const fisico = parseInt(efectivoFisico) || 0
    const diferencia = fisico - resumenTurno.efectivo
    setCerrando(true)

    try {
      // 1. Registrar cierre
      const { error: errCierre } = await supabase.from('cierres_caja').insert({
        fecha: new Date().toISOString().split('T')[0],
        ventas_total: resumenTurno.total,
        ventas_efectivo: resumenTurno.efectivo,
        ventas_debito: resumenTurno.debito,
        ventas_qr: resumenTurno.qr,
        ventas_transferencia: resumenTurno.transferencia,
        efectivo_fisico: fisico,
        diferencia,
        notas,
        apertura_id: aperturaActiva.id,
        created_at: new Date().toISOString()
      })
      if (errCierre) throw errCierre

      // 2. Marcar apertura como cerrada
      const { error: errAp } = await supabase
        .from('aperturas_caja')
        .update({ estado: 'cerrada', cerrada_at: new Date().toISOString() })
        .eq('id', aperturaActiva.id)
      if (errAp) throw errAp

      mostrarMensaje('✅ Turno cerrado correctamente', 'ok')
      setEfectivoFisico('')
      setNotas('')
      await cargarDatos()
      await cargarCierres()
      setTimeout(() => window.print(), 400)

    } catch (e: unknown) {
      mostrarMensaje('Error: ' + (e as Error).message, 'err')
    }
    setCerrando(false)
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  const fisico = parseInt(efectivoFisico) || 0
  const diferencia = fisico - resumenTurno.efectivo
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const fechaHoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const horaActual = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const turnoActualNum = todasAperturasHoy.findIndex(a => a.id === aperturaActiva?.id) + 1 || todasAperturasHoy.length + 1

  const inp = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <AuthGuard rolRequerido="admin">
      <>
        {/* PRINT CIERRE */}
        <div id="cierre-print" style={{ display: 'none' }}>
          <div className="t-logo">LA FELICITTA</div>
          <div className="t-sub">@lafelicittacl</div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span><strong>CIERRE DE TURNO {turnoActualNum}</strong></span>
            <span>{fechaHoy}</span>
            <span>Hora: {horaActual}</span>
          </div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span>Comandas del turno: {resumenTurno.cantidad}</span>
            <span>Efectivo: {fmt(resumenTurno.efectivo)}</span>
            <span>Débito: {fmt(resumenTurno.debito)}</span>
            <span>QR MercadoPago: {fmt(resumenTurno.qr)}</span>
            <span>Transferencia: {fmt(resumenTurno.transferencia)}</span>
          </div>
          <hr className="t-divider" />
          <div className="t-meta">
            <span><strong>TOTAL TURNO: {fmt(resumenTurno.total)}</strong></span>
            <span>Efectivo esperado: {fmt(resumenTurno.efectivo)}</span>
            <span>Efectivo físico: {fmt(fisico)}</span>
            <span><strong>DIFERENCIA: {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}</strong></span>
          </div>
          {todasAperturasHoy.length > 0 && (
            <>
              <hr className="t-divider" />
              <div className="t-meta">
                <span><strong>TOTAL ACUMULADO DÍA: {fmt(resumen.total)}</strong></span>
                <span>Turnos completados hoy: {todasAperturasHoy.filter(a => a.estado === 'cerrada').length + 1}</span>
              </div>
            </>
          )}
          {notas && <><hr className="t-divider" /><div className="t-meta"><span>Notas: {notas}</span></div></>}
          <hr className="t-divider" />
          <div className="t-footer">Firma: _______________<br />¡Gracias por tu trabajo!</div>
        </div>

        <div className="no-print" style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)', paddingBottom: 80 }}>
          <Nav active="/cierre" />

          <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
            {mensaje && (
              <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 12, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(217,79,61,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                {mensaje.txt}
              </div>
            )}

            {/* RESUMEN DÍA si hay múltiples turnos */}
            {todasAperturasHoy.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const }}>Acumulado del día</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{fmt(resumen.total)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{resumen.cantidad} comandas</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {todasAperturasHoy.filter(a => a.estado === 'cerrada').length} turno(s) cerrado(s)
                    {aperturaActiva ? ' · 1 activo' : ''}
                  </div>
                </div>
              </div>
            )}

            {/* ESTADO CAJA ACTUAL */}
            <div style={{ background: aperturaActiva ? 'rgba(76,175,125,.08)' : 'rgba(217,79,61,.08)', border: `1px solid ${aperturaActiva ? 'var(--green)' : 'var(--red)'}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {aperturaActiva ? (
                <>
                  <div style={{ fontSize: 11, color: 'var(--green)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10, fontWeight: 600 }}>
                    ✅ Turno {turnoActualNum} en curso
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{fmt(aperturaActiva.monto_inicial)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Apertura: {new Date(aperturaActiva.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{resumenTurno.cantidad} ventas · {fmt(resumenTurno.total)}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Abierta ✓</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--red)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10, fontWeight: 600 }}>
                    🔴 Sin turno activo
                    {todasAperturasHoy.length > 0 ? ` — ${todasAperturasHoy.length} turno(s) completado(s) hoy` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                        Efectivo inicial — Turno {todasAperturasHoy.length + 1}
                      </label>
                      <input
                        type="number"
                        value={montoApertura}
                        onChange={e => setMontoApertura(e.target.value)}
                        placeholder="Ej: 30000"
                        style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 18 }}
                      />
                    </div>
                    <button
                      onClick={registrarApertura}
                      disabled={guardandoApertura}
                      style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}
                    >
                      {guardandoApertura ? '...' : '🔓 Abrir Turno'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
              {[['nuevo', '🔒 Cerrar Turno'], ['historial', '📋 Historial']].map(([val, label]) => (
                <button key={val} onClick={() => setTab(val as 'nuevo' | 'historial')}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: tab === val ? 'var(--gold)' : 'transparent', color: tab === val ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'nuevo' && (
              <>
                {!aperturaActiva ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔴</div>
                    No hay un turno activo.<br />Abre un turno arriba para poder cerrar.
                  </div>
                ) : (
                  <>
                    {/* Info turno actual */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 }}>Turno {turnoActualNum}</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{fechaHoy}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Desde: {new Date(aperturaActiva.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {resumenTurno.cantidad} comandas
                      </div>
                    </div>

                    {/* Ventas del turno */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>Ventas del turno</div>
                      {[
                        { label: '💵 Efectivo', valor: resumenTurno.efectivo, color: '#4caf7d' },
                        { label: '💳 Débito', valor: resumenTurno.debito, color: '#4a9fd4' },
                        { label: '📱 QR MercadoPago', valor: resumenTurno.qr, color: '#9b59b6' },
                        { label: '🏦 Transferencia', valor: resumenTurno.transferencia, color: '#e8a32c' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, color: item.color }}>{item.label}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: item.valor > 0 ? 'var(--text)' : 'var(--muted)' }}>{fmt(item.valor)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', alignItems: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>TOTAL TURNO</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{fmt(resumenTurno.total)}</span>
                      </div>
                    </div>

                    {/* Arqueo */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>Arqueo de caja</div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>¿Cuánto efectivo hay físicamente?</label>
                        <input
                          type="number"
                          value={efectivoFisico}
                          onChange={e => setEfectivoFisico(e.target.value)}
                          placeholder="0"
                          style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 22 }}
                        />
                      </div>
                      {efectivoFisico && (
                        <div style={{ background: diferencia === 0 ? 'rgba(76,175,125,.1)' : diferencia > 0 ? 'rgba(74,159,212,.1)' : 'rgba(217,79,61,.1)', border: `1px solid ${diferencia === 0 ? 'var(--green)' : diferencia > 0 ? '#4a9fd4' : 'var(--red)'}`, borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                              {diferencia === 0 ? '✅ Cuadra perfecto' : diferencia > 0 ? '📈 Sobrante' : '📉 Faltante'}
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: diferencia === 0 ? 'var(--green)' : diferencia > 0 ? '#4a9fd4' : 'var(--red)' }}>
                              {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                            Esperado: {fmt(resumenTurno.efectivo)} · Físico: {fmt(fisico)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Notas (opcional)</label>
                      <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones del turno..." style={inp} />
                    </div>

                    <button
                      onClick={cerrarTurnoActual}
                      disabled={cerrando || !efectivoFisico}
                      style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: !efectivoFisico ? 'var(--surface2)' : 'var(--gold)', color: !efectivoFisico ? 'var(--muted)' : '#000', fontSize: 16, fontWeight: 700, cursor: !efectivoFisico ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: !efectivoFisico ? 0.5 : 1 }}>
                      {cerrando ? 'Cerrando...' : `🔒 Cerrar Turno ${turnoActualNum} e Imprimir`}
                    </button>
                  </>
                )}
              </>
            )}

            {tab === 'historial' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cierres.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay cierres registrados</div>
                ) : cierres.map((c, idx) => (
                  <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>Turno</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{fmt(c.ventas_total)}</div>
                        <div style={{ fontSize: 11, color: c.diferencia === 0 ? 'var(--green)' : c.diferencia > 0 ? '#4a9fd4' : 'var(--red)', fontFamily: 'var(--mono)' }}>
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

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #cierre-print, #cierre-print * { visibility: visible; }
            #cierre-print { position: fixed; top: 0; left: 0; width: 100%; background: white; }
          }
        `}</style>
      </>
    </AuthGuard>
  )
}
