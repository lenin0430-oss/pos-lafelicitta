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

export default function CajaPage() {
  const [mesa, setMesa] = useState('Mesa 1')
  const [mesero, setMesero] = useState('')
  const [personas, setPersonas] = useState(2)
  const [metodoPago, setMetodoPago] = useState('')
  const [items, setItems] = useState<ItemComanda[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0] || '')
  const [busqueda, setBusqueda] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ordenNum, setOrdenNum] = useState(1)
  const [hora, setHora] = useState('')
  const [mensaje, setMensaje] = useState<{txt: string, tipo: 'ok'|'err'} | null>(null)
  const [tabMovil, setTabMovil] = useState<'menu'|'comanda'>('menu')

  useEffect(() => {
    const n = parseInt((typeof window !== 'undefined' ? localStorage.getItem('lf_orden_num') : null) || '1')
    setOrdenNum(n)
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  const total = items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)

  const productosFiltrados = MENU.filter(p => {
    const enCat = p.categoria === categoriaActiva
    const enBusq = busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return enCat && enBusq
  })

  function agregarProducto(p: Producto) {
    setItems(prev => {
      const existe = prev.find(i => i.producto.id === p.id && i.nota === '')
      if (existe) return prev.map(i => i.producto.id === p.id && i.nota === '' ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { id: Date.now(), producto: p, cantidad: 1, nota: '' }]
    })
    setTabMovil('comanda')
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
        numero: ordenNum, mesa, mesero: mesero || 'Caja', personas,
        metodo_pago: metodoPago, total,
        items: items.map(i => ({ nombre: i.producto.nombre, cantidad: i.cantidad, precio_unit: i.producto.precio, nota: i.nota })),
        estado: 'pendiente', created_at: new Date().toISOString()
      })
      if (error) throw error
      mostrarMensaje(`Venta #${ordenNum} registrada ✓`, 'ok')
      const nuevoNum = ordenNum + 1
      setOrdenNum(nuevoNum)
      if (typeof window !== 'undefined') localStorage.setItem('lf_orden_num', String(nuevoNum))
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
    setMetodoPago('')
    setTabMovil('menu')
  }

  const fechaHoy = new Date().toLocaleDateString('es-CL')
  const horaImpresion = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%' }
  const sel: React.CSSProperties = { ...inp }
  const qtyBtn: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, fontFamily: 'var(--font)', padding: 0 }

  // ── PANEL MENÚ ──────────────────────────────────────────────────────────────
  // FIX: display:flex + flexDirection:column + height:100% encadenado hasta
  // el grid de productos, que tiene flex:1 + overflowY:auto + minHeight:0
  // Esto permite que el scroll funcione en TODAS las categorías, incl. Bebidas
  const panelMenu = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Datos comanda — solo Mesa, Mesero, Personas. Pago va en la comanda */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 3 }}>Mesa</label>
            <select value={mesa} onChange={e => setMesa(e.target.value)} style={sel}>{MESAS.map(m => <option key={m}>{m}</option>)}</select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 3 }}>Mesero</label>
            <input value={mesero} onChange={e => setMesero(e.target.value)} placeholder="Nombre..." style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 3 }}>Pax</label>
            <input type="number" value={personas} onChange={e => setPersonas(+e.target.value)} min={1} max={20} style={inp} />
          </div>
        </div>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar producto..." style={{ ...inp, background: 'var(--surface)' }} />
      </div>

      {/* Categorías — fila fija, no se encoge */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {CATEGORIAS.map(cat => (
          <button key={cat} onClick={() => setCategoriaActiva(cat)} style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid ' + (cat === categoriaActiva ? 'var(--gold)' : 'var(--border)'), background: cat === categoriaActiva ? 'var(--gold)' : 'transparent', color: cat === categoriaActiva ? '#000' : 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid productos — ocupa el espacio restante y hace scroll */}
      <div style={{
        flex: 1,
        minHeight: 0,          // ← KEY: sin esto flex no permite scroll en hijo
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch', // ← momentum scroll en iOS
        padding: 12,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
        alignContent: 'start', // ← evita que las cards se estiren verticalmente
      }}>
        {productosFiltrados.map(p => (
          <button key={p.id} onClick={() => agregarProducto(p)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 80 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, lineHeight: 1.3 }}>{p.nombre}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: 'var(--gold)', fontWeight: 700 }}>{fmt(p.precio)}</div>
          </button>
        ))}
      </div>
    </div>
  )

  // ── PANEL COMANDA ────────────────────────────────────────────────────────────
  const panelComanda = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)' }}>COMANDA #{String(ordenNum).padStart(3,'0')}</span>
        <button onClick={nuevaComanda} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>🗑 Nueva</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '4px 0' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--muted)', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
            Toca un producto para agregar
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.producto.nombre}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)', marginTop: 2 }}>{fmt(item.producto.precio * item.cantidad)}</div>
              {item.nota && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>↳ {item.nota}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => cambiarCantidad(item.id, -1)} style={qtyBtn}>−</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 14, width: 24, textAlign: 'center', fontWeight: 700 }}>{item.cantidad}</span>
              <button onClick={() => cambiarCantidad(item.id, +1)} style={qtyBtn}>+</button>
              <button onClick={() => eliminarItem(item.id)} style={{ ...qtyBtn, color: 'var(--red)', background: 'transparent', border: 'none' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="no-print" style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <input value={nota} onChange={e => setNota(e.target.value)} placeholder="📝 Nota..." style={{ ...inp, fontSize: 13 }} />
      </div>

      <div className="no-print" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        {/* Subtotal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', marginBottom: 4, fontSize: 13, color: 'var(--muted)' }}>
          <span>{totalItems} productos</span><span>{fmt(total)}</span>
        </div>
        {/* Total grande */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)', marginBottom: 12 }}>
          <span>TOTAL</span><span>{fmt(total)}</span>
        </div>
        {/* Método de pago — aquí cuando el cliente ya pidió todo */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, color: metodoPago ? 'var(--muted)' : 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 5, fontWeight: metodoPago ? 400 : 700 }}>
            💳 {metodoPago ? 'Método de pago' : '⚠️ Selecciona método de pago'}
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {METODOS_PAGO.map(m => (
              <button key={m} onClick={() => setMetodoPago(m)} style={{
                padding: '7px 14px', borderRadius: 20,
                border: '1px solid ' + (m === metodoPago ? 'var(--gold)' : 'var(--border)'),
                background: m === metodoPago ? 'var(--gold)' : 'var(--surface2)',
                color: m === metodoPago ? '#000' : 'var(--muted)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)'
              }}>{m}</button>
            ))}
          </div>
        </div>
        {/* Botones — bloqueados si no hay método de pago */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={registrarVenta} disabled={guardando || items.length === 0 || !metodoPago} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--green)', background: 'transparent', color: (!metodoPago || items.length === 0) ? 'var(--muted)' : 'var(--green)', fontSize: 14, fontWeight: 700, cursor: (!metodoPago || items.length === 0) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: (!metodoPago || items.length === 0) ? 0.4 : 1 }}>
            {guardando ? '...' : '💾 Guardar'}
          </button>
          <button onClick={registrarEImprimir} disabled={guardando || items.length === 0 || !metodoPago} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: (!metodoPago || items.length === 0) ? 'var(--surface2)' : 'var(--gold)', color: (!metodoPago || items.length === 0) ? 'var(--muted)' : '#000', fontSize: 14, fontWeight: 700, cursor: (!metodoPago || items.length === 0) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: (!metodoPago || items.length === 0) ? 0.4 : 1 }}>
            🖨 Imprimir
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* TICKET IMPRIMIR */}
      <div id="ticket-print" style={{ display: 'none', background: 'white', color: 'black' }}>
        <div className="t-logo">LA FELICITTA</div>
        <div className="t-sub">Barros Arana 504, Iquique<br />@lafelicittacl</div>
        <div className="t-tipo">{mesa.toLowerCase().includes('llevar') ? 'PARA LLEVAR' : mesa.toLowerCase().includes('delivery') ? 'DELIVERY' : 'SERVIR EN MESA'}</div>
        <hr className="t-divider" />
        <div className="t-meta">
          <span><strong>COMANDA #{String(ordenNum - 1).padStart(3, '0')}</strong></span>
          <span>{mesa} — {personas} pax</span>
          <span>Mesero: {mesero || 'Caja'}</span>
          <span>{fechaHoy} {horaImpresion}</span>
        </div>
        <hr className="t-divider" />
        <table className="t-items">
          <thead><tr><th>Producto</th><th>C</th><th>$</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>
                  {i.producto.nombre.length > 14 
                    ? i.producto.nombre.replace('Burger ', 'B.').replace('Especial ', 'Esp.').replace('Felicitta', 'Felic.').replace('Super ', 'Sup.')
                    : i.producto.nombre}
                  {i.nota && <span className="nota">↳ {i.nota}</span>}
                </td>
                <td>{i.cantidad}</td>
                <td>{fmt(i.cantidad * i.producto.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="t-totales">
          <div className="t-fila grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
          <div className="t-fila"><span>Pago:</span><span>{metodoPago}</span></div>
        </div>
        <hr className="t-divider" />
        <div className="t-footer">QR MercadoPago ID: 1059389577<br />¡Gracias por su visita! ❤️</div>
      </div>

      {/* HEADER */}
      <header className="no-print" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', height: 52, position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--gold)' }}>LA FELICITTA</span>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['/', '🧾'], ['/cocina', '🍳'], ['/gastos', '💸'], ['/reportes', '📊']].map(([href, icon]) => (
            <a key={href} href={href} style={{ padding: '6px 10px', borderRadius: 8, background: href === '/' ? 'var(--gold)' : 'transparent', color: href === '/' ? '#000' : 'var(--muted)', fontSize: 18, textDecoration: 'none' }}>{icon}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12 }}>
          {mensaje && <span style={{ fontSize: 12, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', background: 'var(--surface2)', padding: '3px 8px', borderRadius: 12, border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}` }}>{mensaje.txt}</span>}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>{hora}</span>
        </div>
      </header>

      {/* DESKTOP: dos paneles */}
      <div className="no-print desktop-layout" style={{ display: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid var(--border)', overflow: 'hidden' }}>{panelMenu}</div>
          <div style={{ overflow: 'hidden' }}>{panelComanda}</div>
        </div>
      </div>

      {/* MOBILE: tabs */}
      <div className="no-print mobile-layout" style={{ display: 'none' }}>
        {/* Tabs nav */}
        <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 52, zIndex: 99 }}>
          <button onClick={() => setTabMovil('menu')} style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', color: tabMovil === 'menu' ? 'var(--gold)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: tabMovil === 'menu' ? '2px solid var(--gold)' : '2px solid transparent' }}>
            🍽️ Menú
          </button>
          <button onClick={() => setTabMovil('comanda')} style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', color: tabMovil === 'comanda' ? 'var(--gold)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: tabMovil === 'comanda' ? '2px solid var(--gold)' : '2px solid transparent', position: 'relative' }}>
            🧾 Comanda {totalItems > 0 && <span style={{ background: 'var(--gold)', color: '#000', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 6px', marginLeft: 4 }}>{totalItems}</span>}
          </button>
        </div>

        {/* Contenedor tab — FIX: overflow:hidden aquí, el scroll lo maneja el panel interno */}
        <div style={{ height: 'calc(100vh - 104px)', overflow: 'hidden' }}>
          {tabMovil === 'menu' ? panelMenu : panelComanda}
        </div>
      </div>

      <style>{`
        @media print { body * { visibility: hidden; } #ticket-print, #ticket-print * { visibility: visible; } #ticket-print { position: fixed; top: 0; left: 0; width: 100%; background: white; } }
        @media (min-width: 768px) {
          .desktop-layout { display: block !important; }
          .mobile-layout { display: none !important; }
        }
        @media (max-width: 767px) {
          .mobile-layout { display: block !important; }
          .desktop-layout { display: none !important; }
        }
      `}</style>
    </>
  )
}
