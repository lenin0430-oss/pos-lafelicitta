'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

const CATEGORIAS = [
  { id: 'ingredientes', label: '🥩 Ingredientes / Insumos', color: '#e8a32c' },
  { id: 'sueldos', label: '👤 Sueldos / Personal', color: '#4a9fd4' },
  { id: 'servicios', label: '💡 Servicios (luz, agua, gas)', color: '#9b59b6' },
  { id: 'arriendo', label: '🏠 Arriendo', color: '#e74c3c' },
  { id: 'varios', label: '📦 Gastos Varios', color: '#7a7670' },
]

interface Gasto {
  id: string
  categoria: string
  descripcion: string
  monto: number
  created_at: string
}

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categoria, setCategoria] = useState('ingredientes')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [filtro, setFiltro] = useState('hoy')

  useEffect(() => { cargarGastos() }, [filtro])

  async function cargarGastos() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setGastos([]); return }

    const ahora = new Date()
    let desde: Date
    if (filtro === 'hoy') desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    else if (filtro === 'semana') desde = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
    else desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

    const { data } = await supabase
      .from('gastos')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
    if (data) setGastos(data)
  }

  async function registrarGasto() {
    if (!descripcion.trim()) { mostrarMensaje('Ingresa una descripción', 'err'); return }
    if (!monto || parseFloat(monto) <= 0) { mostrarMensaje('Ingresa un monto válido', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa en la sesión', 'err'); return }

    setGuardando(true)
    const { error } = await supabase.from('gastos').insert({
      empresa_id: empresaId,
      categoria,
      descripcion: descripcion.trim(),
      monto: parseFloat(monto),
      created_at: new Date().toISOString()
    })
    if (error) { mostrarMensaje('Error al guardar: ' + error.message, 'err') }
    else {
      mostrarMensaje('Gasto registrado ✓', 'ok')
      setDescripcion('')
      setMonto('')
      cargarGastos()
    }
    setGuardando(false)
  }

  async function eliminarGasto(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    await supabase.from('gastos').delete().eq('empresa_id', empresaId).eq('id', id)
    cargarGastos()
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3000)
  }

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0)
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

  const porCategoria = CATEGORIAS.map(cat => ({
    ...cat,
    total: gastos.filter(g => g.categoria === cat.id).reduce((s, g) => s + g.monto, 0),
    count: gastos.filter(g => g.categoria === cat.id).length
  })).filter(c => c.count > 0)

  const catActiva = CATEGORIAS.find(c => c.id === categoria)

  return (
    <AuthGuard>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)', paddingBottom: 80 }}>
      <Nav active="/gastos" />

      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Mensaje */}
        {mensaje && (
          <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 12, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(217,79,61,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
            {mensaje.txt}
          </div>
        )}

        {/* FORM */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>REGISTRAR GASTO</div>

          {/* Categorías */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {CATEGORIAS.map(cat => (
              <button key={cat.id} onClick={() => setCategoria(cat.id)} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${categoria === cat.id ? cat.color : 'var(--border)'}`, background: categoria === cat.id ? cat.color + '22' : 'transparent', color: categoria === cat.id ? cat.color : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Descripción */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Carne para hamburguesas, 5kg..." style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Monto */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Monto (CLP)</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font)', fontSize: 18, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <button onClick={registrarGasto} disabled={guardando} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: catActiva?.color || 'var(--gold)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            {guardando ? 'Guardando...' : '+ Registrar Gasto'}
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[['hoy', 'Hoy'], ['semana', '7 días'], ['mes', 'Este mes']].map(([val, label]) => (
            <button key={val} onClick={() => setFiltro(val)} style={{ flex: 1, padding: '8px', borderRadius: 20, border: `1px solid ${filtro === val ? 'var(--gold)' : 'var(--border)'}`, background: filtro === val ? 'var(--gold)' : 'transparent', color: filtro === val ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Total */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total gastos</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{fmt(totalGastos)}</span>
        </div>

        {/* Por categoría */}
        {porCategoria.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            {porCategoria.map(cat => (
              <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: cat.color }}>{cat.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>{fmt(cat.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Lista gastos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gastos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay gastos registrados</div>
          ) : gastos.map(g => {
            const cat = CATEGORIAS.find(c => c.id === g.categoria)
            return (
              <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{g.descripcion}</div>
                  <div style={{ fontSize: 11, color: cat?.color || 'var(--muted)' }}>{cat?.label} · {new Date(g.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{fmt(g.monto)}</span>
                  <button onClick={() => eliminarGasto(g.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </AuthGuard>
  )
}
