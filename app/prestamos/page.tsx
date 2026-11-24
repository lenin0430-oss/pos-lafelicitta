'use client'
// Préstamos de trabajadores: el administrador descuenta una cuota diaria del sueldo (lunes a sábado) y lleva el saldo.
// NO mueve la caja. Si un día se pasa sin descontar, aparece como pendiente hasta que se descuente.
import { useCallback, useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'
import { getSesion } from '@/lib/auth'
import { EVENTO_PRESTAMOS } from '@/components/AvisoPrestamos'
import type { Prestamo } from '@/lib/prestamosServidor'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fechaCorta = (f: string) => { const [y, m, d] = f.slice(0, 10).split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DIAS[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }

const caja: React.CSSProperties = { background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 15, fontFamily: 'var(--font)', boxSizing: 'border-box' }
const boton = (color: string): React.CSSProperties => ({ padding: '12px 16px', borderRadius: 10, border: 'none', background: color, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font)' })

export default function PrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [hoy, setHoy] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [form, setForm] = useState({ trabajador: '', acreedor: '', total: '', cuota: '', inicio: '', notas: '' })
  const [verHistorial, setVerHistorial] = useState<string | null>(null)

  const avisar = (txt: string, tipo: 'ok' | 'err') => { setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 6000) }

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/prestamos', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'No se pudo cargar')
      setPrestamos(j.prestamos as Prestamo[]); setHoy(j.hoy ?? null)
    } catch (e: unknown) { avisar((e as Error).message, 'err') }
    setCargando(false)
  }, [])
  useEffect(() => { const a = getSesion()?.rol === 'admin'; setEsAdmin(a); if (a) cargar(); else setCargando(false) }, [cargar])

  async function enviar(body: Record<string, unknown>) {
    setTrabajando(true)
    try {
      const r = await fetch('/api/prestamos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { avisar(j?.error || 'No se pudo guardar', 'err'); return null }
      window.dispatchEvent(new Event(EVENTO_PRESTAMOS))
      return j
    } catch { avisar('Sin conexión con el servidor', 'err'); return null }
    finally { setTrabajando(false); await cargar() }
  }

  async function descontar(p: Prestamo, fecha: string) {
    const monto = Math.min(p.cuota_diaria, p.saldo)
    if (!confirm(`¿Descontar ${fmt(monto)} del sueldo de ${p.trabajador} del ${fechaCorta(fecha)}?`)) return
    const j = await enviar({ accion: 'descontar', id: p.id, fecha })
    if (j) avisar(j.saldo === 0 ? `¡${p.trabajador} terminó de pagar el préstamo! ✓` : `${fmt(j.monto)} descontados ✓ · Le quedan ${fmt(j.saldo)}`, 'ok')
  }
  async function deshacer(p: Prestamo, d: { id: string; fecha: string; monto: number }) {
    if (!confirm(`¿Borrar el descuento de ${fmt(d.monto)} del ${fechaCorta(d.fecha)} a ${p.trabajador}?`)) return
    if (await enviar({ accion: 'deshacer', descuento_id: d.id })) avisar('Descuento borrado', 'ok')
  }
  async function crear() {
    const total = parseInt(form.total.replace(/\D/g, ''), 10), cuota = parseInt(form.cuota.replace(/\D/g, ''), 10)
    if (!form.trabajador.trim() || !(total > 0) || !(cuota > 0)) { avisar('Completa trabajador, monto total y cuota diaria', 'err'); return }
    const j = await enviar({ accion: 'crear', trabajador: form.trabajador, acreedor: form.acreedor, total, cuota, inicio: form.inicio || undefined, notas: form.notas })
    if (j) { avisar('Préstamo creado ✓', 'ok'); setNuevo(false); setForm({ trabajador: '', acreedor: '', total: '', cuota: '', inicio: '', notas: '' }) }
  }

  return (
    <AuthGuard>
      <Nav active="/prestamos" />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px 16px', fontFamily: 'var(--font)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>PRÉSTAMOS DE TRABAJADORES</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cuota que se descuenta del sueldo cada día (lunes a sábado). No entra a la caja.</div>
          {mensaje && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: mensaje.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: '1px solid ' + (mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
              color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{mensaje.txt}</div>
          )}
        </div>

        {esAdmin === false ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Solo el administrador ve los préstamos.</div>
        : cargando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div> : (
          <>
            {prestamos.length === 0 && !nuevo && (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 16 }}>No hay préstamos registrados</div>
            )}

            {prestamos.map(p => {
              const pct = Math.min(100, Math.round((p.pagado / p.monto_total) * 100))
              const faltan = Math.ceil(p.saldo / p.cuota_diaria)
              const pend = p.dias_pendientes ?? []
              return (
                <div key={p.id} style={{ ...caja, borderColor: pend.length ? 'var(--red)' : 'var(--border)', opacity: p.estado === 'pagado' ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 17 }}>{p.trabajador}</div>
                    {p.estado === 'pagado'
                      ? <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>PAGADO ✓</span>
                      : <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmt(p.cuota_diaria)} diarios</span>}
                  </div>
                  {p.acreedor && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Le debe a: {p.acreedor}</div>}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '14px 0 8px', textAlign: 'center' }}>
                    <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Préstamo</div><div style={{ fontWeight: 700 }}>{fmt(p.monto_total)}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Descontado</div><div style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(p.pagado)}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Le falta</div><div style={{ fontWeight: 800, fontSize: 18, color: p.saldo > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(p.saldo)}</div></div>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'var(--green)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {p.cuotas_pagadas} cuotas descontadas{p.saldo > 0 ? ` · faltan ${faltan}` : ''}
                  </div>

                  {pend.length > 0 && (
                    <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red)' }}>
                      <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                        {pend.length === 1 && pend[0] === hoy ? '⚠️ Falta descontar hoy' : `⚠️ ${pend.length} ${pend.length === 1 ? 'día' : 'días'} sin descontar`}
                      </div>
                      {pend.map(f => (
                        <button key={f} disabled={trabajando} onClick={() => descontar(p, f)}
                          style={{ ...boton('var(--red)'), width: '100%', marginBottom: 6, opacity: trabajando ? 0.6 : 1 }}>
                          Descontar {fmt(Math.min(p.cuota_diaria, p.saldo))} · {f === hoy ? 'HOY' : ''} {fechaCorta(f)}
                        </button>
                      ))}
                    </div>
                  )}
                  {p.estado === 'activo' && pend.length === 0 && (
                    <div style={{ marginTop: 12, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>✓ Al día</div>
                  )}

                  <button onClick={() => setVerHistorial(verHistorial === p.id ? null : p.id)}
                    style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    {verHistorial === p.id ? 'Ocultar historial' : 'Ver historial'}
                  </button>
                  {verHistorial === p.id && (
                    <div style={{ marginTop: 8 }}>
                      {p.descuentos.map(d => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                          <span>{fechaCorta(d.fecha)}</span>
                          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <b>{fmt(d.monto)}</b>
                            <button disabled={trabajando} onClick={() => deshacer(p, d)} title="Borrar este descuento"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                          </span>
                        </div>
                      ))}
                      {p.notas && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{p.notas}</div>}
                    </div>
                  )}
                </div>
              )
            })}

            {nuevo ? (
              <div style={caja}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Nuevo préstamo</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <input style={input} placeholder="Trabajador" value={form.trabajador} onChange={e => setForm({ ...form, trabajador: e.target.value })} />
                  <input style={input} placeholder="¿A quién le debe? (opcional)" value={form.acreedor} onChange={e => setForm({ ...form, acreedor: e.target.value })} />
                  <input style={input} inputMode="numeric" placeholder="Monto total ($)" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} />
                  <input style={input} inputMode="numeric" placeholder="Cuota diaria ($)" value={form.cuota} onChange={e => setForm({ ...form, cuota: e.target.value })} />
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Primer día de descuento
                    <input style={input} type="date" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} />
                  </label>
                  <input style={input} placeholder="Notas (opcional)" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={trabajando} onClick={crear} style={{ ...boton('var(--green)'), flex: 1 }}>Guardar</button>
                    <button onClick={() => setNuevo(false)} style={{ ...boton('var(--muted)'), flex: 1 }}>Cancelar</button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setNuevo(true)} style={{ ...boton('var(--navy, #1e2a4a)'), width: '100%' }}>+ Nuevo préstamo</button>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  )
}
