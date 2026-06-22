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
  created_at: string
}

const CATEGORIAS = ['Ingredientes / Insumos', 'Sueldos', 'Servicios', 'Varios']
const ADMIN_PIN = '0000'

export default function GastosPage() {
  const [categoria, setCategoria] = useState('Ingredientes / Insumos')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
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

  async function guardarGasto(cat: string, desc: string, mon: number) {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa', 'err'); return }

    // Obtener apertura activa
    const { data: apertura } = await supabase
      .from('aperturas_caja')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierto')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setGuardando(true)
    const { error } = await supabase.from('gastos').insert({
      empresa_id: empresaId,
      categoria: cat.toLowerCase().split(' /')[0].trim(),
      descripcion: desc,
      monto: mon,
      cajero: sesion?.nombre || 'Caja',
      apertura_id: apertura?.id || null,
      created_at: new Date().toISOString()
    })

    if (error) {
      mostrarMensaje('Error: ' + error.message, 'err')
    } else {
      mostrarMensaje('Gasto registrado', 'ok')
      setCategoria('Ingredientes / Insumos')
      setDescripcion('')
      setMonto('')
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

    const montoNum = parseInt(monto)

    // Si monto >= 10000 y no es admin, pedir PIN
    if (montoNum >= 10000 && !isAdmin) {
      setGastoPendiente({ categoria, descripcion, monto: montoNum })
      setEsperandoPin(true)
      return
    }

    await guardarGasto(categoria, descripcion, montoNum)
  }

  async function verificarPin() {
    // Verificar PIN admin en Supabase
    const empresaId = await getEmpresaIdActual()
    const { data } = await supabase
      .from('usuarios')
      .select('nombre')
      .eq('empresa_id', empresaId)
      .eq('pin', pinAdmin)
      .eq('rol', 'admin')
      .maybeSingle()

    if (data && gastosPendiente) {
      await guardarGasto(gastosPendiente.categoria, gastosPendiente.descripcion, gastosPendiente.monto)
    } else {
      mostrarMensaje('PIN admin incorrecto', 'err')
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
              background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,0.1)' : 'rgba(220,53,69,0.1)',
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
                Monto {parseInt(monto) >= 10000 && !isAdmin && <span style={{ color: 'var(--warning)', fontSize: 11 }}> — requiere PIN admin</span>}
              </label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" style={inp} />
            </div>
            <button onClick={intentarGuardar} disabled={guardando} style={{
              width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--gold)', color: '#000', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font)'
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
                style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font)', opacity: pinAdmin.length < 4 ? 0.5 : 1 }}>
                Autorizar
              </button>
            </div>
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
                  {g.categoria} · {g.cajero || 'sin cajera'} · {new Date(g.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
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
