'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual, getSesion } from '@/lib/auth'
import AuthGuard from '@/components/AuthGuard'
import Nav from '@/components/Nav'

interface Propina {
  id: string
  empleado: string
  monto: number
  metodo_pago: string
  cajero: string
  notas: string
  created_at: string
}

const EMPLEADOS = ['Adri', 'Yoli', 'Gigi', 'Carlos', 'Marcos', 'Otro']
const METODOS = ['Efectivo', 'Debito', 'Transferencia', 'Mercado Pago']

export default function PropinasPage() {
  const [empleado, setEmpleado] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [propinas, setPropinas] = useState<Propina[]>([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState<{txt: string, tipo: 'ok'|'err'} | null>(null)
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])

  const sesion = getSesion()
  const isAdmin = sesion?.rol === 'admin'

  useEffect(() => { cargarPropinas() }, [filtroFecha])

  async function cargarPropinas() {
    setCargando(true)
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setCargando(false); return }
    const desde = new Date(filtroFecha + 'T00:00:00').toISOString()
    const hasta = new Date(filtroFecha + 'T23:59:59').toISOString()
    const { data } = await supabase
      .from('propinas').select('*').eq('empresa_id', empresaId)
      .gte('created_at', desde).lte('created_at', hasta)
      .order('created_at', { ascending: false })
    setPropinas(data || [])
    setCargando(false)
  }

  function mostrarMensaje(txt: string, tipo: 'ok'|'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3500)
  }

  async function registrarPropina() {
    if (!empleado) { mostrarMensaje('Selecciona el empleado', 'err'); return }
    if (!monto || parseInt(monto) <= 0) { mostrarMensaje('Ingresa un monto valido', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa', 'err'); return }
    setGuardando(true)
    const { error } = await supabase.from('propinas').insert({
      empresa_id: empresaId,
      empleado, monto: parseInt(monto), metodo_pago: metodo,
      cajero: sesion?.nombre || 'Caja', notas,
      created_at: new Date().toISOString()
    })
    if (error) { mostrarMensaje('Error: ' + error.message, 'err') }
    else {
      mostrarMensaje('Propina registrada', 'ok')
      setEmpleado(''); setMonto(''); setNotas(''); setMetodo('Efectivo')
      await cargarPropinas()
    }
    setGuardando(false)
  }

  async function eliminarPropina(id: string) {
    if (!isAdmin) { mostrarMensaje('Solo el admin puede eliminar', 'err'); return }
    if (!confirm('Eliminar esta propina?')) return
    const { error } = await supabase.from('propinas').delete().eq('id', id)
    if (error) { mostrarMensaje('Error: ' + error.message, 'err') }
    else { mostrarMensaje('Eliminado', 'ok'); await cargarPropinas() }
  }

  const totalDia = propinas.reduce((s, p) => s + p.monto, 0)
  const porEmpleado = EMPLEADOS.map(e => ({
    nombre: e,
    total: propinas.filter(p => p.empleado === e).reduce((s, p) => s + p.monto, 0)
  })).filter(e => e.total > 0)

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const inp: React.CSSProperties = {
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 14,
    outline: 'none', width: '100%'
  }

  return (
    <AuthGuard>
      <Nav active="/propinas" />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px', fontFamily: 'var(--font)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>PROPINAS</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Registro diario por empleado</div>
          {mensaje && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,0.1)' : 'rgba(220,53,69,0.1)',
              border: '1px solid ' + (mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
              color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {mensaje.txt}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 14 }}>Registrar propina</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Empleado</label>
              <select value={empleado} onChange={e => setEmpleado(e.target.value)} style={inp}>
                <option value="">Seleccionar...</option>
                {EMPLEADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Monto</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Metodo</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {METODOS.map(m => (
                <button key={m} onClick={() => setMetodo(m)} style={{
                  padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13,
                  border: '1px solid ' + (m === metodo ? 'var(--gold)' : 'var(--border)'),
                  background: m === metodo ? 'var(--gold)' : 'transparent',
                  color: m === metodo ? '#000' : 'var(--muted)'
                }}>{m}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Mesa 3..." style={inp} />
          </div>
          <button onClick={registrarPropina} disabled={guardando} style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--gold)', color: '#000', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font)'
          }}>
            {guardando ? 'Guardando...' : 'Registrar propina'}
          </button>
        </div>

        {porEmpleado.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const }}>Resumen del dia</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--gold)', fontWeight: 700 }}>{fmt(totalDia)}</div>
            </div>
            {porEmpleado.map(e => (
              <div key={e.nombre} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                <span>{e.nombre}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(e.total)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const }}>Historial</div>
            <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
              style={{ ...inp, width: 'auto', fontSize: 13 }} />
          </div>
          {cargando ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Cargando...</div>
          ) : propinas.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin propinas este dia</div>
          ) : propinas.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.empleado}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {p.metodo_pago} {new Date(p.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  {p.notas ? ' · ' + p.notas : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{fmt(p.monto)}</span>
                {isAdmin && (
                  <button onClick={() => eliminarPropina(p.id)} style={{
                    background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16
                  }}>x</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AuthGuard>
  )
}
