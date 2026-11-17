'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual, getSesion, esAdmin } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

type Gasto = {
  id: string
  categoria: string
  descripcion: string
  monto: number
  cajero: string
  apertura_id: string
  afecto_caja: boolean
  pagado_por?: string | null
  created_at: string
}

const CATEGORIAS = ['Ingredientes / Insumos', 'Sueldos', 'Servicios', 'Varios']
const ADMIN_PIN = '0000'

export default function GastosPage() {
  const [categoria, setCategoria] = useState('Ingredientes / Insumos')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [afectoCaja, setAfectoCaja] = useState(true)
  // Quién puso la plata: '' = la caja / el negocio; un nombre = un trabajador con su dinero (queda «por devolver»).
  const [pagadoPor, setPagadoPor] = useState('')
  const [pagoTrabajador, setPagoTrabajador] = useState(false)
  const [pendientes, setPendientes] = useState<{ persona: string; pendiente: number; gastos: number }[]>([])
  const [pagando, setPagando] = useState<string | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState<{txt: string, tipo: 'ok'|'err'} | null>(null)
  const [pinAdmin, setPinAdmin] = useState('')
  const [esperandoPin, setEsperandoPin] = useState(false)
  const [gastosPendiente, setGastoPendiente] = useState<{categoria: string, descripcion: string, monto: number} | null>(null)

  // Filtros
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroCajero, setFiltroCajero] = useState('todos')

  const sesion = getSesion()
  const isAdmin = esAdmin()

  useEffect(() => { cargarGastos() }, [filtroFecha, filtroCategoria, filtroCajero])
  useEffect(() => { cargarPendientes() }, [])

  async function cargarPendientes() {
    try {
      const r = await fetch('/api/reembolsos', { credentials: 'same-origin', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.ok) setPendientes(j.pendientes || [])
    } catch { /* sin conexión: se reintenta al recargar */ }
  }

  async function pagarA(persona: string, monto: number) {
    if (!confirm(`¿Pagar ${fmt(monto)} a ${persona} desde la caja?\nQueda registrado como retiro del turno.`)) return
    setPagando(persona)
    try {
      const r = await fetch('/api/reembolsos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona }) })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.ok) mostrarMensaje(`Pagado ${fmt(j.monto)} a ${j.persona} ✓`, 'ok')
      else mostrarMensaje(j?.error || 'No se pudo pagar', 'err')
    } catch { mostrarMensaje('Sin conexión con el servidor', 'err') }
    setPagando(null)
    cargarPendientes()
  }

  async function cargarGastos() {
    setCargando(true)
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setCargando(false); return }

    const desde = new Date(filtroFecha + 'T00:00:00').toISOString()
    const hasta = new Date(filtroFecha + 'T23:59:59').toISOString()

    let query = supabase
      .from('gastos')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: false })

    if (filtroCategoria !== 'todas') query = query.eq('categoria', filtroCategoria)
    if (filtroCajero !== 'todos') query = query.eq('cajero', filtroCajero)

    const { data } = await query
    setGastos(data || [])
    setCargando(false)
  }

  function mostrarMensaje(txt: string, tipo: 'ok'|'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3500)
  }

  // El gasto lo valida y registra el SERVIDOR (/api/gastos): importe, autor y fecha salen de la sesión; un garzón con
  // monto >= 30.000 necesita una aprobación de administrador de un solo uso (token que emite /api/admin/verificar-pin).
  async function guardarGasto(cat: string, desc: string, mon: number, aprobacion?: string) {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa', 'err'); return }

    setGuardando(true)
    const r = await fetch('/api/gastos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria: cat, descripcion: desc, monto: mon, afecto_caja: pagoTrabajador ? false : afectoCaja, ...(pagoTrabajador && pagadoPor.trim() ? { pagado_por: pagadoPor.trim() } : {}), ...(aprobacion ? { aprobacion } : {}) })
    })
    const data = await r.json().catch(() => null)

    if (!r.ok || !data?.ok) {
      mostrarMensaje('Error: ' + (data?.error || 'no se pudo registrar el gasto'), 'err')
    } else {
      mostrarMensaje('Gasto registrado', 'ok')
      setCategoria('Ingredientes / Insumos')
      setDescripcion('')
      setMonto('')
      setPagadoPor('')
      setPagoTrabajador(false)
      cargarPendientes()
      setGastoPendiente(null)
      setEsperandoPin(false)
      setPinAdmin('')
      await cargarGastos()
    }
    setGuardando(false)
  }

  async function intentarGuardar() {
    if (!descripcion.trim()) { mostrarMensaje('Ingresa una descripcion', 'err'); return }
    if (!monto || parseInt(monto) <= 0) { mostrarMensaje('Ingresa un monto valido', 'err'); return }
    if (pagoTrabajador && !pagadoPor.trim()) { mostrarMensaje('Escribe el nombre del trabajador que lo pagó', 'err'); return }

    const montoNum = parseInt(monto)

    // Si monto >= 10000 y no es admin, pedir PIN
    if (montoNum >= 30000 && !isAdmin) {
      setGastoPendiente({ categoria, descripcion, monto: montoNum })
      setEsperandoPin(true)
      return
    }

    await guardarGasto(categoria, descripcion, montoNum)
  }

  async function verificarPin() {
    // El PIN del administrador se verifica en el SERVIDOR y a cambio se recibe una aprobación de un solo uso para ESTE gasto.
    if (!gastosPendiente) return
    const r = await fetch('/api/admin/verificar-pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinAdmin, categoria: gastosPendiente.categoria, descripcion: gastosPendiente.descripcion, monto: gastosPendiente.monto })
    })
    const data = await r.json().catch(() => null)

    if (data?.ok && data.aprobacion) {
      await guardarGasto(gastosPendiente.categoria, gastosPendiente.descripcion, gastosPendiente.monto, data.aprobacion)
    } else {
      mostrarMensaje(r.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'PIN admin incorrecto', 'err')
      setPinAdmin('')
    }
  }

  async function eliminarGasto(id: string) {
    if (!isAdmin) { mostrarMensaje('Solo el admin puede eliminar', 'err'); return }
    if (!confirm('Eliminar este gasto?')) return
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { mostrarMensaje('Error: ' + error.message, 'err') }
    else { mostrarMensaje('Eliminado', 'ok'); await cargarGastos() }
  }

  const totalFiltrado = gastos.reduce((s, g) => s + g.monto, 0)
  const cajeros = gastos.map(g => g.cajero).filter((c, i, a) => c && a.indexOf(c) === i)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const inp: React.CSSProperties = {
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 14,
    outline: 'none', width: '100%'
  }

  return (
    <AuthGuard>
      <Nav active="/gastos" />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px 16px', fontFamily: 'var(--font)' }}>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>GASTOS</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Registro por turno y cajera</div>
          {mensaje && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: mensaje.tipo === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: '1px solid ' + (mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
              color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {mensaje.txt}
            </div>
          )}
        </div>

        {/* Formulario */}
        {!esperandoPin ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 14 }}>
              Registrar gasto — {sesion?.nombre || 'Caja'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inp}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Descripcion</label>
              <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: 2 harina pan, aceite..." style={inp} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
                Monto {parseInt(monto) >= 30000 && !isAdmin && <span style={{ color: 'var(--warning)', fontSize: 11 }}> — requiere PIN admin</span>}
              </label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" style={inp} />
            </div>
            <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>¿Quién lo pagó?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['caja', 'Salió de la caja'], ['otro', 'Otro medio del negocio'], ['trabajador', 'Un trabajador (devolver)']].map(([k, label]) => {
                const activo = k === 'trabajador' ? pagoTrabajador : !pagoTrabajador && (k === 'caja' ? afectoCaja : !afectoCaja)
                return <button key={k} onClick={() => { if (k === 'trabajador') setPagoTrabajador(true); else { setPagoTrabajador(false); setAfectoCaja(k === 'caja') } }}
                  style={{ flex: '1 1 30%', padding: '10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, border: '1px solid ' + (activo ? 'var(--gold)' : 'var(--border)'), background: activo ? 'var(--gold)' : 'transparent', color: activo ? 'var(--on-accent)' : 'var(--muted)', fontWeight: activo ? 700 : 400 }}>{label}</button>
              })}
            </div>
            {pagoTrabajador && (
              <div style={{ marginTop: 10 }}>
                <input list="lista-pagado-por" value={pagadoPor} onChange={e => setPagadoPor(e.target.value)} maxLength={60} placeholder="Nombre del trabajador (ej: Adriana Cáceres)" style={inp} />
                <datalist id="lista-pagado-por">{pendientes.map(p => <option key={p.persona} value={p.persona} />)}</datalist>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>No sale de la caja ahora. Queda en «Por devolver» hasta que se le pague.</div>
              </div>
            )}
          </div>
          <button onClick={intentarGuardar} disabled={guardando} style={{
              width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--gold)', color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font)'
            }}>
              {guardando ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Gasto de {fmt(gastosPendiente?.monto || 0)} requiere autorizacion</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Ingresa el PIN del administrador para continuar</div>
            <input type="password" value={pinAdmin} onChange={e => setPinAdmin(e.target.value)}
              placeholder="PIN admin" maxLength={4} style={{ ...inp, marginBottom: 12, letterSpacing: 4, fontSize: 20, textAlign: 'center' as const }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => { setEsperandoPin(false); setPinAdmin(''); setGastoPendiente(null) }}
                style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Cancelar
              </button>
              <button onClick={verificarPin} disabled={pinAdmin.length < 4}
                style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--gold)', color: 'var(--on-accent)', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font)', opacity: pinAdmin.length < 4 ? 0.5 : 1 }}>
                Autorizar
              </button>
            </div>
          </div>
        )}

        {/* Por devolver: gastos que pagó un trabajador con su dinero */}
        {pendientes.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 10 }}>Por devolver a trabajadores</div>
            {pendientes.map(p => (
              <div key={p.persona} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.persona}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.gastos} gasto(s)</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{fmt(p.pendiente)}</div>
                {isAdmin && (
                  <button onClick={() => pagarA(p.persona, p.pendiente)} disabled={pagando === p.persona}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {pagando === p.persona ? '...' : 'Pagar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 12 }}>Filtros</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fecha</label>
              <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={{ ...inp, fontSize: 12 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Categoria</label>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                <option value="todas">Todas</option>
                <option value="ingredientes">Ingredientes</option>
                <option value="sueldos">Sueldos</option>
                <option value="servicios">Servicios</option>
                <option value="varios">Varios</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cajera</label>
              <select value={filtroCajero} onChange={e => setFiltroCajero(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                <option value="todos">Todas</option>
                {cajeros.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Lista */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const }}>
              {gastos.length} gastos
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--gold)', fontWeight: 700 }}>{fmt(totalFiltrado)}</div>
          </div>

          {cargando ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Cargando...</div>
          ) : gastos.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin gastos para este filtro</div>
          ) : gastos.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14 }}>{g.descripcion}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {g.categoria} · {g.cajero || 'sin cajera'} · {new Date(g.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {g.pagado_por ? `Pagó ${g.pagado_por} (por devolver)` : g.afecto_caja === false ? 'NO afecto caja' : 'Sale de caja'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', color: g.monto >= 10000 ? 'var(--warning)' : 'var(--gold)', fontWeight: 700 }}>{fmt(g.monto)}</span>
                {isAdmin && (
                  <button onClick={() => eliminarGasto(g.id)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 15 }}>x</button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </AuthGuard>
  )
}
