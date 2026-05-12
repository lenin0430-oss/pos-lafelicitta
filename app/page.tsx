'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MENU, MESAS, METODOS_PAGO, CATEGORIAS, type Producto, type TipoServicio } from '@/lib/menu'

interface ItemComanda {
  id: number
  producto: Producto
  cantidad: number
  nota: string
}

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

  // Apertura de caja
  const [mostrarApertura, setMostrarApertura] = useState(false)
  const [montoCaja, setMontoCaja] = useState('')
  const [cajeroApertura, setCajeroApertura] = useState('')
  const [cajaAbierta, setCajaAbierta] = useState(false)
  const [montoInicial, setMontoInicial] = useState(0)

  useEffect(() => {
    const n = parseInt((typeof window !== 'undefined' ? (typeof window !== 'undefined' ? localStorage.getItem('lf_orden_num') : null) : null) || '1')
    setOrdenNum(n)
    const hoy = new Date().toLocaleDateString('es-CL')
    const cajaHoy = localStorage.getItem('lf_caja_fecha')
    if (cajaHoy !== hoy) {
      setMostrarApertura(true)
    } else {
      const monto = parseInt(localStorage.getItem('lf_caja_monto') || '0')
      setMontoInicial(monto)
      setCajaAbierta(true)
    }
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (mesa === 'Para llevar') setTipoServicio('Para llevar')
    else if (mesa === 'Delivery') setTipoServicio('Delivery')
    else setTipoServicio('Servir en mesa')
  }, [mesa])

  async function abrirCaja() {
    const monto = parseInt(montoCaja.replace(/\D/g, '')) || 0
    const cajero = cajeroApertura.trim() || 'Caja'
    try {
      await supabase.from('aperturas_caja').insert({
        fecha: new Date().toISOString().split('T')[0],
        monto_inicial: monto,
        cajero,
        created_at: new Date().toISOString()
      })
    } catch (_) {}
    const hoy = new Date().toLocaleDateString('es-CL')
    localStorage.setItem('lf_caja_fecha', hoy)
    localStorage.setItem('lf_caja_monto', String(monto))
    setMontoInicial(monto)
    setCajaAbierta(true)
    setMostrarApertura(false)
  }

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
      const numActual = parseInt((typeof window !== 'undefined' ? (typeof window !== 'undefined' ? localStorage.getItem('lf_orden_num') : null) : null) || '1')
      const { error } = await supabase.from('ventas').insert({
        numero: numActual,
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
      mostrarMensaje(`Venta #${numActual} registrada ✓`, 'ok')
      const nuevoNum = numActual + 1
      setOrdenNum(nuevoNum)
      if (typeof window !== 'undefined') if(typeof window !== 'undefined') localStorage.setItem('lf_orden_num', String(nuevoNum))
    } catch (e: any) {
      mostrarMensaje('Error: ' + e.message, 'err')
    }
    setGuardando(false)
  }

  async function registrarEImprimir() {
    await registrarVenta()
    setTimeout(() => window.print(), 600)
  }

  function nuevaComanda() {
    if (items.length > 0 && !confirm('¿Limpiar comanda actual?')) return
    setItems([])
    setNota('')
    setBusqueda('')
  }

  const fechaHoy = new Date().toLocaleDateString('es-CL')
  const horaImpresion = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const numImpresion = parseInt((typeof window !== 'undefined' ? (typeof window !== 'undefined' ? localStorage.getItem('lf_orden_num') : null) : null) || '1')

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          #ticket-print { display: block !important; }
          body { background: white; }
        }
        #ticket-print {
          font-family: 'Courier New', monospace;
          font-size: 13px;
          width: 280px;
          color: #000;
          padding: 8px;
        }
        .t-logo { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 3px; margin-bottom: 2px; }
        .t-sub { text-align: center; font-size: 11px; margin-bottom: 6px; }
        .t-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .t-tipo { text-align: center; font-weight: 900; font-size: 17px; letter-spacing: 2px; border: 2px solid #000; padding: 5px 0; margin-bottom: 6px; text-transform: uppercase; }
        .t-meta { font-size: 12px; margin-bottom: 4px; }
        .t-meta span { display: block; }
        .t-items { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0; }
        .t-items th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 3px; }
        .t-items td { padding: 2px 0; vertical-align: top; }
        .t-items td:nth-child(2) { text-align: center; width: 24px; }
        .t-items td:nth-child(3) { text-align: right; white-space: nowrap; }
        .t-ingr { font-size: 10px; color: #555; display: block; padding-left: 4px; font-style: italic; }
        .t-nota { font-size: 10px; display: block; padding-left: 8px; font-style: italic; }
        .t-totales { margin-top: 6px; }
        .t-fila { display: flex; justify-content: space-between; font-size: 13px; }
        .t-fila.grand { font-size: 16px; font-weight: 900; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
        .t-footer { text-align: center; font-size: 11px; margin-top: 8px; }
        .ingr-card { font-size: 10px; color: var(--muted); line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      `}</style>

      {/* POPUP APERTURA DE CAJA */}
      {mostrarApertura && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: 360, fontFamily: 'var(--font)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--gold)', marginBottom: 6 }}>LA FELICITTA</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Apertura de Caja</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>{fechaHoy}</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Cajero / Encargado</label>
              <input value={cajeroApertura} onChange={e => setCajeroApertura(e.target.value)} placeholder="Nombre..." style={inp} autoFocus />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Monto inicial en caja</label>
              <input value={montoCaja} onChange={e => setMontoCaja(e.target.value)} placeholder="30000" type="number" style={{ ...inp, fontSize: 20, fontFamily: 'var(--mono)', color: 'var(--gold)' }} onKeyDown={e => e.key === 'Enter' && abrirCaja()} />
            </div>
            <button onClick={abrirCaja} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: 10 }}>
              🔓 Abrir Caja
            </button>
            <button onClick={() => { setMostrarApertura(false); setCajaAbierta(true) }} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Omitir
            </button>
          </div>
        </div>
      )}

      {/* TICKET PARA IMPRIMIR */}
      <div id="ticket-print" style={{ display: 'none' }}>
        <div className="t-logo">LA FELICITTA</div>
        <div className="t-sub">Barros Arana 504, Iquique<br />@lafelicittacl</div>
        <hr className="t-divider" />
        <div className="t-tipo">{EMOJI_TIPO[tipoServicio]} {tipoServicio}</div>
        <div className="t-meta">
          <span><strong>COMANDA #{String(numImpresion - 1).padStart(3, '0')}</strong></span>
          {tipoServicio === 'Servir en mesa' && <span>{mesa} — {personas} pax</span>}
          <span>Mesero: {mesero || 'Caja'}</span>
          <span>Pago: {metodoPago}</span>
          <span>{fechaHoy} {horaImpresion}</span>
        </div>
        <hr className="t-divider" />
        <table className="t-items">
          <thead><tr><th>Producto</th><th>C</th><th>Total</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>
                  {i.producto.nombre}
                  {i.producto.ingredientes && <span className="t-ingr">{i.producto.ingredientes}</span>}
                  {i.nota && <span className="t-nota">↳ {i.nota}</span>}
                </td>
                <td>{i.cantidad}</td>
                <td>{fmt(i.cantidad * i.producto.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {nota && <div style={{ fontSize: 11, borderTop: '1px dashed #000', marginTop: 6, paddingTop: 4 }}><strong>Nota:</strong> {nota}</div>}
        <div className="t-totales">
          <div className="t-fila grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
        </div>
        <hr className="t-divider" />
        <div className="t-footer">QR MercadoPago ID: 1059389577<br />¡Gracias por su visita! 🧡</div>
      </div>

      {/* UI PANTALLA */}
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
            {cajaAbierta && montoInicial > 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                💰 Caja: {fmt(montoInicial)}
              </span>
            )}
            {mensaje && (
              <span style={{ fontSize: 13, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', background: 'var(--surface2)', padding: '4px 12px', borderRadius: 20, border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}` }}>
                {mensaje.txt}
              </span>
            )}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{hora}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>#{String(ordenNum).padStart(3, '0')}</span>
          </div>
        </header>

        {/* PANEL IZQUIERDO */}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {productosFiltrados.map(p => (
              <button key={p.id} onClick={() => agregarProducto(p)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', gap: 4 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.nombre}</div>
                {p.ingredientes && <div className="ingr-card">{p.ingredientes}</div>}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)', marginTop: 'auto' }}>{fmt(p.precio)}</div>
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

          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {TIPOS_SERVICIO.map(t => (
              <button key={t} onClick={() => setTipoServicio(t)} style={{ flex: 1, padding: '6px 4px', borderRadius: 8, border: '1px solid ' + (t === tipoServicio ? 'var(--gold)' : 'var(--border)'), background: t === tipoServicio ? 'var(--gold)' : 'var(--surface)', color: t === tipoServicio ? '#000' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center', lineHeight: 1.4 }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{EMOJI_TIPO[t]}</div>
                {t === 'Servir en mesa' ? 'Mesa' : t}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>Toca un producto para agregar</div>
            ) : items.map(item => (
              <div key={item.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{item.producto.nombre}</div>
                  {item.producto.ingredientes && <div className="ingr-card" style={{ marginTop: 2 }}>{item.producto.ingredientes}</div>}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>{fmt(item.producto.precio * item.cantidad)}</div>
                  {item.nota && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>↳ {item.nota}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => cambiarCantidad(item.id, -1)} style={qtyBtn}>−</button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, width: 20, textAlign: 'center' }}>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, +1)} style={qtyBtn}>+</button>
                  <button onClick={() => eliminarItem(item.id)} style={{ ...qtyBtn, color: 'var(--red)', marginLeft: 2 }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="📝 Nota general..." style={{ ...inp, width: '100%', fontSize: 12 }} />
          </div>

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
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%',
}
const sel: React.CSSProperties = { ...inp }
const qtyBtn: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5,
  color: 'var(--text)', width: 24, height: 24, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)', padding: 0,
}
