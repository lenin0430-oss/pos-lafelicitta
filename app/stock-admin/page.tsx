'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import { INSUMOS_BASE_LA_FELICITTA } from '@/lib/insumosBaseLaFelicitta'
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

const CATEGORIAS = ['Carnes', 'Lácteos', 'Panadería', 'Verduras', 'Salsas y condimentos', 'Aceites', 'Congelados', 'Empaques', 'Bebidas', 'Pasapalos', 'Otros']
const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidad', 'docena', 'caja']

export default function StockAdminPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [form, setForm] = useState({ nombre: '', unidad: 'kg', categoria: 'Otros', stock_actual: '0', stock_minimo: '1', precio_ultimo: '0' })

  useEffect(() => { cargar() }, [])

  function msg(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setItems([]); return }
    const { data, error } = await supabase
      .from('stock_insumos')
      .select('id,nombre,unidad,stock_actual,stock_minimo,precio_ultimo,categoria')
      .eq('empresa_id', empresaId)
      .order('nombre')
    if (error) { msg('Error cargando insumos: ' + error.message, 'err'); return }
    setItems((data || []) as StockItem[])
  }

  function limpiar() {
    setEditandoId(null)
    setForm({ nombre: '', unidad: 'kg', categoria: 'Otros', stock_actual: '0', stock_minimo: '1', precio_ultimo: '0' })
  }

  function editar(item: StockItem) {
    setEditandoId(item.id)
    setForm({
      nombre: item.nombre,
      unidad: item.unidad || 'kg',
      categoria: item.categoria || 'Otros',
      stock_actual: String(item.stock_actual ?? 0),
      stock_minimo: String(item.stock_minimo ?? 1),
      precio_ultimo: String(item.precio_ultimo ?? 0),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function guardar() {
    if (!form.nombre.trim()) { msg('Falta nombre del insumo', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }
    setGuardando(true)
    const datos = {
      nombre: form.nombre.trim(),
      unidad: form.unidad,
      categoria: form.categoria,
      stock_actual: Number(form.stock_actual) || 0,
      stock_minimo: Number(form.stock_minimo) || 0,
      precio_ultimo: Number(form.precio_ultimo) || 0,
      updated_at: new Date().toISOString(),
    }
    const { error } = editandoId
      ? await supabase.from('stock_insumos').update(datos).eq('empresa_id', empresaId).eq('id', editandoId)
      : await supabase.from('stock_insumos').insert({ ...datos, empresa_id: empresaId })
    if (error) msg('Error guardando: ' + error.message, 'err')
    else { msg(editandoId ? 'Insumo actualizado' : 'Insumo creado', 'ok'); limpiar(); await cargar() }
    setGuardando(false)
  }

  async function cargarBase() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }
    setGuardando(true)
    const existentes = new Set(items.map(i => i.nombre.trim().toLowerCase()))
    const nuevos = INSUMOS_BASE_LA_FELICITTA
      .filter(i => !existentes.has(i.nombre.trim().toLowerCase()))
      .map(i => ({
        empresa_id: empresaId,
        nombre: i.nombre,
        unidad: i.unidad,
        categoria: i.categoria,
        stock_actual: 0,
        stock_minimo: i.stock_minimo,
        precio_ultimo: 0,
        updated_at: new Date().toISOString(),
      }))
    if (nuevos.length === 0) { msg('No hay insumos nuevos para cargar', 'ok'); setGuardando(false); return }
    const { error } = await supabase.from('stock_insumos').insert(nuevos)
    if (error) msg('Error cargando base: ' + error.message, 'err')
    else { msg('Insumos base cargados: ' + nuevos.length, 'ok'); await cargar() }
    setGuardando(false)
  }

  const filtrados = useMemo(() => items.filter(i => {
    const okTexto = !busqueda || i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const okCat = categoriaFiltro === 'Todas' || i.categoria === categoriaFiltro
    return okTexto && okCat
  }), [items, busqueda, categoriaFiltro])

  const faltantes = INSUMOS_BASE_LA_FELICITTA.filter(base => !items.some(i => i.nombre.toLowerCase() === base.nombre.toLowerCase())).length
  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="stock" />
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 14px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--gold)' }}>Administrador de insumos</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{items.length} insumos cargados · {faltantes} faltantes del catalogo base</p>
          {mensaje && <div style={{ margin: '12px 0', padding: '9px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{mensaje.txt}</div>}

          <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
            <button onClick={cargarBase} disabled={guardando} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 800, cursor: 'pointer' }}>{guardando ? 'Procesando...' : 'Cargar insumos base La Felicitta'}</button>
            <a href="/stock" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Volver a Stock</a>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, color: 'var(--gold)', margin: '0 0 12px' }}>{editandoId ? 'Editar insumo' : 'Crear insumo manual'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={label}>Nombre del insumo</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Aceite vegetal" style={inp} />
              </div>
              <div>
                <label style={label}>Unidad de medida</label>
                <select value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} style={inp}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
              </div>
              <div>
                <label style={label}>Categoria</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={inp}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={label}>Stock actual</label>
                <input type="number" value={form.stock_actual} onChange={e => setForm({ ...form, stock_actual: e.target.value })} placeholder="Ej: 4" style={inp} />
              </div>
              <div>
                <label style={label}>Stock minimo</label>
                <input type="number" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} placeholder="Ej: 1" style={inp} />
              </div>
              <div>
                <label style={label}>Precio unitario</label>
                <input type="number" value={form.precio_ultimo} onChange={e => setForm({ ...form, precio_ultimo: e.target.value })} placeholder="Ej: 1500" style={inp} />
              </div>
              <button onClick={guardar} disabled={guardando} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 800, height: 38 }}>{editandoId ? 'Actualizar' : 'Guardar'}</button>
              {editandoId && <button onClick={limpiar} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', height: 38 }}>Cancelar</button>}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>Precio unitario = precio de compra dividido entre cantidad comprada. Ejemplo: 25 kg por $15.500 = $620 por kg.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8, marginBottom: 12 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar insumo" style={inp} />
            <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} style={inp}><option>Todas</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(i => (
              <div key={i.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{i.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Categoria: {i.categoria} · Stock actual: {i.stock_actual} {i.unidad} · Stock minimo: {i.stock_minimo} · Precio unitario: {fmt(i.precio_ultimo)}/{i.unidad}</div>
                </div>
                <button onClick={() => editar(i)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontWeight: 700 }}>Editar</button>
              </div>
            ))}
            {filtrados.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Sin insumos para mostrar</div>}
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
