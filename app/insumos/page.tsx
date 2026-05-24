'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'porciones']

interface Insumo {
  id: string
  nombre: string
  precio: number
  cantidad: number
  unidad: string
  proveedor: string
}

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [unidad, setUnidad] = useState('kg')
  const [proveedor, setProveedor] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('insumos').select('*').order('nombre')
    if (data) setInsumos(data)
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3000)
  }

  function limpiar() {
    setNombre(''); setPrecio(''); setCantidad('1')
    setUnidad('kg'); setProveedor(''); setEditandoId(null)
  }

  async function guardar() {
    if (!nombre.trim()) { mostrarMensaje('Ingresa el nombre', 'err'); return }
    if (!precio || parseFloat(precio) <= 0) { mostrarMensaje('Ingresa un precio válido', 'err'); return }
    setGuardando(true)
    const datos = { nombre: nombre.trim(), precio: parseFloat(precio), cantidad: parseFloat(cantidad), unidad, proveedor: proveedor.trim() }
    if (editandoId) {
      await supabase.from('insumos').update(datos).eq('id', editandoId)
      mostrarMensaje('Insumo actualizado ✓', 'ok')
    } else {
      await supabase.from('insumos').insert(datos)
      mostrarMensaje('Insumo agregado ✓', 'ok')
    }
    limpiar(); cargar(); setGuardando(false)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este insumo?')) return
    await supabase.from('insumos').delete().eq('id', id)
    cargar()
  }

  function editar(i: Insumo) {
    setEditandoId(i.id); setNombre(i.nombre); setPrecio(String(i.precio))
    setCantidad(String(i.cantidad)); setUnidad(i.unidad); setProveedor(i.proveedor || '')
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const inp = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14, width: '100%' }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <Nav />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🥩 Insumos</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>Ingredientes y precios de compra</p>

        {mensaje && (
          <div style={{ background: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', color: '#000', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            {mensaje.txt}
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NOMBRE</label><input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Pollo" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PROVEEDOR</label><input style={inp} value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Opcional" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PRECIO ($)</label><input style={inp} type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CANTIDAD</label><input style={inp} type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>UNIDAD</label>
                <select style={inp} value={unidad} onChange={e => setUnidad(e.target.value)}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={guardar} disabled={guardando} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {guardando ? 'Guardando...' : editandoId ? '✓ Actualizar' : '+ Agregar insumo'}
            </button>
            {editandoId && <button onClick={limpiar} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insumos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay insumos registrados</div>
          ) : insumos.map(i => (
            <div key={i.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{i.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{i.cantidad} {i.unidad}{i.proveedor ? ` · ${i.proveedor}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{fmt(i.precio)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>por {i.cantidad} {i.unidad}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => editar(i)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
                <button onClick={() => eliminar(i.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/recetas" style={{ color: 'var(--gold)', fontSize: 13 }}>→ Ir a Recetas</a>
        </div>
      </div>
    </main>
  )
}
