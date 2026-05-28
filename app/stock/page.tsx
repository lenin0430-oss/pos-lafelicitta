'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface StockItem {
  id: string
  nombre: string
  unidad: string
  stock_actual: number
  stock_minimo: number
  precio_ultimo: number
  categoria: string
}

const CATEGORIAS_STOCK = ['Carnes', 'Lácteos', 'Panadería', 'Verduras', 'Salsas y condimentos', 'Aceites', 'Otros']
const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja']

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('kg')
  const [categoria, setCategoria] = useState('Carnes')
  const [stock, setStock] = useState('0')
  const [minimo, setMinimo] = useState('1')
  const [precio, setPrecio] = useState('')

  useEffect(() => { cargar() }, [])

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3500)
  }

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setItems([]); return }

    const { data, error } = await supabase
      .from('stock_insumos')
      .select('id, nombre, unidad, stock_actual, stock_minimo, precio_ultimo, categoria')
      .eq('empresa_id', empresaId)
      .order('nombre')

    if (error) {
      mostrarMensaje('Error cargando stock: ' + error.message, 'err')
      return
    }

    setItems((data || []) as StockItem[])
  }

  async function crearInsumo() {
    if (!nombre.trim()) { mostrarMensaje('Falta el nombre del insumo', 'err'); return }
    if (!precio || Number(precio) <= 0) { mostrarMensaje('Falta precio válido', 'err'); return }

    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa', 'err'); return }

    setGuardando(true)

    const { error } = await supabase.from('stock_insumos').insert({
      empresa_id: empresaId,
      nombre: nombre.trim(),
      unidad,
      categoria,
      stock_actual: Number(stock) || 0,
      stock_minimo: Number(minimo) || 0,
      precio_ultimo: Number(precio),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      mostrarMensaje('Error al crear: ' + error.message, 'err')
    } else {
      mostrarMensaje('Insumo creado ✓', 'ok')
      setNombre('')
      setStock('0')
      setMinimo('1')
      setPrecio('')
      await cargar()
    }

    setGuardando(false)
  }

  async function eliminarInsumo(id: string) {
    if (!confirm('¿Eliminar este insumo?')) return
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return

    const { error } = await supabase
      .from('stock_insumos')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('id', id)

    if (error) mostrarMensaje('Error al eliminar: ' + error.message, 'err')
    else { mostrarMensaje('Insumo eliminado ✓', 'ok'); await cargar() }
  }

  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const valorTotal = items.reduce((s, i) => s + Number(i.stock_actual || 0) * Number(i.precio_ultimo || 0), 0)

  const inp: React.CSSProperties = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '9px 11px',
    fontFamily: 'var(--font)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
        <Nav active="stock" />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 14px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--gold)' }}>📦 Control de Stock</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{items.length} insumos · Valor en bodega: <strong style={{ color: 'var(--gold)' }}>{fmt(valorTotal)}</strong></p>

          {mensaje && <div style={{ margin: '12px 0', padding: '9px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{mensaje.txt}</div>}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, color: 'var(--gold)', margin: '0 0 12px' }}>➕ Nuevo insumo</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del insumo" style={inp} />
              <select value={unidad} onChange={e => setUnidad(e.target.value)} style={inp}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inp}>{CATEGORIAS_STOCK.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
              <input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="Stock" style={inp} />
              <input type="number" value={minimo} onChange={e => setMinimo(e.target.value)} placeholder="Mínimo" style={inp} />
              <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio unitario" style={inp} />
              <button onClick={crearInsumo} disabled={guardando} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 800, cursor: 'pointer' }}>{guardando ? '...' : 'Guardar'}</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(i => (
              <div key={i.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{i.categoria} · {i.stock_actual} {i.unidad} · mínimo {i.stock_minimo}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{fmt(i.precio_ultimo)}/{i.unidad}</span>
                  <button onClick={() => eliminarInsumo(i.id)} style={{ background: 'transparent', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--red)', padding: '4px 8px', cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
            {items.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay insumos cargados</div>}
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
