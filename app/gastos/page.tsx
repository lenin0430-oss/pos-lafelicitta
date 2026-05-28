'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

type Gasto = { id: string; categoria: string; descripcion: string; monto: number; created_at: string }

const CATEGORIAS = [
  ['ingredientes', 'Ingredientes / Insumos'],
  ['sueldos', 'Sueldos / Personal'],
  ['servicios', 'Servicios'],
  ['arriendo', 'Arriendo'],
  ['varios', 'Gastos varios'],
] as const

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categoria, setCategoria] = useState('ingredientes')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setMensaje('No hay empresa activa. Inicia sesión de nuevo.'); return }
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setMensaje('Error cargando gastos: ' + error.message)
    else setGastos((data || []) as Gasto[])
  }

  async function guardar() {
    if (!descripcion.trim()) { setMensaje('Falta descripción'); return }
    const valor = Number(monto)
    if (!valor || valor <= 0) { setMensaje('Monto inválido'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setMensaje('No hay empresa activa. Inicia sesión de nuevo.'); return }
    setGuardando(true)
    const { error } = await supabase.from('gastos').insert({
      empresa_id: empresaId,
      categoria,
      descripcion: descripcion.trim(),
      monto: valor,
      created_at: new Date().toISOString(),
    })
    setGuardando(false)
    if (error) { setMensaje('Error guardando gasto: ' + error.message); return }
    setMensaje('Gasto guardado')
    setDescripcion('')
    setMonto('')
    await cargar()
  }

  async function eliminar(id: string) {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    const { error } = await supabase.from('gastos').delete().eq('empresa_id', empresaId).eq('id', id)
    if (error) setMensaje('Error eliminando: ' + error.message)
    else await cargar()
  }

  const total = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="/gastos" />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
          <h1 style={{ color: 'var(--gold)', margin: 0 }}>Gastos</h1>
          <p style={{ color: 'var(--muted)' }}>Registra y revisa gastos del negocio.</p>
          {mensaje && <div style={{ margin: '12px 0', padding: 12, borderRadius: 8, border: '1px solid var(--gold)', color: 'var(--gold)' }}>{mensaje}</div>}

          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>
              {CATEGORIAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción del gasto" style={inputStyle} />
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto" style={inputStyle} />
            <button onClick={guardar} disabled={guardando} style={buttonStyle}>{guardando ? 'Guardando...' : 'Guardar gasto'}</button>
          </section>

          <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Total</span>
            <strong style={{ color: 'var(--red)', fontSize: 22 }}>{fmt(total)}</strong>
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gastos.map(g => <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div><b>{g.descripcion}</b><div style={{ color: 'var(--muted)', fontSize: 12 }}>{g.categoria} · {new Date(g.created_at).toLocaleString('es-CL')}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><b style={{ color: 'var(--red)' }}>{fmt(g.monto)}</b><button onClick={() => eliminar(g.id)} style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer' }}>×</button></div>
            </div>)}
            {gastos.length === 0 && <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 30 }}>No hay gastos registrados</div>}
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', marginBottom: 10, padding: '11px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', boxSizing: 'border-box' }
const buttonStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: 0, background: 'var(--gold)', color: '#000', fontWeight: 900, cursor: 'pointer' }
