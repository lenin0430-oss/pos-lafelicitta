'use client'
import { useCallback, useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'
import { separarCliente } from '@/lib/clienteAbono'

type Abono = { monto: number; medio: string; at: string }
type PorCobrar = { venta_id: string; numero: number | null; mesa: string | null; total: number; creada: string; abonado: number; saldo: number; cliente: string | null; abonos: Abono[] }

const MEDIOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'credito', label: 'Crédito' },
]
const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
const nombreMedio = (id: string) => MEDIOS.find(m => m.id === id)?.label ?? id

export default function PorCobrarPage() {
  const [ventas, setVentas] = useState<PorCobrar[]>([])
  const [cargando, setCargando] = useState(true)
  const [medio, setMedio] = useState<Record<string, string>>({})
  const [abonoMonto, setAbonoMonto] = useState<Record<string, string>>({})
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)

  const avisar = (txt: string, tipo: 'ok' | 'err') => { setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 5000) }

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/abonos', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'No se pudo cargar')
      setVentas(j.ventas as PorCobrar[])
    } catch (e: unknown) { avisar((e as Error).message, 'err') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function enviar(v: PorCobrar, cuerpo: Record<string, unknown>, ok: string) {
    setTrabajando(v.venta_id)
    try {
      const r = await fetch('/api/abonos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venta_id: v.venta_id, ...cuerpo }) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { avisar(j?.error || 'No se pudo registrar', 'err'); setTrabajando(null); return }
      avisar(ok, 'ok')
      setAbonoMonto(a => ({ ...a, [v.venta_id]: '' }))
      await cargar()
    } catch { avisar('Sin conexión con el servidor', 'err') }
    setTrabajando(null)
  }

  const totalSaldo = ventas.reduce((s, v) => s + v.saldo, 0)
  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%' }

  return (
    <AuthGuard>
      <Nav active="/por-cobrar" />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px 16px', fontFamily: 'var(--font)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>POR COBRAR</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Ventas con abono: el saldo se cobra aquí, cuando el cliente pague</div>
          {mensaje && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: mensaje.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: '1px solid ' + (mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
              color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{mensaje.txt}</div>
          )}
        </div>

        {cargando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div> : ventas.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12 }}>No hay saldos por cobrar ✓</div>
        ) : (
          <>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total por cobrar ({ventas.length})</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{fmt(totalSaldo)}</span>
            </div>
            {ventas.map(v => {
              const m = medio[v.venta_id] || ''
              const c = separarCliente(v.cliente)
              const ocupado = trabajando === v.venta_id
              const monto = parseInt(abonoMonto[v.venta_id] || '0') || 0
              const abonoOk = !!m && monto > 0 && monto < v.saldo
              return (
                <div key={v.venta_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700 }}>{c.nombre || ('#' + String(v.numero ?? 0).padStart(3, '0') + ' · ' + (v.mesa || 'Sin nombre'))}</div>
                      {c.telefono && <div style={{ fontSize: 13, marginTop: 2 }}>📞 {c.telefono}</div>}
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{c.nombre ? '#' + String(v.numero ?? 0).padStart(3, '0') + ' · ' + (v.mesa || 'Sin nombre') + ' · ' : ''}{new Date(v.creada).toLocaleDateString('es-CL')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Saldo</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{fmt(v.saldo)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontFamily: 'var(--mono)' }}>
                    Total {fmt(v.total)} · Abonado {fmt(v.abonado)}
                    {v.abonos.map((a, i) => <div key={i}>↳ {fmt(a.monto)} {nombreMedio(a.medio)} · {new Date(a.at).toLocaleDateString('es-CL')}</div>)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
                    {MEDIOS.map(x => (
                      <button key={x.id} onClick={() => setMedio(s => ({ ...s, [v.venta_id]: x.id }))}
                        style={{ padding: '7px 14px', borderRadius: 20, border: '1px solid ' + (m === x.id ? 'var(--gold)' : 'var(--border)'), background: m === x.id ? 'var(--gold)' : 'var(--surface2)', color: m === x.id ? 'var(--on-accent)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{x.label}</button>
                    ))}
                  </div>
                  <button disabled={!m || ocupado} onClick={() => { if (confirm(`¿Cobrar el saldo de ${fmt(v.saldo)} en ${nombreMedio(m)}?`)) enviar(v, { accion: 'cobrar_saldo', medio: m }, `Saldo de ${fmt(v.saldo)} cobrado ✓`) }}
                    style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: m ? 'var(--green)' : 'var(--surface2)', color: m ? 'var(--on-accent)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: m && !ocupado ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)', opacity: m ? 1 : 0.6 }}>
                    {ocupado ? 'Registrando…' : `✓ Cobrar saldo ${fmt(v.saldo)}`}
                  </button>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                    <input inputMode="numeric" value={abonoMonto[v.venta_id] || ''} onChange={e => setAbonoMonto(a => ({ ...a, [v.venta_id]: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Otro abono (monto)" style={inp} />
                    <button disabled={!abonoOk || ocupado} onClick={() => enviar(v, { accion: 'abonar', monto, medio: m, cliente: v.cliente || undefined }, `Abono de ${fmt(monto)} registrado ✓`)}
                      style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: abonoOk ? 'var(--gold)' : 'var(--surface2)', color: abonoOk ? 'var(--on-accent)' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: abonoOk && !ocupado ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>Abonar</button>
                  </div>
                  {monto >= v.saldo && monto > 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>Un abono debe ser menor al saldo; para pagar todo usa «Cobrar saldo».</div>}
                </div>
              )
            })}
          </>
        )}
      </div>
    </AuthGuard>
  )
}
