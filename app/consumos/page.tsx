'use client'
// Consumos de trabajadores: lo que cada uno consumió y se le descuenta de su pago. NO entra a la caja.
// El administrador marca «Descontado» al pagarle (migración 12) y entrega el comprobante en pantalla o impreso.
import { useCallback, useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'
import { getSesion } from '@/lib/auth'
import { EVENTO_CONSUMOS } from '@/components/AvisoConsumos'
import type { TrabajadorPendiente } from '@/lib/consumoPersonalServidor'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
const folio = (n: number | null) => '#' + String(n ?? 0).padStart(3, '0')

type Comprobante = { trabajador: string; total: number; consumos: TrabajadorPendiente['consumos']; descontado: boolean; emitido: string }

export default function ConsumosPage() {
  const [grupos, setGrupos] = useState<TrabajadorPendiente[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [comprobante, setComprobante] = useState<Comprobante | null>(null)
  const [esAdmin, setEsAdmin] = useState(false)

  const avisar = (txt: string, tipo: 'ok' | 'err') => { setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 6000) }

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/consumo-personal', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'No se pudo cargar')
      setGrupos(j.trabajadores as TrabajadorPendiente[]); setTotal(j.total ?? 0)
    } catch (e: unknown) { avisar((e as Error).message, 'err') }
    setCargando(false)
  }, [])
  useEffect(() => { setEsAdmin(getSesion()?.rol === 'admin'); cargar() }, [cargar])

  const armar = (g: TrabajadorPendiente, descontado: boolean): Comprobante => ({ trabajador: g.trabajador, total: g.total, consumos: g.consumos, descontado, emitido: new Date().toISOString() })

  async function descontar(g: TrabajadorPendiente) {
    if (!confirm(`¿Descontar ${fmt(g.total)} del pago de ${g.trabajador}?\n${g.cantidad} ${g.cantidad === 1 ? 'consumo' : 'consumos'}. Quedan marcados como descontados.`)) return
    setTrabajando(g.trabajador)
    try {
      const r = await fetch('/api/consumo-personal', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'descontar', ids: g.consumos.map(c => c.id) }) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { avisar(j?.error || 'No se pudo marcar como descontado', 'err'); setTrabajando(null); await cargar(); return }
      setComprobante(armar(g, true))   // el comprobante se arma con lo que se vio en pantalla; la base ya guardó el descuento
      window.dispatchEvent(new Event(EVENTO_CONSUMOS))
      avisar(`${fmt(j.monto)} descontados a ${g.trabajador} ✓`, 'ok')
      await cargar()
    } catch { avisar('Sin conexión con el servidor', 'err') }
    setTrabajando(null)
  }

  return (
    <AuthGuard>
      <Nav active="/consumos" />
      <div className="no-print" style={{ maxWidth: 620, margin: '0 auto', padding: '20px 16px', fontFamily: 'var(--font)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>CONSUMOS DE TRABAJADORES</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Lo que cada trabajador consumió y se le descuenta de su pago. No entra a la caja.</div>
          {mensaje && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: mensaje.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: '1px solid ' + (mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
              color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{mensaje.txt}</div>
          )}
        </div>

        {cargando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div> : grupos.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12 }}>No hay consumos por descontar ✓</div>
        ) : (
          <>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total por descontar ({grupos.length} {grupos.length === 1 ? 'trabajador' : 'trabajadores'})</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>{fmt(total)}</span>
            </div>
            {!esAdmin && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Solo el administrador marca los consumos como descontados.</div>}
            {grupos.map(g => (
              <div key={g.trabajador} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{g.trabajador}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{g.cantidad} {g.cantidad === 1 ? 'consumo' : 'consumos'} sin descontar</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>A descontar</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{fmt(g.total)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0', fontFamily: 'var(--mono)' }}>
                  {g.consumos.map(c => (
                    <div key={c.id} style={{ marginBottom: 4 }}>
                      {fechaHora(c.fecha)} · {folio(c.numero)} · {c.items.length ? c.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ') : (c.mesa || 'Sin detalle')} · {fmt(c.monto)}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {esAdmin && (
                    <button disabled={trabajando === g.trabajador} onClick={() => descontar(g)}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--green)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: trabajando === g.trabajador ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: trabajando === g.trabajador ? 0.6 : 1 }}>
                      {trabajando === g.trabajador ? 'Registrando…' : `✓ Descontar ${fmt(g.total)}`}
                    </button>
                  )}
                  <button onClick={() => setComprobante(armar(g, false))}
                    style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>🧾 Resumen</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {comprobante && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(11,37,69,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, maxHeight: '90dvh', overflow: 'auto', fontFamily: 'var(--font)' }}>
            <div style={{ fontSize: 13, color: comprobante.descontado ? 'var(--green)' : 'var(--gold)', fontWeight: 700, marginBottom: 10 }}>
              {comprobante.descontado ? '✓ Descuento registrado' : 'Resumen — aún no descontado'}
            </div>
            <ComprobanteVista c={comprobante} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => window.print()} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--gold)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>🖨️ Imprimir</button>
              <button onClick={() => setComprobante(null)} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      {/* Copia para impresión: lo único visible al imprimir (ticket angosto, igual que las demás impresiones) */}
      {comprobante && <div id="comprobante-print" aria-hidden><ComprobanteVista c={comprobante} imprimir /></div>}

      <style>{`
        #comprobante-print { display: none; }
        @media print {
          body * { visibility: hidden; }
          .no-print { display: none !important; }
          #comprobante-print { display: block; visibility: visible; position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 8px; }
          #comprobante-print * { visibility: visible; color: black !important; }
        }
      `}</style>
    </AuthGuard>
  )
}

function ComprobanteVista({ c, imprimir = false }: { c: Comprobante; imprimir?: boolean }) {
  const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: imprimir ? 12 : 12 }
  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 2, fontSize: 14 }}>COMPROBANTE DE CONSUMO</div>
      <div style={{ textAlign: 'center', fontSize: 11, color: imprimir ? 'black' : 'var(--muted)', marginBottom: 10 }}>Descuento del pago · no es un cobro de caja</div>
      <div style={{ fontSize: 13, marginBottom: 2 }}>Trabajador: <strong>{c.trabajador}</strong></div>
      <div style={{ fontSize: 12, color: imprimir ? 'black' : 'var(--muted)', marginBottom: 10 }}>Emitido: {fechaHora(c.emitido)} · {c.descontado ? 'Descontado del pago de hoy' : 'Pendiente de descontar'}</div>
      <div style={{ borderTop: '1px dashed currentColor', borderBottom: '1px dashed currentColor', padding: '8px 0' }}>
        {c.consumos.map(x => (
          <div key={x.id} style={{ marginBottom: 6 }}>
            <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{fechaHora(x.fecha)} · {folio(x.numero)}</span><span>{fmt(x.monto)}</span>
            </div>
            {x.items.length > 0 && <div style={{ fontSize: 11, paddingLeft: 8 }}>{x.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 8 }}>
        <span>{c.descontado ? 'TOTAL DESCONTADO' : 'TOTAL A DESCONTAR'}</span><span style={mono}>{fmt(c.total)}</span>
      </div>
      <div style={{ marginTop: imprimir ? 28 : 14, fontSize: 11, color: imprimir ? 'black' : 'var(--muted)' }}>Firma del trabajador: ______________________</div>
    </div>
  )
}
