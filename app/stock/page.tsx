'use client'
import { useState, useEffect } from 'react'
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
  updated_at: string
}

interface Compra {
  id: string
  insumo_id: string
  insumo_nombre: string
  cantidad: number
  precio_total: number
  precio_unitario: number
  fecha: string
  nota: string
}

interface MovimientoManual {
  id: string
  insumo_id: string
  insumo_nombre: string
  tipo: 'merma' | 'consumo_interno' | 'ajuste'
  cantidad: number
  motivo: string
  fecha: string
}

const CATEGORIAS_STOCK = ['Carnes', 'Lácteos', 'Panadería', 'Verduras', 'Salsas y condimentos', 'Aceites', 'Otros']
const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja']

const TIPO_CONFIG: Record<MovimientoManual['tipo'], { label: string; color: string }> = {
  merma:            { label: '🗑 Merma',           color: 'var(--red)'  },
  consumo_interno:  { label: '🍽 Consumo interno', color: 'var(--gold)' },
  ajuste:           { label: '🔧 Ajuste',          color: 'var(--muted)'},
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoManual[]>([])
  const [tab, setTab] = useState<'stock'|'comprar'|'mermas'|'historial'>('stock')
  const [mensaje, setMensaje] = useState<{txt:string;tipo:'ok'|'err'}|null>(null)
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [historialFiltro, setHistorialFiltro] = useState<'todos'|'compras'|'movimientos'>('todos')
  const [formNombre, setFormNombre] = useState('')
  const [formUnidad, setFormUnidad] = useState('kg')
  const [formMinimo, setFormMinimo] = useState('1')
  const [formCategoria, setFormCategoria] = useState('Carnes')
  const [formPrecio, setFormPrecio] = useState('')
  const [formStockInicial, setFormStockInicial] = useState('0')
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false)
  const [editandoId, setEditandoId] = useState<string|null>(null)
  const [compraItem, setCompraItem] = useState('')
  const [compraCantidad, setCompraCantidad] = useState('')
  const [compraPrecio, setCompraPrecio] = useState('')
  const [compraNota, setCompraNota] = useState('')
  const [mermaItem, setMermaItem] = useState('')
  const [mermaCantidad, setMermaCantidad] = useState('')
  const [mermaMotivo, setMermaMotivo] = useState('')
  const [mermaTipo, setMermaTipo] = useState<'merma'|'consumo_interno'|'ajuste'>('merma')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setItems([]); setCompras([]); setMovimientos([]); return }
    const [{ data: s }, { data: c }, { data: m }] = await Promise.all([
      supabase.from('stock_insumos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('stock_compras').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(50),
      supabase.from('stock_movimientos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(50),
    ])
    if (s) setItems(s)
    if (c) setCompras(c)
    if (m) setMovimientos(m)
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  function mostrarMensaje(txt: string, tipo: 'ok'|'err') { setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 3500) }
  const itemsFiltrados = items.filter(i => busqueda === '' || i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const agotados = items.filter(i => i.stock_actual <= 0)
  const bajos = items.filter(i => i.stock_actual > 0 && i.stock_actual <= i.stock_minimo)
  const ok = items.filter(i => i.stock_actual > i.stock_minimo)
  function abrirEdicion(item: StockItem) { setEditandoId(item.id); setFormNombre(item.nombre); setFormUnidad(item.unidad); setFormMinimo(String(item.stock_minimo)); setFormCategoria(item.categoria); setFormPrecio(String(item.precio_ultimo)); setFormStockInicial(String(item.stock_actual)); setMostrarFormNuevo(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function crearInsumo() {
    if (!formNombre || !formPrecio) { mostrarMensaje('Nombre y precio son obligatorios', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { mostrarMensaje('No hay empresa activa', 'err'); return }
    setGuardando(true)
    const datos = { nombre: formNombre.trim(), unidad: formUnidad, stock_actual: parseFloat(formStockInicial)||0, stock_minimo: parseFloat(formMinimo)||1, precio_ultimo: parseFloat(formPrecio), categoria: formCategoria, updated_at: new Date().toISOString() }
    if (editandoId) { const { error } = await supabase.from('stock_insumos').update(datos).eq('empresa_id', empresaId).eq('id', editandoId); if (error) mostrarMensaje('Error: '+error.message,'err'); else mostrarMensaje('Actualizado ✓','ok') }
    else { const { error } = await supabase.from('stock_insumos').insert({...datos, empresa_id: empresaId}); if (error) mostrarMensaje('Error: '+error.message,'err'); else mostrarMensaje('Creado ✓','ok') }
    setFormNombre(''); setFormPrecio(''); setFormStockInicial('0'); setMostrarFormNuevo(false); setEditandoId(null); setGuardando(false); cargar()
  }
  async function registrarCompra() {
    if (!compraItem||!compraCantidad||!compraPrecio) { mostrarMensaje('Completa todos los campos','err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    setGuardando(true)
    const item = items.find(i => i.id === compraItem)!
    const cantidad = parseFloat(compraCantidad), precioTotal = parseFloat(compraPrecio), precioUnitario = precioTotal/cantidad
    await supabase.from('stock_compras').insert({ empresa_id: empresaId, insumo_id: item.id, insumo_nombre: item.nombre, cantidad, precio_total: precioTotal, precio_unitario: precioUnitario, fecha: new Date().toISOString(), nota: compraNota.trim() })
    await supabase.from('stock_insumos').update({ stock_actual: item.stock_actual+cantidad, precio_ultimo: precioUnitario, updated_at: new Date().toISOString() }).eq('empresa_id', empresaId).eq('id', item.id)
    mostrarMensaje(`+${cantidad} ${item.unidad} de ${item.nombre} ✓`,'ok')
    setCompraItem(''); setCompraCantidad(''); setCompraPrecio(''); setCompraNota(''); setGuardando(false); cargar()
  }
  async function registrarMerma() {
    if (!mermaItem||!mermaCantidad) { mostrarMensaje('Selecciona insumo y cantidad','err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    setGuardando(true)
    const item = items.find(i => i.id === mermaItem)!
    const cantidad = parseFloat(mermaCantidad)
    if (cantidad > item.stock_actual) { mostrarMensaje('No hay suficiente stock','err'); setGuardando(false); return }
    await supabase.from('stock_movimientos').insert({ empresa_id: empresaId, insumo_id: item.id, insumo_nombre: item.nombre, tipo: mermaTipo, cantidad, motivo: mermaMotivo.trim()||mermaTipo, fecha: new Date().toISOString() })
    await supabase.from('stock_insumos').update({ stock_actual: item.stock_actual-cantidad, updated_at: new Date().toISOString() }).eq('empresa_id', empresaId).eq('id', item.id)
    mostrarMensaje(`${TIPO_CONFIG[mermaTipo].label} -${cantidad} ${item.unidad} de ${item.nombre}`,'ok')
    setMermaItem(''); setMermaCantidad(''); setMermaMotivo(''); setGuardando(false); cargar()
  }
  async function eliminarInsumo(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    await supabase.from('stock_insumos').delete().eq('empresa_id', empresaId).eq('id', id)
    mostrarMensaje('Eliminado','ok'); cargar()
  }
  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 11px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const sel: React.CSSProperties = { ...inp }
  const valorTotal = items.reduce((s,i) => s+i.stock_actual*i.precio_ultimo, 0)
  const hoy = new Date().toISOString().split('T')[0]
  const comprasHoy = compras.filter(c => c.fecha.startsWith(hoy))
  const gastoHoy = comprasHoy.reduce((s,c) => s+c.precio_total, 0)
  type EntradaHistorial = { _tipo: 'compra'; fecha: string; data: Compra } | { _tipo: 'movimiento'; fecha: string; data: MovimientoManual }
  const historialUnificado: EntradaHistorial[] = [...compras.map(c => ({ _tipo: 'compra' as const, fecha: c.fecha, data: c })), ...movimientos.map(m => ({ _tipo: 'movimiento' as const, fecha: m.fecha, data: m }))].sort((a,b) => b.fecha.localeCompare(a.fecha))
  const historialFiltrado = historialUnificado.filter(e => { if (historialFiltro==='compras') return e._tipo==='compra'; if (historialFiltro==='movimientos') return e._tipo==='movimiento'; return true })
  const perdidaMermas = movimientos.filter(m => m.tipo==='merma').reduce((s,m) => { const item=items.find(i => i.id===m.insumo_id); return s+(item?item.precio_ultimo*m.cantidad:0) }, 0)

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
        <Nav active="/stock" />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 14px' }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--gold)' }}>📦 Control de Stock</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{items.length} insumos · Valor en bodega: <strong style={{ color: 'var(--gold)' }}>{fmt(valorTotal)}</strong> · Comprado hoy: <strong style={{ color: 'var(--green)' }}>{fmt(gastoHoy)}</strong>{perdidaMermas > 0 && <> · Pérdida mermas: <strong style={{ color: 'var(--red)' }}>{fmt(perdidaMermas)}</strong></>}</p>
          </div>
          {agotados.length > 0 && <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,50,50,.15)', border: '1px solid var(--red)', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>🔴 AGOTADO: {agotados.map(i => i.nombre).join(', ')}</div>}
          {bajos.length > 0 && <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(212,168,67,.1)', border: '1px solid var(--gold)', fontSize: 13, color: 'var(--gold)' }}>⚠️ Stock bajo: {bajos.map(i => `${i.nombre} (${i.stock_actual} ${i.unidad})`).join(', ')}</div>}
          {mensaje && <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: mensaje.tipo==='ok'?'rgba(76,175,125,.15)':'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo==='ok'?'var(--green)':'var(--red)'}`, fontSize: 13, color: mensaje.tipo==='ok'?'var(--green)':'var(--red)' }}>{mensaje.txt}</div>}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
            {([['stock','📦 Stock'],['comprar','🛒 Compra del día'],['mermas','⚠️ Mermas'],['historial','📋 Historial']] as const).map(([t, label]) => (<button key={t} onClick={() => setTab(t)} style={{ padding: '10px 16px', border: 'none', background: 'transparent', color: tab===t?'var(--gold)':'var(--muted)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, borderBottom: tab===t?'2px solid var(--gold)':'2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>{label}</button>))}
          </div>
          {tab === 'stock' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar insumo..." style={{ ...inp, flex: 1 }} />
                <button onClick={() => setMostrarFormNuevo(!mostrarFormNuevo)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', fontSize: 13 }}>+ Nuevo insumo</button>
              </div>
              {mostrarFormNuevo && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>{editandoId ? '✏️ Editar insumo' : '➕ Nuevo insumo'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nombre</label><input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: Pollo entero" style={inp} /></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Categoría</label><select value={formCategoria} onChange={e => setFormCategoria(e.target.value)} style={sel}>{CATEGORIAS_STOCK.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Unidad</label><select value={formUnidad} onChange={e => setFormUnidad(e.target.value)} style={sel}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Precio ($)</label><input type="number" value={formPrecio} onChange={e => setFormPrecio(e.target.value)} placeholder="Ej: 5000" style={inp} /></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Stock mínimo</label><input type="number" value={formMinimo} onChange={e => setFormMinimo(e.target.value)} placeholder="1" style={inp} /></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Stock inicial</label><input type="number" value={formStockInicial} onChange={e => setFormStockInicial(e.target.value)} placeholder="0" style={inp} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={crearInsumo} disabled={guardando} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>{guardando?'...':editandoId?'✓ Guardar':'✓ Crear insumo'}</button>
                    <button onClick={() => { setMostrarFormNuevo(false); setEditandoId(null); setFormNombre(''); setFormPrecio('') }} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancelar</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                {[{ label: '🟢 OK', val: ok.length, color: 'var(--green)' }, { label: '🟡 Bajo', val: bajos.length, color: 'var(--gold)' }, { label: '🔴 Agotado', val: agotados.length, color: 'var(--red)' }].map(s => (<div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div><div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>{s.val}</div></div>))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itemsFiltrados.map(item => {
                  const pct = item.stock_minimo>0?Math.min((item.stock_actual/(item.stock_minimo*3))*100,100):100
                  const color = item.stock_actual<=0?'var(--red)':item.stock_actual<=item.stock_minimo?'var(--gold)':'var(--green)'
                  return (<div key={item.id} style={{ background: 'var(--surface)', border: `1px solid ${item.stock_actual<=0?'var(--red)':item.stock_actual<=item.stock_minimo?'var(--gold)':'var(--border)'}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div><div style={{ fontWeight: 700, fontSize: 14 }}>{item.nombre}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.categoria} · {fmt(item.precio_ultimo)}/{item.unidad}</div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div><div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18, color }}>{item.stock_actual} <span style={{ fontSize: 12, fontWeight: 400 }}>{item.unidad}</span></div><div style={{ fontSize: 10, color: 'var(--muted)' }}>mín: {item.stock_minimo} {item.unidad}</div></div>
                        <button onClick={() => abrirEdicion(item)} style={{ background: 'transparent', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                        <button onClick={() => eliminarInsumo(item.id, item.nombre)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Valor: {fmt(item.stock_actual*item.precio_ultimo)}</span>
                      <button onClick={() => { setCompraItem(item.id); setTab('comprar') }} style={{ fontSize: 11, color: 'var(--gold)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>+ Registrar compra →</button>
                    </div>
                  </div>)
                })}
                {itemsFiltrados.length===0 && <div style={{ textAlign: 'center', padding: 50, color: 'var(--muted)', fontSize: 13 }}>{items.length===0?'No hay insumos — agrega el primero':'Sin resultados'}</div>}
              </div>
            </div>
          )}
          {tab === 'comprar' && (
            <div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--gold)' }}>🛒 Registrar compra de hoy</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Cada vez que compres algo, regístralo aquí. El stock se actualiza automáticamente.</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>¿Qué compraste?</label>
                    <select value={compraItem} onChange={e => setCompraItem(e.target.value)} style={sel}>
                      <option value="">— Selecciona insumo —</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.nombre} (stock: {i.stock_actual} {i.unidad})</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cantidad {compraItem&&`(${items.find(i=>i.id===compraItem)?.unidad})`}</label><input type="number" value={compraCantidad} onChange={e => setCompraCantidad(e.target.value)} placeholder="Ej: 5" style={inp} min={0} step={0.1} /></div>
                    <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Precio total ($)</label><input type="number" value={compraPrecio} onChange={e => setCompraPrecio(e.target.value)} placeholder="Ej: 8500" style={inp} /></div>
                  </div>
                  {compraCantidad && compraPrecio && parseFloat(compraCantidad)>0 && <div style={{ padding: '8px 12px', background: 'rgba(212,168,67,.1)', border: '1px solid var(--gold)', borderRadius: 8, fontSize: 13 }}>💡 Precio/unidad: <strong style={{ color: 'var(--gold)' }}>{fmt(parseFloat(compraPrecio)/parseFloat(compraCantidad))}</strong></div>}
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nota</label><input value={compraNota} onChange={e => setCompraNota(e.target.value)} placeholder="Ej: Feria, Mayorista..." style={inp} /></div>
                  <button onClick={registrarCompra} disabled={guardando} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14 }}>{guardando?'Registrando...':'✓ Registrar compra'}</button>
                </div>
              </div>
              {comprasHoy.length>0 && <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>Compras de hoy — Total: {fmt(gastoHoy)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {comprasHoy.map(c => (<div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.insumo_nombre}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.cantidad} {items.find(i=>i.id===c.insumo_id)?.unidad??'und'} · {fmt(c.precio_unitario)}/u{c.nota&&` · ${c.nota}`}</div></div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{fmt(c.precio_total)}</div>
                  </div>))}
                </div>
              </div>}
            </div>
          )}
          {tab === 'mermas' && (
            <div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--gold)' }}>⚠️ Registrar merma o ajuste</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Registra lo que se botó, se consumió o cualquier diferencia de stock.</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {[['merma','🗑 Merma'],['consumo_interno','🍽 Consumo'],['ajuste','🔧 Ajuste']].map(([v,label]) => (<button key={v} onClick={() => setMermaTipo(v as any)} style={{ flex: 1, padding: '9px 8px', borderRadius: 8, border: `1px solid ${mermaTipo===v?'var(--gold)':'var(--border)'}`, background: mermaTipo===v?'rgba(212,168,67,.15)':'transparent', color: mermaTipo===v?'var(--gold)':'var(--muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12 }}>{label}</button>))}
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Insumo</label>
                    <select value={mermaItem} onChange={e => setMermaItem(e.target.value)} style={sel}>
                      <option value="">— Selecciona —</option>
                      {items.filter(i=>i.stock_actual>0).map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.stock_actual} {i.unidad})</option>)}
                    </select>
                  </div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cantidad {mermaItem&&`(${items.find(i=>i.id===mermaItem)?.unidad})`}</label><input type="number" value={mermaCantidad} onChange={e => setMermaCantidad(e.target.value)} placeholder="0.5" style={inp} min={0} step={0.01} /></div>
                  {mermaItem&&mermaCantidad && <div style={{ padding: '8px 12px', background: 'rgba(220,50,50,.08)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>💸 Pérdida estimada: {fmt((items.find(i=>i.id===mermaItem)?.precio_ultimo||0)*parseFloat(mermaCantidad))}</div>}
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Motivo</label><input value={mermaMotivo} onChange={e => setMermaMotivo(e.target.value)} placeholder="Se venció, se cayó..." style={inp} /></div>
                  <button onClick={registrarMerma} disabled={guardando} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14 }}>{guardando?'Registrando...':'✓ Registrar'}</button>
                </div>
              </div>
            </div>
          )}
          {tab === 'historial' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {([['todos','Todos'],['compras','🛒 Compras'],['movimientos','⚠️ Mermas']] as const).map(([v,label]) => (<button key={v} onClick={() => setHistorialFiltro(v)} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${historialFiltro===v?'var(--gold)':'var(--border)'}`, background: historialFiltro===v?'var(--gold)':'transparent', color: historialFiltro===v?'#000':'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{label}</button>))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historialFiltrado.map((entrada, idx) => {
                  if (entrada._tipo==='compra') {
                    const c = entrada.data as Compra
                    const unidad = items.find(i=>i.id===c.insumo_id)?.unidad??'und'
                    return (<div key={`c-${c.id}-${idx}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                      <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(76,175,125,.12)', border: '1px solid var(--green)', borderRadius: 4, padding: '1px 6px' }}>🛒 COMPRA</span><span style={{ fontWeight: 600, fontSize: 13 }}>{c.insumo_nombre}</span></div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>+{c.cantidad} {unidad} · {fmt(c.precio_unitario)}/{unidad} · {new Date(c.fecha).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div></div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>+{fmt(c.precio_total)}</div>
                    </div>)
                  } else {
                    const m = entrada.data as MovimientoManual
                    const cfg = TIPO_CONFIG[m.tipo]??{label:m.tipo,color:'var(--muted)'}
                    const item = items.find(i=>i.id===m.insumo_id)
                    const perdida = item?item.precio_ultimo*m.cantidad:0
                    return (<div key={`m-${m.id}-${idx}`} style={{ background: 'var(--surface)', border: `1px solid ${m.tipo==='merma'?'rgba(220,50,50,.3)':'var(--border)'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                      <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: m.tipo==='merma'?'rgba(220,50,50,.1)':'rgba(212,168,67,.1)', border: `1px solid ${cfg.color}`, borderRadius: 4, padding: '1px 6px' }}>{cfg.label.toUpperCase()}</span><span style={{ fontWeight: 600, fontSize: 13 }}>{m.insumo_nombre}</span></div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>-{m.cantidad} {item?.unidad??'und'} · {m.motivo} · {new Date(m.fecha).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div></div>
                      {perdida>0 && <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>-{fmt(perdida)}</div>}
                    </div>)
                  }
                })}
                {historialFiltrado.length===0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Sin registros todavía</div>}
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  )
}
'use client'
import Link from 'next/link'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

export default function StockPage() {
  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
        <Nav active="stock" />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: 'var(--gold)' }}>📦 Control de Stock</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 18px' }}>
              Para crear, editar, corregir categorías, cambiar precios y cargar insumos base usa el administrador completo.
            </p>
            <Link href="/stock-admin" style={{ display: 'block', textAlign: 'center', padding: '13px 16px', borderRadius: 10, background: 'var(--gold)', color: '#000', fontWeight: 900, textDecoration: 'none' }}>
              Abrir administrador editable de insumos
            </Link>
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
