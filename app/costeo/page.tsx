'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MENU, CATEGORIAS, cargarDatosEmpresa, type Producto } from '@/lib/menu'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

interface Insumo {
  id: string
  nombre: string
  precio_ultimo: number
  stock_actual: number
  unidad: string
  categoria: string
}

interface Ingrediente {
  insumoId: string
  nombre: string
  cantidad: number
  unidad: string
  costo: number
}

interface Receta {
  id: string
  producto_nombre: string
  ingredientes: Ingrediente[]
  costo_total: number
}

export default function CosteoPage() {
  const [menu, setMenu] = useState<Producto[]>(MENU)
  const [categorias, setCategorias] = useState<string[]>(CATEGORIAS)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [margen, setMargen] = useState(65)
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [tab, setTab] = useState<'costeo' | 'recetas'>('costeo')
  const [formNombre, setFormNombre] = useState('')
  const [formIngredientes, setFormIngredientes] = useState<Ingrediente[]>([])
  const [insumoSel, setInsumoSel] = useState('')
  const [cantSel, setCantSel] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const empresaId = await getEmpresaIdActual()

    const catalogoPromise = empresaId
      ? cargarDatosEmpresa(empresaId)
      : Promise.resolve({
          menu: MENU,
          categorias: CATEGORIAS,
          mesas: [],
          metodosPago: [],
        })

    const [{ data: ins, error: insError }, { data: rec, error: recError }, catalogo] =
      await Promise.all([
        empresaId
          ? supabase
              .from('stock_insumos')
              .select('id, nombre, precio_ultimo, stock_actual, unidad, categoria')
              .eq('empresa_id', empresaId)
              .order('nombre')
          : Promise.resolve({ data: [], error: null }),

        empresaId
          ? supabase
              .from('recetas')
              .select('*')
              .eq('empresa_id', empresaId)
              .order('producto_nombre')
          : Promise.resolve({ data: [], error: null }),

        catalogoPromise,
      ])

    if (insError) console.error('Error cargando insumos:', insError)
    if (recError) console.error('Error cargando recetas:', recError)

    if (ins) setInsumos(ins as Insumo[])
    if (rec) setRecetas(rec as Receta[])

    setMenu(catalogo.menu)
    setCategorias(catalogo.categorias)
  }

  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

  const precioSugerido = (costo: number) =>
    Math.ceil(costo / (1 - margen / 100) / 100) * 100

  const margenReal = (costo: number, precioMenu: number) =>
    precioMenu > 0 ? ((precioMenu - costo) / precioMenu) * 100 : null

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 5000)
  }

  function agregarIngrediente() {
    const cantidad = Number(cantSel)

    if (!insumoSel || !cantSel || Number.isNaN(cantidad) || cantidad <= 0) {
      mostrarMensaje('Selecciona insumo y cantidad válida', 'err')
      return
    }

    const ins = insumos.find(i => i.id === insumoSel)

    if (!ins) {
      mostrarMensaje('Insumo no encontrado', 'err')
      return
    }

    const costo = Number(ins.precio_ultimo || 0) * cantidad

    setFormIngredientes(prev => [
      ...prev,
      {
        insumoId: ins.id,
        nombre: ins.nombre,
        cantidad,
        unidad: ins.unidad,
        costo,
      },
    ])

    setInsumoSel('')
    setCantSel('')
  }

  async function guardarReceta() {
    if (!formNombre.trim()) {
      mostrarMensaje('Falta el nombre del plato', 'err')
      return
    }

    if (formIngredientes.length === 0) {
      mostrarMensaje('Agrega al menos 1 ingrediente antes de guardar', 'err')
      return
    }

    const empresaId = await getEmpresaIdActual()

    if (!empresaId) {
      mostrarMensaje('No hay empresa activa', 'err')
      return
    }

    setGuardando(true)

    const costo_total = formIngredientes.reduce((s, i) => s + Number(i.costo || 0), 0)

    const datos = {
      producto_nombre: formNombre.trim(),
      ingredientes: formIngredientes,
      costo_total,
    }

    let error = null

    if (editandoId) {
      const res = await supabase
        .from('recetas')
        .update(datos)
        .eq('empresa_id', empresaId)
        .eq('id', editandoId)

      error = res.error
    } else {
      const res = await supabase
        .from('recetas')
        .insert({
          ...datos,
          empresa_id: empresaId,
        })

      error = res.error
    }

    if (error) {
      console.error('Error guardando receta:', error)
      mostrarMensaje('Error al guardar: ' + error.message, 'err')
      setGuardando(false)
      return
    }

    setFormNombre('')
    setFormIngredientes([])
    setEditandoId(null)
    setInsumoSel('')
    setCantSel('')

    mostrarMensaje(editandoId ? 'Receta actualizada ✓' : 'Receta guardada ✓', 'ok')

    setGuardando(false)
    await cargar()
  }

  function editarReceta(r: Receta) {
    setEditandoId(r.id)
    setFormNombre(r.producto_nombre)
    setFormIngredientes(r.ingredientes || [])
    setTab('recetas')
  }

  async function eliminarReceta(id: string) {
    if (!confirm('¿Eliminar esta receta?')) return

    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return

    const { error } = await supabase
      .from('recetas')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('id', id)

    if (error) {
      mostrarMensaje('Error al eliminar: ' + error.message, 'err')
      return
    }

    setRecetas(prev => prev.filter(r => r.id !== id))
    mostrarMensaje('Receta eliminada', 'ok')
    await cargar()
  }

  const productosConCosto = menu
    .map(p => {
      const receta = recetas.find(
        r => r.producto_nombre?.toLowerCase() === p.nombre.toLowerCase()
      )
      return { ...p, receta: receta || null }
    })
    .filter(p => {
      const enBusqueda =
        busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      const enCat = catFiltro === 'Todas' || p.categoria === catFiltro
      return enBusqueda && enCat
    })

  const conReceta = productosConCosto.filter(p => p.receta)
  const sinReceta = productosConCosto.filter(p => !p.receta)

  const inp: React.CSSProperties = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '8px 10px',
    fontFamily: 'var(--font)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  }

  const sel: React.CSSProperties = { ...inp }
  const insumoActual = insumos.find(i => i.id === insumoSel)

  return (
    <AuthGuard>
      <main
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text)',
          paddingBottom: 60,
        }}
      >
        <Nav active="costeo" />

        <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 14px' }}>
          <div style={{ marginBottom: 20 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                color: 'var(--gold)',
              }}
            >
              💰 Costos y Margen
            </h1>

            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              {recetas.length} platos costeados · {insumos.length} insumos ·{' '}
              {sinReceta.length} sin receta
            </p>
          </div>

          {mensaje && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 14px',
                borderRadius: 8,
                background:
                  mensaje.tipo === 'ok'
                    ? 'rgba(76,175,125,.15)'
                    : 'rgba(220,50,50,.15)',
                border: `1px solid ${
                  mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'
                }`,
                fontSize: 13,
                color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
              }}
            >
              {mensaje.txt}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 20,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {[
              ['costeo', '📊 Costeo'],
              ['recetas', '📋 Recetas'],
            ].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t as 'costeo' | 'recetas')}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  color: tab === t ? 'var(--gold)' : 'var(--muted)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 14,
                  borderBottom:
                    tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}

            <a
              href="/stock"
              style={{
                padding: '10px 18px',
                color: 'var(--muted)',
                fontWeight: 700,
                fontFamily: 'var(--font)',
                fontSize: 14,
                textDecoration: 'none',
                marginLeft: 'auto',
              }}
            >
              🧂 Insumos → Stock
            </a>
          </div>

          {tab === 'costeo' && (
            <div>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Margen objetivo:
                </span>

                <input
                  type="range"
                  min={10}
                  max={90}
                  value={margen}
                  onChange={e => setMargen(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--gold)' }}
                />

                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontWeight: 900,
                    color: 'var(--gold)',
                    fontSize: 22,
                    minWidth: 54,
                  }}
                >
                  {margen}%
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="🔍 Buscar plato..."
                  style={{ ...inp, width: 'auto', flex: 1, minWidth: 180 }}
                />

                <select
                  value={catFiltro}
                  onChange={e => setCatFiltro(e.target.value)}
                  style={{ ...sel, width: 'auto' }}
                >
                  <option value="Todas">Todas las categorías</option>
                  {categorias.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {conReceta.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    marginBottom: 20,
                  }}
                >
                  {[
                    {
                      label: 'Con receta',
                      val: conReceta.length,
                      color: 'var(--green)',
                    },
                    {
                      label: 'Sin receta',
                      val: sinReceta.length,
                      color: 'var(--red)',
                    },
                    {
                      label: 'Margen prom.',
                      val: (() => {
                        const ms = conReceta
                          .map(p => margenReal(p.receta!.costo_total, p.precio))
                          .filter(m => m !== null) as number[]

                        return ms.length > 0
                          ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) + '%'
                          : '-'
                      })(),
                      color: 'var(--gold)',
                    },
                  ].map(s => (
                    <div
                      key={s.label}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '12px 16px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--muted)',
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.label}
                      </div>

                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 22,
                          fontWeight: 700,
                          color: s.color,
                          marginTop: 2,
                        }}
                      >
                        {s.val}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {conReceta.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--green)',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                      fontWeight: 700,
                    }}
                  >
                    ✅ Platos costeados
                  </div>

                  {conReceta.map(p => {
                    const costo = p.receta!.costo_total
                    const sugerido = precioSugerido(costo)
                    const mReal = margenReal(costo, p.precio)

                    const mColor =
                      mReal === null
                        ? 'var(--muted)'
                        : mReal >= 60
                          ? 'var(--green)'
                          : mReal >= 40
                            ? 'var(--gold)'
                            : 'var(--red)'

                    return (
                      <div
                        key={p.id}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>
                              {p.nombre}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {p.categoria}
                            </div>
                          </div>

                          <button
                            onClick={() => editarReceta(p.receta!)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              color: 'var(--muted)',
                              fontSize: 11,
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontFamily: 'var(--font)',
                            }}
                          >
                            ✏️ Editar
                          </button>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 8,
                          }}
                        >
                          {[
                            { label: 'Costo', val: fmt(costo), color: 'var(--red)' },
                            {
                              label: 'Precio actual',
                              val: fmt(p.precio),
                              color: 'var(--text)',
                            },
                            {
                              label: `Sugerido (${margen}%)`,
                              val: fmt(sugerido),
                              color: 'var(--gold)',
                            },
                            {
                              label: 'Margen real',
                              val: mReal !== null ? Math.round(mReal) + '%' : '-',
                              color: mColor,
                            },
                          ].map(col => (
                            <div
                              key={col.label}
                              style={{
                                background: 'var(--bg)',
                                borderRadius: 8,
                                padding: '8px 10px',
                                textAlign: 'center',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  color: 'var(--muted)',
                                  marginBottom: 3,
                                }}
                              >
                                {col.label}
                              </div>

                              <div
                                style={{
                                  fontFamily: 'var(--mono)',
                                  fontWeight: 700,
                                  fontSize: 14,
                                  color: col.color,
                                }}
                              >
                                {col.val}
                              </div>
                            </div>
                          ))}
                        </div>

                        {mReal !== null && mReal < 50 && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '6px 10px',
                              background: 'rgba(220,50,50,.1)',
                              border: '1px solid var(--red)',
                              borderRadius: 7,
                              fontSize: 12,
                              color: 'var(--red)',
                            }}
                          >
                            ⚠️ Margen bajo
                          </div>
                        )}

                        <details style={{ marginTop: 10 }}>
                          <summary
                            style={{
                              fontSize: 12,
                              color: 'var(--muted)',
                              cursor: 'pointer',
                            }}
                          >
                            Ver ingredientes ({p.receta!.ingredientes.length})
                          </summary>

                          {p.receta!.ingredientes.map((ing, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                padding: '4px 0',
                                borderBottom: '1px solid var(--border)',
                              }}
                            >
                              <span style={{ color: 'var(--muted)' }}>
                                {ing.nombre} · {ing.cantidad} {ing.unidad}
                              </span>
                              <span style={{ fontFamily: 'var(--mono)' }}>
                                {fmt(ing.costo)}
                              </span>
                            </div>
                          ))}
                        </details>
                      </div>
                    )
                  })}
                </div>
              )}

              {sinReceta.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--red)',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                      fontWeight: 700,
                    }}
                  >
                    ❌ Sin receta ({sinReceta.length})
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {sinReceta.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFormNombre(p.nombre)
                          setTab('recetas')
                        }}
                        style={{
                          background: 'var(--surface)',
                          border: '1px dashed var(--border)',
                          borderRadius: 10,
                          padding: '12px 14px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'var(--font)',
                          color: 'var(--text)',
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nombre}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            marginTop: 4,
                          }}
                        >
                          {p.categoria} · {fmt(p.precio)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6 }}>
                          + Crear receta →
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'recetas' && (
            <div>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 24,
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 14,
                    color: 'var(--gold)',
                  }}
                >
                  {editandoId ? '✏️ Editar receta' : '➕ Nueva receta'}
                </h2>

                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      display: 'block',
                      marginBottom: 5,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    Nombre del plato
                  </label>

                  <input
                    list="menu-productos"
                    value={formNombre}
                    onChange={e => setFormNombre(e.target.value)}
                    placeholder="Ej: La Felicitta, Arepa con Queso..."
                    style={inp}
                  />

                  <datalist id="menu-productos">
                    {menu.map(p => (
                      <option key={p.id} value={p.nombre} />
                    ))}
                  </datalist>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      display: 'block',
                      marginBottom: 5,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    Agregar ingrediente
                  </label>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px auto',
                      gap: 8,
                    }}
                  >
                    <select
                      value={insumoSel}
                      onChange={e => setInsumoSel(e.target.value)}
                      style={sel}
                    >
                      <option value="">— Selecciona insumo —</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.nombre} · {fmt(i.precio_ultimo)}/{i.unidad}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={cantSel}
                      onChange={e => setCantSel(e.target.value)}
                      placeholder={insumoActual ? insumoActual.unidad : 'Cant.'}
                      style={inp}
                      min={0}
                      step={0.01}
                    />

                    <button
                      type="button"
                      onClick={agregarIngrediente}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--gold)',
                        color: '#000',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Agregar
                    </button>
                  </div>

                  {insumoActual && cantSel && Number(cantSel) > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: 'rgba(212,168,67,.1)',
                        border: '1px solid var(--gold)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      💡 Costo:{' '}
                      <strong style={{ color: 'var(--gold)' }}>
                        {fmt(insumoActual.precio_ultimo * Number(cantSel))}
                      </strong>
                    </div>
                  )}
                </div>

                {formIngredientes.length > 0 && (
                  <div
                    style={{
                      background: 'var(--bg)',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 14,
                    }}
                  >
                    {formIngredientes.map((ing, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '5px 0',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 13,
                        }}
                      >
                        <span>
                          {ing.nombre} · {ing.cantidad} {ing.unidad}
                        </span>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                            {fmt(ing.costo)}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              setFormIngredientes(prev => prev.filter((_, j) => j !== i))
                            }
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 10,
                        fontWeight: 700,
                      }}
                    >
                      <span>Costo total:</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                        {fmt(formIngredientes.reduce((s, i) => s + i.costo, 0))}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={guardarReceta}
                    disabled={guardando}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'var(--gold)',
                      color: '#000',
                      fontWeight: 700,
                      cursor: guardando ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {guardando
                      ? 'Guardando...'
                      : editandoId
                        ? '✓ Actualizar receta'
                        : '✓ Guardar receta'}
                  </button>

                  {editandoId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(null)
                        setFormNombre('')
                        setFormIngredientes([])
                        setInsumoSel('')
                        setCantSel('')
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>

                {insumos.length === 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '8px 12px',
                      background: 'rgba(212,168,67,.1)',
                      border: '1px solid var(--gold)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--gold)',
                    }}
                  >
                    ⚠️ No hay insumos — agrégalos en{' '}
                    <a href="/stock" style={{ color: 'var(--gold)', fontWeight: 700 }}>
                      Stock
                    </a>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recetas.map(r => (
                  <div
                    key={r.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.producto_nombre}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--muted)',
                            marginTop: 2,
                          }}
                        >
                          {(r.ingredientes || []).length} ingredientes
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontWeight: 700,
                            color: 'var(--red)',
                          }}
                        >
                          {fmt(r.costo_total)}
                        </span>

                        <button
                          type="button"
                          onClick={() => editarReceta(r)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--muted)',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontFamily: 'var(--font)',
                          }}
                        >
                          ✏️
                        </button>

                        <button
                          type="button"
                          onClick={() => eliminarReceta(r.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--red)',
                            borderRadius: 6,
                            color: 'var(--red)',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontFamily: 'var(--font)',
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {recetas.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 40,
                      color: 'var(--muted)',
                      fontSize: 13,
                    }}
                  >
                    No hay recetas todavía — crea la primera arriba
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  )
}
