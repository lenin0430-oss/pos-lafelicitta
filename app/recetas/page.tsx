'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface Insumo {
  id: string
  nombre: string
  precio_ultimo: number
  stock_actual: number
  unidad: string
}
interface Ingrediente { insumoId: string; nombre: string; cantidad: number; unidad: string; costo: number }
interface Receta { id: string; producto_nombre: string; ingredientes: Ingrediente[]; costo_total: number }

export default function RecetasPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [nombre, setNombre] = useState('')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [insumoSel, setInsumoSel] = useState('')
  const [cantSel, setCantSel] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)

  useEffect(() => { cargarInsumos(); cargarRecetas() }, [])

  async function cargarInsumos() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setInsumos([]); return }
    const { data } = await supabase
      .from('stock_insumos')
      .select('id, nombre, precio_ultimo, stock_actual, unidad')
      .eq('empresa_id', empresaId)
      .order('nombre')
    if (data) setInsumos(data)
  }

  async function cargarRecetas() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setRecetas([]); return }
    const { data } = await supabase.from('recetas').select('*').eq('empresa_id', empresaId).order('producto_nombre')
    if (data) setRecetas(data)
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 3000)
  }

  function agregarIngrediente() {
    if (!insumoSel || !cantSel) { mostrarMensaje('Selecciona insumo y cantidad', 'err'); return }
    const insumo = insumos.find(i => i.id === insumoSel)
    if (!insumo) return
    const costo = insumo.precio_ultimo * parseFloat(cantSel)
    setIngredientes([...ingredientes, { insumoId: insumo.id, nombre: insumo.nombre, cantidad: parseFloat(cantSel), unidad: insumo.unidad, costo }])
    setInsumoSel(''); setCantSel('')
  }

  const costoTotal = ingredientes.reduce((s, i) => s + i.costo, 0)

  async function guardar() {
    if (!nombre.trim()) { mostrarMensaje('Ingresa el nombre del plato', 'err'); return }
    if (ingredientes.length === 0) { mostrarMensaje('Agrega al menos un ingrediente', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa en la sesión', 'err'); return }
    const datos = { producto_nombre: nombre.trim(), ingredientes, costo_total: costoTotal }
    const res = editandoId
      ? await supabase.from('recetas').update(datos).eq('empresa_id', empresaId).eq('id', editandoId)
      : await supabase.from('recetas').insert({ ...datos, empresa_id: empresaId })
    if (res.error) { mostrarMensaje('Error al guardar: ' + res.error.message, 'err'); return }
    mostrarMensaje('Receta guardada ✓', 'ok')
    setNombre(''); setIngredientes([]); setEditandoId(null); cargarRecetas()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta receta?')) return
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    await supabase.from('recetas').delete().eq('empresa_id', empresaId).eq('id', id)
    cargarRecetas()
  }

  function editar(r: Receta) {
    setEditandoId(r.id); setNombre(r.producto_nombre); setIngredientes(r.ingredientes || [])
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const inp = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14, width: '100%' }
  const insumoActual = insumos.find(i => i.id === insumoSel)

  return (
    <AuthGuard>
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <Nav active="recetas" />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>📋 Recetas</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>Costo de producción por plato</p>

        {mensaje && <div style={{ background: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', color: '#000', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{mensaje.txt}</div>}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NOMBRE DEL PLATO</label>
            <input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Hamburguesa de pollo" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>INSUMO</label>
              <select style={inp} value={insumoSel} onChange={e => setInsumoSel(e.target.value)}>
                <option value="">Seleccionar...</option>
                {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre} ({fmt(i.precio_ultimo)}/{i.unidad})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CANTIDAD {insumoActual ? `(${insumoActual.unidad})` : ''}</label>
              <input style={inp} type="number" value={cantSel} onChange={e => setCantSel(e.target.value)} placeholder="0" min={0} step={0.01} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={agregarIngrediente} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>
          </div>

          {insumoActual && cantSel && parseFloat(cantSel) > 0 && (
            <div style={{ padding: '8px 12px', background: 'rgba(212,168,67,.1)', border: '1px solid var(--gold)', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
              💡 Costo: <strong style={{ color: 'var(--gold)' }}>{fmt(insumoActual.precio_ultimo * parseFloat(cantSel))}</strong>
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({fmt(insumoActual.precio_ultimo)}/{insumoActual.unidad} × {cantSel})</span>
            </div>
          )}

          {ingredientes.length > 0 && (
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              {ingredientes.map((ing, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>{ing.nombre} · {ing.cantidad} {ing.unidad}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{fmt(ing.costo)}</span>
                    <button onClick={() => setIngredientes(ingredientes.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 700 }}>
                <span style={{ fontSize: 13 }}>Costo total</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(costoTotal)}</span>
              </div>
            </div>
          )}

          <button onClick={guardar} style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {editandoId ? '✓ Actualizar receta' : '+ Guardar receta'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recetas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay recetas registradas</div>
          ) : recetas.map(r => (
            <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.producto_nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(r.ingredientes || []).length} ingredientes</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{fmt(r.costo_total)}</span>
                  <button onClick={() => editar(r)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
                  <button onClick={() => eliminar(r.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/costeo" style={{ color: 'var(--gold)', fontSize: 13 }}>→ Ver Costeo de platos</a>
        </div>
      </div>
    </main>
    </AuthGuard>
  )
}
