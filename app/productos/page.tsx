'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface Categoria {
  id: string
  nombre: string
}

interface Producto {
  id: string
  categoria_id: string | null
  nombre: string
  precio: number
  disponible: boolean
  activo: boolean
}

export default function ProductosPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [cambios, setCambios] = useState<Record<string, string>>({})

  // Form nuevo producto
  const [form, setForm] = useState({ nombre: '', precio: '', categoria_id: '' })
  const [creando, setCreando] = useState(false)

  useEffect(() => { cargar() }, [])

  function msg(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3500)
  }

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return

    const [{ data: cats, error: errCat }, { data: prods, error: errProd }] = await Promise.all([
      supabase.from('categorias').select('id,nombre').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('productos').select('id,categoria_id,nombre,precio,disponible,activo').eq('empresa_id', empresaId).order('nombre'),
    ])

    if (errCat) msg('Error cargando categorías: ' + errCat.message, 'err')
    if (errProd) msg('Error cargando productos: ' + errProd.message, 'err')

    setCategorias((cats || []) as Categoria[])
    setProductos((prods || []) as Producto[])
  }

  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre || 'Sin categoría'

  const filtrados = useMemo(() => productos.filter(p => {
    const okTexto = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const okCat = categoriaFiltro === 'Todas' || nombreCategoria(p.categoria_id) === categoriaFiltro
    return okTexto && okCat
  }), [productos, busqueda, categoriaFiltro, categorias])

  function actualizarPrecioLocal(id: string, valor: string) {
    setCambios(prev => ({ ...prev, [id]: valor }))
  }

  async function guardarPrecio(p: Producto) {
    const nuevoValor = cambios[p.id]
    if (nuevoValor === undefined) return
    const precioNum = Number(nuevoValor)
    if (!precioNum || precioNum <= 0) { msg('Precio inválido', 'err'); return }
    setGuardandoId(p.id)
    const { error } = await supabase.from('productos').update({ precio: precioNum }).eq('id', p.id)
    if (error) { msg('Error al guardar: ' + error.message, 'err') }
    else {
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, precio: precioNum } : x))
      setCambios(prev => { const c = { ...prev }; delete c[p.id]; return c })
      msg('Precio actualizado ✓', 'ok')
    }
    setGuardandoId(null)
  }

  async function toggleActivo(p: Producto) {
    const nuevoEstado = !p.activo
    setGuardandoId(p.id)
    const { error } = await supabase.from('productos').update({ activo: nuevoEstado, disponible: nuevoEstado }).eq('id', p.id)
    if (error) { msg('Error al cambiar estado: ' + error.message, 'err') }
    else {
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: nuevoEstado, disponible: nuevoEstado } : x))
      msg(nuevoEstado ? 'Producto activado ✓' : 'Producto desactivado ✓', 'ok')
    }
    setGuardandoId(null)
  }

  async function crearProducto() {
    if (!form.nombre.trim()) { msg('Falta el nombre del producto', 'err'); return }
    if (!form.precio || Number(form.precio) <= 0) { msg('Precio inválido', 'err'); return }
    if (!form.categoria_id) { msg('Selecciona una categoría', 'err'); return }
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }

    setCreando(true)
    const { error } = await supabase.from('productos').insert({
      empresa_id: empresaId,
      categoria_id: form.categoria_id,
      nombre: form.nombre.trim(),
      precio: Number(form.precio),
      disponible: true,
      activo: true,
    })
    if (error) msg('Error al crear: ' + error.message, 'err')
    else { msg('Producto creado ✓', 'ok'); setForm({ nombre: '', precio: '', categoria_id: '' }); await cargar() }
    setCreando(false)
  }

  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }
  return (
    <AuthGuard rolRequerido="admin">
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="/productos" />
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 14px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--gold)' }}>Productos y precios</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{productos.length} productos · {productos.filter(p => p.activo).length} activos</p>

          {mensaje && (
            <div style={{ margin: '12px 0', padding: '9px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
              {mensaje.txt}
            </div>
          )}

          {/* Crear producto nuevo */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, color: 'var(--gold)', margin: '0 0 12px' }}>Agregar producto nuevo</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={label}>Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Empanada de Pernil" style={inp} />
              </div>
              <div>
                <label style={label}>Precio</label>
                <input type="number" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} placeholder="Ej: 2500" style={inp} />
              </div>
              <div>
                <label style={label}>Categoría</label>
                <select value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })} style={inp}>
                  <option value="">Selecciona...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <button onClick={crearProducto} disabled={creando} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 800, height: 38, cursor: 'pointer' }}>
                {creando ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8, marginBottom: 12 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto" style={inp} />
            <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} style={inp}>
              <option>Todas</option>
              {categorias.map(c => <option key={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Lista de productos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(p => {
              const valorInput = cambios[p.id] !== undefined ? cambios[p.id] : String(p.precio)
              const hayCambio = cambios[p.id] !== undefined && Number(cambios[p.id]) !== p.precio
              return (
                <div key={p.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 140px auto auto', gap: 10, alignItems: 'center',
                  opacity: p.activo ? 1 : 0.5,
                }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{nombreCategoria(p.categoria_id)} · {p.activo ? 'Activo' : 'Inactivo'}</div>
                  </div>

                  <input
                    type="number"
                    value={valorInput}
                    onChange={e => actualizarPrecioLocal(p.id, e.target.value)}
                    style={{ ...inp, textAlign: 'right', fontWeight: 700 }}
                  />

                  <button
                    onClick={() => guardarPrecio(p)}
                    disabled={!hayCambio || guardandoId === p.id}
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: 'none',
                      background: hayCambio ? 'var(--gold)' : 'var(--surface2)',
                      color: hayCambio ? '#000' : 'var(--muted)',
                      fontWeight: 700, cursor: hayCambio ? 'pointer' : 'default', fontSize: 13,
                    }}
                  >
                    {guardandoId === p.id ? '...' : 'Guardar'}
                  </button>

                  <button
                    onClick={() => toggleActivo(p)}
                    disabled={guardandoId === p.id}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${p.activo ? 'var(--red)' : 'var(--green)'}`,
                      background: 'transparent',
                      color: p.activo ? 'var(--red)' : 'var(--green)',
                      fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                    }}
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              )
            })}
            {filtrados.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Sin productos para mostrar</div>}
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
  
