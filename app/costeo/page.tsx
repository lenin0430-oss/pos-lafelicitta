'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MENU, CATEGORIAS, type Producto } from '@/lib/menu'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface Insumo { id: string; nombre: string; precio: number; cantidad: number; unidad: string }
interface Ingrediente { insumoId: string; nombre: string; cantidad: number; unidad: string; costo: number }
interface Receta { id: string; producto_nombre: string; ingredientes: Ingrediente[]; costo_total: number }

export default function CosteoPage() {
  const [insumos, setInsumos]   = useState<Insumo[]>([])
  const [recetas, setRecetas]   = useState<Receta[]>([])
  const [margen,  setMargen]    = useState(65)
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [tab, setTab] = useState<'costeo'|'recetas'|'insumos'>('costeo')

  // Estado para crear/editar receta
  const [formNombre, setFormNombre] = useState('')
  const [formIngredientes, setFormIngredientes] = useState<Ingrediente[]>([])
  const [insumoSel, setInsumoSel] = useState('')
  const [cantSel, setCantSel] = useState('')
  const [editandoId, setEditandoId] = useState<string|null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{txt:string;tipo:'ok'|'err'}|null>(null)

  // Estado para insumos
  const [insNombre, setInsNombre] = useState('')
  const [insPrecio, setInsPrecio] = useState('')
  const [insCantidad, setInsCantidad] = useState('1')
  const [insUnidad, setInsUnidad] = useState('kg')
  const [insProveedor, setInsProveedor] = useState('')
  const [editInsId, setEditInsId] = useState<string|null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: ins }, { data: rec }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('recetas').select('*').order('producto_nombre'),
    ])
    if (ins) setInsumos(ins)
    if (rec) setRecetas(rec)
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const precioSugerido = (costo: number) => Math.ceil(costo / (1 - margen / 100) / 100) * 100
  const margenReal = (costo: number, precioMenu: number) =>
    precioMenu > 0 ? ((precioMenu - costo) / precioMenu) * 100 : null

  function mostrarMensaje(txt: string, tipo: 'ok'|'err') {
    setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 3000)
  }

  // ── INSUMOS ─────────────────────────────────────────
  async function guardarInsumo() {
    if (!insNombre || !insPrecio) { mostrarMensaje('Nombre y precio son obligatorios', 'err'); return }
    setGuardando(true)
    const datos = { nombre: insNombre.trim(), precio: parseFloat(insPrecio), cantidad: parseFloat(insCantidad), unidad: insUnidad, proveedor: insProveedor.trim() }
    if (editInsId) {
      await supabase.from('insumos').update(datos).eq('id', editInsId)
    } else {
      await supabase.from('insumos').insert(datos)
    }
    setInsNombre(''); setInsPrecio(''); setInsCantidad('1'); setInsUnidad('kg'); setInsProveedor(''); setEditInsId(null)
    mostrarMensaje(editInsId ? 'Insumo actualizado ✓' : 'Insumo agregado ✓', 'ok')
    setGuardando(false)
    cargar()
  }

  function editarInsumo(ins: Insumo) {
    setEditInsId(ins.id); setInsNombre(ins.nombre); setInsPrecio(String(ins.precio))
    setInsCantidad(String(ins.cantidad)); setInsUnidad(ins.unidad); setInsProveedor('')
    setTab('insumos')
  }

  async function eliminarInsumo(id: string) {
    if (!confirm('¿Eliminar este insumo?')) return
    await supabase.from('insumos').delete().eq('id', id)
    mostrarMensaje('Insumo eliminado', 'ok'); cargar()
  }

  // ── RECETAS ─────────────────────────────────────────
  function agregarIngrediente() {
    if (!insumoSel || !cantSel) { mostrarMensaje('Selecciona insumo y cantidad', 'err'); return }
    const ins = insumos.find(i => i.id === insumoSel)
    if (!ins) return
    const ppu = ins.precio / ins.cantidad
    const costo = ppu * parseFloat(cantSel)
    setFormIngredientes(prev => [...prev, { insumoId: ins.id, nombre: ins.nombre, cantidad: parseFloat(cantSel), unidad: ins.unidad, costo }])
    setInsumoSel(''); setCantSel('')
  }

  async function guardarReceta() {
    if (!formNombre || formIngredientes.length === 0) { mostrarMensaje('Completa nombre e ingredientes', 'err'); return }
    setGuardando(true)
    const costo_total = formIngredientes.reduce((s, i) => s + i.costo, 0)
    const datos = { producto_nombre: formNombre.trim(), ingredientes: formIngredientes, costo_total }
    if (editandoId) {
      await supabase.from('recetas').update(datos).eq('id', editandoId)
    } else {
      await supabase.from('recetas').insert(datos)
    }
    setFormNombre(''); setFormIngredientes([]); setEditandoId(null)
    mostrarMensaje(editandoId ? 'Receta actualizada ✓' : 'Receta guardada ✓', 'ok')
    setGuardando(false); cargar()
  }

  function editarReceta(r: Receta) {
    setEditandoId(r.id); setFormNombre(r.producto_nombre); setFormIngredientes(r.ingredientes); setTab('recetas')
  }

  async function eliminarReceta(id: string) {
    if (!confirm('¿Eliminar esta receta?')) return
    await supabase.from('recetas').delete().eq('id', id)
    mostrarMensaje('Receta eliminada', 'ok'); cargar()
  }

  // ── CRUZAR RECETAS CON MENÚ ──────────────────────────
  const productosConCosto = MENU.map(p => {
    const receta = recetas.find(r => r.producto_nombre.toLowerCase() === p.nombre.toLowerCase())
    return { ...p, receta: receta || null }
  }).filter(p => {
    const enBusqueda = busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const enCat = catFiltro === 'Todas' || p.categoria === catFiltro
    return enBusqueda && enCat
  })

  const conReceta = productosConCosto.filter(p => p.receta)
  const sinReceta = productosConCosto.filter(p => !p.receta)

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%' }
  const sel: React.CSSProperties = { ...inp }

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
        <Nav active="costeo" />
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 14px' }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--gold)' }}>💰 Costos y Margen</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              {recetas.length} platos costeados · {insumos.length} insumos · {sinReceta.length} sin receta
            </p>
          </div>

          {/* Mensaje */}
          {mensaje && (
            <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, fontSize: 13, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {mensaje.txt}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {([['costeo','📊 Costeo'],['recetas','📋 Recetas'],['insumos','🧂 Insumos']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 18px', border: 'none', background: 'transparent', color: tab === t ? 'var(--gold)' : 'var(--muted)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1 }}>
                {label}
              </button>
            ))}
          </div>

          {/* ═══ TAB COSTEO ═══ */}
          {tab === 'costeo' && (
            <div>
              {/* Margen slider */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Margen objetivo:</span>
                <input type="range" min={10} max={90} value={margen} onChange={e => setMargen(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--gold)' }} />
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, color: 'var(--gold)', fontSize: 22, minWidth: 54 }}>{margen}%</span>
              </div>

              {/* Filtros */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar plato..." style={{ ...inp, width: 'auto', flex: 1, minWidth: 180 }} />
                <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} style={{ ...sel, width: 'auto' }}>
                  <option value="Todas">Todas las categorías</option>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Resumen rápido */}
              {conReceta.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Con receta', val: conReceta.length, color: 'var(--green)' },
                    { label: 'Sin receta', val: sinReceta.length, color: 'var(--red)' },
                    { label: 'Margen prom.', val: (() => { const ms = conReceta.map(p => margenReal(p.receta!.costo_total, p.precio)).filter(m => m !== null) as number[]; return ms.length > 0 ? Math.round(ms.reduce((a,b)=>a+b,0)/ms.length) + '%' : '-' })(), color: 'var(--gold)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{s.label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista platos CON receta */}
              {conReceta.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: 'var(--green)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>✅ Platos costeados</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {conReceta.map(p => {
                      const costo = p.receta!.costo_total
                      const sugerido = precioSugerido(costo)
                      const mReal = margenReal(costo, p.precio)
                      const mColor = mReal === null ? 'var(--muted)' : mReal >= 60 ? 'var(--green)' : mReal >= 40 ? 'var(--gold)' : 'var(--red)'
                      const diffPrecio = p.precio - sugerido
                      return (
                        <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.categoria}</div>
                            </div>
                            <button onClick={() => editarReceta(p.receta!)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}>✏️ Editar</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {[
                              { label: 'Costo', val: fmt(costo), color: 'var(--red)' },
                              { label: 'Precio actual', val: fmt(p.precio), color: 'var(--text)' },
                              { label: `Sugerido (${margen}%)`, val: fmt(sugerido), color: 'var(--gold)' },
                              { label: 'Margen real', val: mReal !== null ? Math.round(mReal) + '%' : '-', color: mColor },
                            ].map(col => (
                              <div key={col.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 3 }}>{col.label}</div>
                                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: col.color }}>{col.val}</div>
                              </div>
                            ))}
                          </div>
                          {mReal !== null && mReal < 50 && (
                            <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(220,50,50,.1)', border: '1px solid var(--red)', borderRadius: 7, fontSize: 12, color: 'var(--red)' }}>
                              ⚠️ Margen bajo — {diffPrecio < 0 ? `sube el precio ${fmt(Math.abs(diffPrecio))} para llegar al ${margen}%` : `precio OK vs sugerido`}
                            </div>
                          )}
                          {/* Desglose ingredientes */}
                          <details style={{ marginTop: 10 }}>
                            <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Ver ingredientes ({p.receta!.ingredientes.length})</summary>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {p.receta!.ingredientes.map((ing, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ color: 'var(--muted)' }}>{ing.nombre} · {ing.cantidad} {ing.unidad}</span>
                                  <span style={{ fontFamily: 'var(--mono)' }}>{fmt(ing.costo)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Lista platos SIN receta */}
              {sinReceta.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--red)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>❌ Sin receta ({sinReceta.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {sinReceta.map(p => (
                      <button key={p.id} onClick={() => { setFormNombre(p.nombre); setTab('recetas') }} style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{p.categoria} · {fmt(p.precio)}</div>
                        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6 }}>+ Crear receta →</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB RECETAS ═══ */}
          {tab === 'recetas' && (
            <div>
              {/* Formulario */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--gold)' }}>{editandoId ? '✏️ Editar receta' : '➕ Nueva receta'}</h2>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Nombre del plato</label>
                  <input list="menu-productos" value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: La Felicitta, Arepa con Queso..." style={inp} />
                  <datalist id="menu-productos">
                    {MENU.map(p => <option key={p.id} value={p.nombre} />)}
                  </datalist>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Agregar ingrediente</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8 }}>
                    <select value={insumoSel} onChange={e => setInsumoSel(e.target.value)} style={sel}>
                      <option value="">— Selecciona insumo —</option>
                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad}) · {fmt(i.precio)}/{i.cantidad}{i.unidad}</option>)}
                    </select>
                    <input type="number" value={cantSel} onChange={e => setCantSel(e.target.value)} placeholder="Cant." style={inp} min={0} step={0.01} />
                    <button onClick={agregarIngrediente} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>+ Agregar</button>
                  </div>
                </div>

                {formIngredientes.length > 0 && (
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Ingredientes de esta receta:</div>
                    {formIngredientes.map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span>{ing.nombre} · {ing.cantidad} {ing.unidad}</span>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(ing.costo)}</span>
                          <button onClick={() => setFormIngredientes(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontWeight: 700 }}>
                      <span>Costo total:</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmt(formIngredientes.reduce((s, i) => s + i.costo, 0))}</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={guardarReceta} disabled={guardando} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {guardando ? '...' : editandoId ? '✓ Actualizar receta' : '✓ Guardar receta'}
                  </button>
                  {editandoId && <button onClick={() => { setEditandoId(null); setFormNombre(''); setFormIngredientes([]) }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancelar</button>}
                </div>

                {insumos.length === 0 && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(212,168,67,.1)', border: '1px solid var(--gold)', borderRadius: 8, fontSize: 12, color: 'var(--gold)' }}>
                    ⚠️ Primero agrega insumos en la pestaña "🧂 Insumos"
                  </div>
                )}
              </div>

              {/* Lista recetas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recetas.map(r => (
                  <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.producto_nombre}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.ingredientes.length} ingredientes</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>{fmt(r.costo_total)}</span>
                        <button onClick={() => editarReceta(r)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>✏️</button>
                        <button onClick={() => eliminarReceta(r.id)} style={{ background: 'transparent', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--red)', padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
                {recetas.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay recetas todavía — crea la primera arriba</div>}
              </div>
            </div>
          )}

          {/* ═══ TAB INSUMOS ═══ */}
          {tab === 'insumos' && (
            <div>
              {/* Formulario insumo */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--gold)' }}>{editInsId ? '✏️ Editar insumo' : '➕ Nuevo insumo'}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nombre del insumo</label>
                    <input value={insNombre} onChange={e => setInsNombre(e.target.value)} placeholder="Ej: Carne molida, Queso..." style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Precio de compra (CLP)</label>
                    <input type="number" value={insPrecio} onChange={e => setInsPrecio(e.target.value)} placeholder="Ej: 5000" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cantidad por esa compra</label>
                    <input type="number" value={insCantidad} onChange={e => setInsCantidad(e.target.value)} placeholder="Ej: 1" style={inp} step={0.01} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Unidad</label>
                    <select value={insUnidad} onChange={e => setInsUnidad(e.target.value)} style={sel}>
                      {['kg','g','L','ml','unidad','porción'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Proveedor (opcional)</label>
                  <input value={insProveedor} onChange={e => setInsProveedor(e.target.value)} placeholder="Ej: Distribuidora X" style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={guardarInsumo} disabled={guardando} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {guardando ? '...' : editInsId ? '✓ Actualizar' : '✓ Guardar insumo'}
                  </button>
                  {editInsId && <button onClick={() => { setEditInsId(null); setInsNombre(''); setInsPrecio(''); setInsCantidad('1'); setInsUnidad('kg') }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancelar</button>}
                </div>
                {insPrecio && insCantidad && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                    → Costo por {insUnidad}: <strong style={{ color: 'var(--gold)' }}>${Math.round(parseFloat(insPrecio) / parseFloat(insCantidad)).toLocaleString('es-CL')}</strong>
                  </div>
                )}
              </div>

              {/* Lista insumos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {insumos.map(ins => (
                  <div key={ins.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ins.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        ${ins.precio.toLocaleString('es-CL')} / {ins.cantidad} {ins.unidad}
                        <span style={{ marginLeft: 10, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
                          → ${Math.round(ins.precio / ins.cantidad).toLocaleString('es-CL')}/{ins.unidad}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => editarInsumo(ins)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>✏️</button>
                      <button onClick={() => eliminarInsumo(ins.id)} style={{ background: 'transparent', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--red)', padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>🗑</button>
                    </div>
                  </div>
                ))}
                {insumos.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No hay insumos — agrega el primero arriba ☝️</div>}
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  )
}
