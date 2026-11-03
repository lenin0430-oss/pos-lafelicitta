'use client'
// Caja por turnos. Un turno empieza al abrirlo y termina SOLO al confirmar «Cerrar turno» (puede pasar de medianoche).
// Pasos: 1 abrir con fondo contado → 2 registrar cobros/gastos (otras pantallas) y retiros aquí → 3 contar y comprobar → 4 confirmar.
// El navegador solo manda lo contado; el servidor recalcula esperado y diferencia con lo guardado.
import { useCallback, useEffect, useRef, useState } from 'react'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

type Medios = { efectivo: number; debito: number; credito: number; transferencia: number; qr: number; por_conciliar: number }
type Resumen = {
  turno: { id: string; estado: string; fecha_apertura: string; apertura_at: string; cierre_at: string | null; cajero: string; horas_abiertas: number }
  fondo: number; cobros: Medios & { cortesia: number }; gastos_caja: number; gastos_otros_medios: number; retiros: number
  propinas_registradas: number; esperado: Medios
  pendientes: { cobros_por_conciliar: number; monto_por_conciliar: number; ventas_sin_cobrar: number }
}
type Cobro = { id: string; monto: number; proveedor: string; hora: string; comanda: number | null; mesa: string | null; mesero: string | null; referencia: string | null }
type Cierre = { id: string; fecha_apertura: string; apertura_at: string; cierre_at: string; con_pendientes: boolean; notas: string | null; medios: { medio: string; esperado: number; contado: number | null; diferencia: number | null }[] }

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Santiago' })
const NOMBRE: Record<string, string> = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR', por_conciliar: 'Point por confirmar' }
const ELECTRONICOS = ['debito', 'credito', 'transferencia', 'qr'] as const
const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v.replace(/\D/g, '')) || 0)))

async function api(metodo: 'GET' | 'POST', cuerpo?: unknown, q = '') {
  const r = await fetch('/api/turno' + q, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, ...(await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }))) } as any
}

export default function CierrePage() {
  const [res, setRes] = useState<Resumen | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [porConc, setPorConc] = useState<Cobro[]>([])
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null)
  const [fondo, setFondo] = useState('')
  const [ret, setRet] = useState({ monto: '', motivo: '', para: '' })
  const [cont, setCont] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cerrado, setCerrado] = useState<any>(null)
  const [hist, setHist] = useState<Cierre[]>([])

  const visto = useRef<string>('')   // resumen que la cajera tiene en pantalla (para detectar cambios de otro equipo)
  const cargar = useCallback(async () => {
    const r = await api('GET')
    if (r.ok) {
      const firma = JSON.stringify(r.resumen?.esperado ?? null)
      if (visto.current && visto.current !== firma) { setConfirmando(false); setMsg({ t: 'Entraron cobros o gastos nuevos en este turno. Revisa las cifras actualizadas antes de cerrar.', ok: false }) }
      visto.current = firma
      setRes(r.resumen ?? null); setAbierto(Boolean(r.abierto)); setPorConc(r.por_conciliar ?? [])
    } else setMsg({ t: r.error ?? 'No se pudo leer el turno', ok: false })
    const h = await api('GET', undefined, '?historial=1')
    if (h.ok) setHist(h.cierres)
    setCargando(false)
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)   // otros equipos pueden cobrar o gastar
    const f = () => cargar()
    window.addEventListener('focus', f)
    return () => { clearInterval(t); window.removeEventListener('focus', f) }
  }, [cargar])
  useEffect(() => { setClave(crypto.randomUUID()) }, [res?.turno.id]) // misma clave en cada reintento del mismo cierre

  async function accion(cuerpo: Record<string, unknown>, okMsg: string) {
    setOcupado(true); setMsg(null)
    const r = await api('POST', cuerpo)
    setOcupado(false)
    if (r.ok) { setMsg({ t: okMsg, ok: true }); await cargar() } else setMsg({ t: r.error ?? 'No se pudo completar', ok: false })
    return r
  }

  const efEsp = res?.esperado.efectivo ?? 0
  const efCont = num(cont.efectivo ?? '')
  const diff = efCont === null ? null : efCont - efEsp
  const faltaMedio = res ? ELECTRONICOS.filter(m => res.esperado[m] > 0 && num(cont[m] ?? '') === null) : []

  async function cerrar() {
    if (!res || efCont === null) return
    const contados: Record<string, number> = { efectivo: efCont }
    for (const m of ELECTRONICOS) { const v = num(cont[m] ?? ''); if (v !== null) contados[m] = v }
    setOcupado(true)
    const r = await api('POST', { accion: 'cerrar', turno_id: res.turno.id, contados, notas, clave, esperado_visto: res.esperado })
    setOcupado(false)
    if (!r.ok) {
      if (r.codigo === 'resumen_cambio' && r.resumen) { setRes(r.resumen); visto.current = JSON.stringify(r.resumen.esperado) }
      setMsg({ t: r.error ?? 'No se pudo cerrar', ok: false }); setConfirmando(false); return
    }
    setCerrado(r); setConfirmando(false); setCont({}); setNotas(''); await cargar()
    try { // aviso al dueño (mismo canal de antes); los "por confirmar" NO se cuentan como QR
      const x = r.resumen
      await fetch('/api/cierre-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        cajero: x.turno.cajero, fecha: new Date(x.turno.apertura_at).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        hora_apertura: hora(x.turno.apertura_at), hora_cierre: hora(x.turno.cierre_at),
        ventas_total: Object.values(x.cobros as Record<string, number>).reduce((a, b) => a + b, 0) - x.cobros.cortesia,
        ventas_efectivo: x.cobros.efectivo, ventas_debito: x.cobros.debito + x.cobros.credito, ventas_qr: x.cobros.qr, ventas_transferencia: x.cobros.transferencia,
        efectivo_fisico: contados.efectivo, efectivo_esperado: x.esperado.efectivo, diferencia: contados.efectivo - x.esperado.efectivo,
        fondo_inicial: x.fondo, gastos_caja: x.gastos_caja, notas }) })
    } catch { /* el cierre ya quedó guardado */ }
  }

  const card: React.CSSProperties = { background: 'var(--card, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 12, padding: 16, marginBottom: 14 }
  const inp: React.CSSProperties = { padding: 10, fontSize: 18, borderRadius: 8, border: '1px solid var(--border, #bbb)', width: '100%', boxSizing: 'border-box' }
  const btn = (principal = true): React.CSSProperties => ({ padding: '12px 18px', fontSize: 16, fontWeight: 700, borderRadius: 10, border: principal ? 'none' : '1px solid var(--border, #bbb)', background: principal ? 'var(--gold, #c8962a)' : 'transparent', color: principal ? '#000' : 'inherit', cursor: ocupado ? 'wait' : 'pointer' })

  return (
    <AuthGuard rolRequerido="admin">
      <>
        <Nav active="/cierre" />
        <main style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Caja y turno</h1>
          {msg && <div role="status" style={{ ...card, borderColor: msg.ok ? 'var(--green, #2a9d5c)' : 'var(--red, #d33)' }}>{msg.t}</div>}
          {cargando && <p>Cargando…</p>}

          {!cargando && !abierto && (
            <section style={card} aria-label="Abrir turno">
              <h2 style={{ fontSize: 18 }}>1 · Abrir turno</h2>
              <p style={{ opacity: .8 }}>Cuenta el efectivo que hay en la caja ahora. El turno seguirá abierto, aunque pase de medianoche, hasta que lo cierres.</p>
              <input style={inp} inputMode="numeric" placeholder="Fondo contado (ej. 20000)" value={fondo} onChange={e => setFondo(e.target.value)} aria-label="Fondo contado" />
              <div style={{ marginTop: 12 }}><button style={btn()} disabled={ocupado || num(fondo) === null} onClick={() => accion({ accion: 'abrir', fondo: num(fondo) }, 'Turno abierto').then(r => r.ok && setFondo(''))}>Abrir turno</button></div>
            </section>
          )}

          {!cargando && abierto && res && (<>
            <section style={card} aria-label="Turno abierto">
              <div style={{ fontSize: 13, opacity: .75 }}>TURNO ABIERTO</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Turno del {dia(res.turno.apertura_at)}</div>
              <div>Abierto a las {hora(res.turno.apertura_at)} · lleva {res.turno.horas_abiertas.toFixed(1)} h · fondo {fmt(res.fondo)}</div>
              <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>Todo lo que se cobre, gaste o retire queda en este turno hasta «Cerrar turno». A las 00:00 no cambia nada.</div>
              {res.turno.horas_abiertas > 16 && <div style={{ color: 'var(--red, #d33)', marginTop: 6 }}>Este turno lleva más de 16 horas abierto: revisa si olvidaste cerrarlo.</div>}
            </section>

            <section style={card} aria-label="Resumen del turno">
              <h2 style={{ fontSize: 18 }}>2 · Lo registrado</h2>
              {(['efectivo', 'debito', 'credito', 'transferencia', 'qr', 'por_conciliar'] as const).map(m => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>{NOMBRE[m]}</span><b>{fmt(res.cobros[m])}</b></div>))}
              <hr />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Gastos que salieron de la caja</span><b>−{fmt(res.gastos_caja)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Retiros</span><b>−{fmt(res.retiros)}</b></div>
              {res.gastos_otros_medios > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', opacity: .7 }}><span>Gastos pagados fuera de la caja (no restan)</span><b>{fmt(res.gastos_otros_medios)}</b></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, marginTop: 6 }}><span>Efectivo que debería haber</span><b>{fmt(efEsp)}</b></div>
              {res.pendientes.ventas_sin_cobrar > 0 && <p style={{ color: 'var(--gold, #c8962a)' }}>Hay {res.pendientes.ventas_sin_cobrar} venta(s) sin cobrar en este turno.</p>}
            </section>

            {porConc.length > 0 && (
              <section style={card} aria-label="Cobros Point por confirmar">
                <h2 style={{ fontSize: 18 }}>Cobros Point por confirmar</h2>
                <p style={{ opacity: .8 }}>Point no informó con qué pagó el cliente. Mira el comprobante y elige el medio; no se asume.</p>
                {porConc.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
                    <b style={{ minWidth: 80 }}>{fmt(c.monto)}</b>
                    <span style={{ fontSize: 13, opacity: .8, flexBasis: '100%' }}>Comanda {c.comanda ? `#${c.comanda}` : '—'}{c.mesa ? ` · mesa ${c.mesa}` : ''} · {hora(c.hora)}{c.mesero ? ` · ${c.mesero}` : ''}{c.referencia ? ` · ref …${c.referencia}` : ''}</span>
                    {(['efectivo', 'debito', 'credito', 'qr'] as const).map(m => <button key={m} style={btn(false)} disabled={ocupado} onClick={() => accion({ accion: 'conciliar', turno_id: res.turno.id, cobro_id: c.id, medio: m }, 'Cobro confirmado')}>{NOMBRE[m]}</button>)}
                  </div>))}
              </section>
            )}

            <section style={card} aria-label="Registrar retiro">
              <h2 style={{ fontSize: 18 }}>Retiro de efectivo</h2>
              <p style={{ opacity: .8 }}>Efectivo que sale de la caja y no es un gasto (por ejemplo, entrega al dueño). Los gastos se registran en «Gastos».</p>
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={inp} inputMode="numeric" placeholder="Monto" value={ret.monto} onChange={e => setRet({ ...ret, monto: e.target.value })} aria-label="Monto del retiro" />
                <input style={inp} placeholder="Motivo" value={ret.motivo} onChange={e => setRet({ ...ret, motivo: e.target.value })} aria-label="Motivo del retiro" />
                <input style={inp} placeholder="Entregado a (opcional)" value={ret.para} onChange={e => setRet({ ...ret, para: e.target.value })} aria-label="Entregado a" />
                <div><button style={btn(false)} disabled={ocupado || !num(ret.monto) || !ret.motivo.trim()} onClick={() => accion({ accion: 'retiro', turno_id: res.turno.id, monto: num(ret.monto), motivo: ret.motivo, entregado_a: ret.para }, 'Retiro registrado').then(r => r.ok && setRet({ monto: '', motivo: '', para: '' }))}>Registrar retiro</button></div>
              </div>
            </section>

            <section style={card} aria-label="Cerrar turno">
              <h2 style={{ fontSize: 18 }}>3 · Contar y comprobar</h2>
              <label>Efectivo contado (obligatorio)
                <input style={inp} inputMode="numeric" value={cont.efectivo ?? ''} onChange={e => setCont({ ...cont, efectivo: e.target.value })} aria-label="Efectivo contado" /></label>
              {diff !== null && <p style={{ fontSize: 18, color: diff === 0 ? 'var(--green, #2a9d5c)' : 'var(--red, #d33)' }}>Esperado {fmt(efEsp)} · {diff === 0 ? 'cuadra' : diff > 0 ? `sobran ${fmt(diff)}` : `faltan ${fmt(-diff)}`}</p>}
              {ELECTRONICOS.filter(m => res.esperado[m] > 0).map(m => (
                <label key={m} style={{ display: 'block', marginTop: 8 }}>{NOMBRE[m]} comprobado (esperado {fmt(res.esperado[m])})
                  <input style={inp} inputMode="numeric" value={cont[m] ?? ''} onChange={e => setCont({ ...cont, [m]: e.target.value })} aria-label={`${NOMBRE[m]} comprobado`} /></label>))}
              {res.esperado.por_conciliar > 0 && <p style={{ color: 'var(--gold, #c8962a)' }}>Quedan {fmt(res.esperado.por_conciliar)} de Point por confirmar. Puedes cerrar, pero el cierre quedará marcado «con pendientes».</p>}
              <textarea style={{ ...inp, marginTop: 8, fontSize: 15 }} placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} aria-label="Notas" />
              <h2 style={{ fontSize: 18, marginTop: 12 }}>4 · Confirmar</h2>
              {!confirmando
                ? <button style={btn()} disabled={ocupado || efCont === null} onClick={() => setConfirmando(true)}>Cerrar turno</button>
                : <div role="alertdialog" aria-label="Confirmar cierre">
                    <p><b>¿Cerrar el turno ahora ({hora(new Date().toISOString())})?</b> Después no se podrá modificar.{faltaMedio.length > 0 && ` Sin comprobar: ${faltaMedio.map(m => NOMBRE[m]).join(', ')}.`}</p>
                    <button style={btn()} disabled={ocupado} onClick={cerrar}>Sí, cerrar turno</button>{' '}
                    <button style={btn(false)} disabled={ocupado} onClick={() => setConfirmando(false)}>Volver</button></div>}
            </section>
          </>)}

          {cerrado?.ok && (
            <section style={{ ...card, borderColor: 'var(--green, #2a9d5c)' }} aria-label="Turno cerrado">
              <h2 style={{ fontSize: 18 }}>Turno cerrado{cerrado.repetido ? ' (ya estaba cerrado)' : ''}</h2>
              <div>Abierto {hora(cerrado.resumen.turno.apertura_at)} · cerrado {hora(cerrado.resumen.turno.cierre_at)}{cerrado.con_pendientes ? ' · con pendientes' : ''}</div>
              <button style={{ ...btn(false), marginTop: 8 }} onClick={() => window.print()}>Imprimir</button>
            </section>
          )}

          {hist.length > 0 && (
            <section style={card} aria-label="Historial de cierres">
              <h2 style={{ fontSize: 18 }}>Cierres anteriores</h2>
              {hist.map(c => (
                <details key={c.id} style={{ padding: '6px 0' }}>
                  <summary>Turno del {dia(c.apertura_at)} · {hora(c.apertura_at)}–{hora(c.cierre_at)}{c.con_pendientes ? ' · con pendientes' : ''}</summary>
                  {c.medios.filter(m => m.esperado !== 0 || m.contado !== null).map(m => (
                    <div key={m.medio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{NOMBRE[m.medio] ?? m.medio}</span>
                      <span>esperado {fmt(m.esperado)} · contado {m.contado === null ? 'sin comprobar' : fmt(m.contado)}{m.diferencia !== null && m.diferencia !== 0 ? ` · dif. ${m.diferencia > 0 ? '+' : '−'}${fmt(Math.abs(m.diferencia))}` : ''}</span></div>))}
                </details>))}
            </section>
          )}
        </main>
      </>
    </AuthGuard>
  )
}
