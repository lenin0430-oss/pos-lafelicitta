'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MENU, MESAS, METODOS_PAGO, CATEGORIAS, type Producto } from '@/lib/menu'

interface ItemComanda {
  id: number
  producto: Producto
  cantidad: number
  nota: string
}

type TipoServicio = 'Servir en mesa' | 'Para llevar' | 'Delivery'
const TIPOS_SERVICIO: TipoServicio[] = ['Servir en mesa', 'Para llevar', 'Delivery']
const EMOJI_TIPO: Record<TipoServicio, string> = {
  'Servir en mesa': '🍽',
  'Para llevar': '🥡',
  'Delivery': '🚗',
}

export default function CajaPage() {
  const [mesa, setMesa] = useState('Mesa 1')
  const [mesero, setMesero] = useState('')
  const [personas, setPersonas] = useState(2)
  const [metodoPago, setMetodoPago] = useState('Débito')
  const [tipoServicio, setTipoServicio] = useState<TipoServicio>('Servir en mesa')
  const [items, setItems] = useState<ItemComanda[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0] || 'Burgers')
  const [busqueda, setBusqueda] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ordenNum, setOrdenNum] = useState(1)
  const [hora, setHora] = useState('')
  const [mensaje, setMensaje] = useState<{txt: string, tipo: 'ok'|'err'} | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const n = parseInt(localStorage.getItem('lf_orden_num') || '1')
    setOrdenNum(n)
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  // Auto-ajustar tipo de servicio según mesa
  useEffect(() => {
    if (mesa === 'Para llevar') setTipoServicio('Para llevar')
    else if (mesa === 'Delivery') setTipoServicio('Delivery')
    else setTipoServicio('Servir en mesa')
  }, [mesa])

  const total = items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const productosFiltrados = MENU.filter(p => {
    if (busqueda !== '') return p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return p.categoria === categoriaActiva
  })

  function agregarProducto(p: Producto) {
    setItems(prev => {
      const existe = prev.find(i => i.producto.id === p.id && i.nota === '')
      if (existe) return prev.map(i => i.producto.id === p.id && i.nota === '' ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { id: Date.now(), producto: p, cantidad: 1, nota: '' }]
    })
  }

  function cambiarCantidad(id: number, delta: number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i))
  }

  function eliminarItem(id: number) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3000)
  }

  async function registrarVenta() {
    if (items.length === 0) { mostrarMensaje('Agrega productos primero', 'err'); return }
    setGuardando(true)
    try {
      const { error } = await supabase.from('ventas').insert({
        numero: ordenNum,
        mesa,
        mesero: mesero || 'Caja',
        personas,
        metodo_pago: metodoPago,
        tipo_servicio: tipoServicio,
        total,
        items: items.map(i => ({
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precio_unit: i.producto.precio,
          nota: i.nota
        })),
        nota_general: nota || null,
        estado: 'pendiente',
        created_at: new Date().toISOString()
      })
      if (error) throw error
      mostrarMensaje(`Venta #${ordenNum} registrada ✓`, 'ok')
      const nuevoNum = ordenNum + 1
      setOrdenNum(nuevoNum)
      localStorage.setItem('lf_orden_num', String(nuevoNum))
    } catch (e: any) {
      mostrarMensaje('Error: ' + e.message, 'err')
    }
    setGuardando(false)
  }

  async function registrarEImprimir() {
    await registrarVenta()
    setTimeout(() => window.print(), 400)
  }

  function nuevaComanda() {
    if (items.length > 0 && !confirm('¿Limpiar comanda actual?')) return
    setItems([])
    setNota('')
    setBusqueda('')
  }

  const fechaHoy = new Date().toLocaleDateString('es-CL')
  const horaImpresion = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* ── TICKET PARA IMPRIMIR ── */}
      <div id="ticket-print" ref={ticketRef} style={{ display: 'none' }}>
        <div className="t-logo">LA FELICITTA</div>
        <div className="t-sub">Barros Arana 504, Iquique<br />@lafelicittacl</div>
        <hr className="t-divider" />

        {/* TIPO DE SERVICIO destacado en el ticket */}
        <div style={{
          textAlign: 'center',
          fontWeight: 900,
          fontSize: 18,
          letterSpacing: 2,
          border: '2px solid #000',
          padding: '6px 0',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          {EMOJI_TIPO[tipoServicio]} {tipoServicio}
        </div>

        <div className="t-meta">
          <span><strong>COMANDA #{String(ordenNum - 1).padStart(3, '0')}</strong></span>
          {tipoServicio === 'Servir en mesa' && <span>{mesa} — {personas} pax</span>}
          <span>Mesero: {mesero || 'Caja'}</span>
          <span>{fechaHoy} {horaImpresion}</span>
        </div>
        <hr className="t-divider" />

        <table className="t-items">
          <thead>
            <tr><th>Producto</th><th>C</th><th>Total</th></tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>
                  {i.producto.nombre}
                  {i.nota && <span className="nota">↳ {i.nota}</span>}
                </td>
                <td>{i.cantidad}</td>
                <td>{fmt(i.cantidad * i.producto.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {nota && (
          <div style={{ fontSize: 12, borderTop: '1px dashed #000', marginTop: 6, paddingTop: 4 }}>
            <strong>Nota:</strong> {nota}
          </div>
        )}

        <div className="t-totales">
          <div className="t-fila grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
          <div className="t-fila"><span>Pago:</span><span>{metodoPago}</span></div>
        </div>
        <hr className="t-divider" />
        <div className="t-footer">
          QR MercadoPago ID: 1059389577<br />
          ¡Gracias por su visita!
        </div>
      </div>

      {/* ── UI PANTALLA ── */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gridTemplateRows: '56px 1fr', height: '100vh', overflow: 'hidden' }}>

        {/* HEADER */}
        <header style={{ gridColumn: '1/-1', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 3, color: 'var(--gold)' }}>LA FELICITTA</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sistema POS</span>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
            {[['/', '🧾 Caja'], ['/cocina', '🍳 Cocina'], ['/reportes', '📊 Reportes']].map(([href, label]) => (
              <a key={href} href={href} style={{ padding: '5px 14px', borderRadius: 6, background: href === '/' ? 'var(--gold)' : 'transparent', color: href === '/' ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid ' + (href === '/' ? 'var(--gold)' : 'var(--border)') }}>{label}</a>
            ))}
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {mensaje && (
              <span style={{ fontSize: 13, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', background: 'var(--surface2)', padding: '4px 12px', borderRadius: 20, border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}` }}>
                {mensaje.txt}
              </span>
            )}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{hora}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>#{String(ordenNum).padStart(3, '0')}</span>
          </div>
        </header>

        {/* PANEL IZQUIERDO — MENÚ */}
        <main style={{ padding: 16, overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Mesa', el: <select value={mesa} onChange={e => setMesa(e.target.value)} style={sel}>{MESAS.map(m => <option key={m}>{m}</option>)}</select> },
              { label: 'Mesero', el: <input value={mesero} onChange={e => setMesero(e.target.value)} placeholder="Nombre..." style={inp} /> },
              { label: 'Personas', el: <input type="number" value={personas} onChange={e => setPersonas(+e.target.value)} min={1} max={20} style={inp} /> },
              { label: 'Pago', el: <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={sel}>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</select> },
            ].map(({ label, el }) => (
              <div key={label}>
                <label style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                {el}
              </div>
            ))}
          </div>

          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar producto..." style={{ ...inp, width: '100%', marginBottom: 10 }} />

          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {CATEGORIAS.map(cat => (
              <button key={cat} onClick={() => { setCategoriaActiva(cat); setBusqueda('') }}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (cat === categoriaActiva && busqueda === '' ? 'var(--gold)' : 'var(--border)'), background: cat === categoriaActiva && busqueda === '' ? 'var(--gold)' : 'transparent', color: cat === categoriaActiva && busqueda === '' ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {productosFiltrados.map(p => (
              <button key={p.id} onClick={() => agregarProducto(p)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'var(--font)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>{p.nombre}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>{fmt(p.precio)}</div>
              </button>
            ))}
          </div>
        </main>

        {/* PANEL DERECHO — COMANDA */}
        <aside style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)' }}>COMANDA</span>
            <button onClick={nuevaComanda} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>+ Nueva</button>
          </div>

          {/* SELECTOR TIPO DE SERVICIO */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {TIPOS_SERVICIO.map(t => (
              <button key={t} onClick={() => setTipoServicio(t)} style={{
                flex: 1,
                padding: '6px 4px',
                borderRadius: 8,
                border: '1px solid ' + (t === tipoServicio ? 'var(--gold)' : 'var(--border)'),
                background: t === tipoServicio ? 'var(--gold)' : 'var(--surface)',
                color: t === tipoServicio ? '#000' : 'var(--muted)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                textAlign: 'center',
                lineHeight: 1.4,
              }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{EMOJI_TIPO[t]}</div>
                {t === 'Servir en mesa' ? 'Mesa' : t}
              </button>
            ))}
          </div>

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>
                Toca un producto para agregar
              </div>
            ) : items.map(item => (
              <div key={item.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.producto.nombre}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>{fmt(item.producto.precio * item.cantidad)}</div>
                  {item.nota && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>↳ {item.nota}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => cambiarCantidad(item.id, -1)} style={qtyBtn}>−</button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, width: 20, textAlign: 'center' }}>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, +1)} style={qtyBtn}>+</button>
                  <button onClick={() => eliminarItem(item.id)} style={{ ...qtyBtn, color: 'var(--red)', marginLeft: 4 }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Nota */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="📝 Nota general..." style={{ ...inp, width: '100%', fontSize: 12 }} />
          </div>

          {/* Totales */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              <span>{items.reduce((s, i) => s + i.cantidad, 0)} productos</span>
              <span>{fmt(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)', marginBottom: 12 }}>
              <span>TOTAL</span><span>{fmt(total)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={registrarVenta} disabled={guardando || items.length === 0}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--green)', background: 'transparent', color: 'var(--green)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {guardando ? '...' : '💾 Guardar'}
              </button>
              <button onClick={registrarEImprimir} disabled={guardando || items.length === 0}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                🖨 Imprimir
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

const inp: React.CSSProperties = {
  background: 'var(--surface)',
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
const qtyBtn: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text)',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'var(--font)',
  padding: 0,
}
