'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MENU, MESAS, METODOS_PAGO, CATEGORIAS, type Producto } from '@/lib/menu'
import { getSesion } from '@/lib/auth'
import AuthGuard from '@/components/AuthGuard'
import SesionBar from '@/components/SesionBar'

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
  const [items, setItems] = useState<ItemComanda[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0] || '')
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ordenNum, setOrdenNum] = useState(1)
  const [hora, setHora] = useState('')
  const [mensaje, setMensaje] = useState<{txt: string, tipo: 'ok'|'err'} | null>(null)
  const [tabMovil, setTabMovil] = useState<'menu'|'comanda'>('menu')
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null)

  // FLUJO: paso 1 = enviar a cocina, paso 2 = cobrar
  const [ventaId, setVentaId] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  const [cobrada, setCobrada] = useState(false)

  // MODAL COBRO
  const [modalCobro, setModalCobro] = useState(false)
  const [metodoPago, setMetodoPago] = useState('')
  const [pagosMixtos, setPagosMixtos] = useState({ Efectivo: '', Débito: '', Transferencia: '', Crédito: '' })
  const [cobrando, setCobrando] = useState(false)

  const esAdmin = getSesion()?.rol === 'admin'

  useEffect(() => {
    const n = parseInt((typeof window !== 'undefined' ? localStorage.getItem('lf_orden_num') : null) || '1')
    setOrdenNum(n)
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    verificarApertura()

    if (typeof window !== 'undefined') {
      const editarId = new URLSearchParams(window.location.search).get('editar')
      if (editarId) cargarComandaParaEditar(editarId)
    }

    return () => clearInterval(tick)
  }, [])

  async function verificarApertura() {
    const sesion = getSesion()
    if (sesion?.rol === 'admin') { setCajaAbierta(true); return }
    const { data } = await supabase.from('aperturas_caja').select('id').eq('estado', 'abierta').limit(1)
    setCajaAbierta(!!(data && data.length > 0))
  }

  const total = items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)
  const esPagoMixto = metodoPago === 'Mixto'
  const montoMixto = Object.values(pagosMixtos).reduce((s, v) => s + (parseInt(v || '0') || 0), 0)
  const restanteMixto = total - montoMixto
  const detalleMetodoPago = esPagoMixto
    ? 'Mixto: ' + Object.entries(pagosMixtos).filter(([, v]) => (parseInt(v || '0') || 0) > 0).map(([k, v]) => `${k} ${fmt(parseInt(v || '0') || 0)}`).join(' + ')
    : metodoPago
  const pagoValido = !esPagoMixto ? !!metodoPago : total > 0 && montoMixto === total

  const productosFiltrados = MENU.filter(p => {
    const enCat = p.categoria === categoriaActiva
    const enBusq = busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return enCat && enBusq
  })

  function mostrarMensaje(txt: string, tipo: 'ok' | 'err') {
    setMensaje({ txt, tipo })
    setTimeout(() => setMensaje(null), 3500)
  }

  async function cargarComandaParaEditar(id: string) {
    try {
      const { data, error } = await supabase.from('ventas').select('*').eq('id', id).single()
      if (error) throw error
      if (!data) return

      setVentaId(data.id)
      setMesa(data.mesa || 'Mesa 1')
      setMesero(data.mesero || '')
      setPersonas(data.personas || 2)
      setOrdenNum((data.numero || 1) + 1)

      const itemsEditados = (data.items || []).map((it: any, idx: number) => {
        const prod = MENU.find(p => p.nombre === it.nombre) || {
          id: 'editado-' + idx + '-' + Date.now(),
          nombre: it.nombre,
          precio: it.precio_unit || 0,
          categoria: 'Editado'
        }

        return {
          id: Date.now() + idx,
          producto: prod,
          cantidad: it.cantidad || 1,
          nota: it.nota || ''
        }
      })

      setItems(itemsEditados)
      setEnviada(true)
      setCobrada(data.estado === 'listo')
      setTabMovil('comanda')
      mostrarMensaje('Comanda abierta para editar ✓', 'ok')
    } catch (e: unknown) {
      mostrarMensaje('Error al abrir comanda: ' + (e as Error).message, 'err')
    }
  }

  function agregarProducto(p: Producto) {
    setItems(prev => {
      const existe = prev.find(i => i.producto.id === p.id && i.nota === '')
      if (existe) return prev.map(i => i.producto.id === p.id && i.nota === '' ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { id: Date.now(), producto: p, cantidad: 1, nota: '' }]
    })
    setTabMovil('comanda')
  }

  function cambiarCantidad(id: number, delta: number) {
    if (cobrada) { mostrarMensaje('No se puede modificar una comanda cobrada', 'err'); return }
    setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i))
  }

  function eliminarItem(id: number) {
    if (cobrada) { mostrarMensaje('No se puede eliminar productos de una comanda cobrada', 'err'); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function editarNota(id: number, nota: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, nota } : i))
  }

  function seleccionarMetodoPago(m: string) {
    setMetodoPago(m)
    if (m !== 'Mixto') setPagosMixtos({ Efectivo: '', Débito: '', Transferencia: '', Crédito: '' })
  }

  function cambiarPagoMixto(tipo: 'Efectivo' | 'Débito' | 'Transferencia' | 'Crédito', valor: string) {
    setPagosMixtos(prev => ({ ...prev, [tipo]: valor.replace(/[^0-9]/g, '') }))
  }

  // PASO 1: Enviar a cocina — guarda sin pago, imprime comanda
  async function enviarACocina() {
    if (items.length === 0) { mostrarMensaje('Agrega productos primero', 'err'); return }

    if (enviada && ventaId) {
      setGuardando(true)
      try {
        const { error } = await supabase.from('ventas')
          .update({
            mesa,
            mesero: mesero || 'Caja',
            personas,
            total,
            items: items.map(i => ({
              nombre: i.producto.nombre,
              cantidad: i.cantidad,
              precio_unit: i.producto.precio,
              nota: i.nota
            }))
          })
          .eq('id', ventaId)

        if (error) throw error

        mostrarMensaje('Comanda actualizada en cocina ✓', 'ok')
        setTimeout(() => window.print(), 400)
      } catch (e: unknown) {
        mostrarMensaje('Error al actualizar: ' + (e as Error).message, 'err')
      }
      setGuardando(false)
      return
    }

    setGuardando(true)
    try {
      const { data, error } = await supabase.from('ventas').insert({
        numero: ordenNum, mesa, mesero: mesero || 'Caja', personas,
        metodo_pago: '', total,
        items: items.map(i => ({ nombre: i.producto.nombre, cantidad: i.cantidad, precio_unit: i.producto.precio, nota: i.nota })),
        estado: 'pendiente', created_at: new Date().toISOString()
      }).select().single()
      if (error) throw error
      setVentaId(data.id)
      setEnviada(true)
      const nuevoNum = ordenNum + 1
      setOrdenNum(nuevoNum)
      if (typeof window !== 'undefined') localStorage.setItem('lf_orden_num', String(nuevoNum))
      mostrarMensaje(`Comanda #${ordenNum} enviada a cocina ✓`, 'ok')
      setTimeout(() => window.print(), 400)
    } catch (e: unknown) {
      mostrarMensaje('Error: ' + (e as Error).message, 'err')
    }
    setGuardando(false)
  }

  // PASO 2: Abrir modal de cobro
  function abrirCobro() {
    if (!enviada) { mostrarMensaje('Primero envía la comanda a cocina', 'err'); return }
    if (cobrada) return
    setModalCobro(true)
  }

  // PASO 2 confirmado: actualiza en Supabase con pago y estado listo
  async function confirmarCobro() {
    if (!pagoValido) {
      mostrarMensaje(esPagoMixto ? `Falta ${fmt(Math.max(restanteMixto, 0))}` : 'Selecciona método de pago', 'err')
      return
    }
    setCobrando(true)
    try {
      const { error } = await supabase.from('ventas')
        .update({ metodo_pago: detalleMetodoPago, estado: 'listo' })
        .eq('id', ventaId)
      if (error) throw error
      setCobrada(true)
      setModalCobro(false)
      mostrarMensaje('¡Cobro registrado! Mesa lista ✓', 'ok')
    } catch (e: unknown) {
      mostrarMensaje('Error al cobrar: ' + (e as Error).message, 'err')
    }
    setCobrando(false)
  }

  function nuevaComanda() {
    if (items.length > 0 && !confirm('¿Limpiar comanda actual?')) return
    setItems([])
    setBusqueda('')
    setMetodoPago('')
    setPagosMixtos({ Efectivo: '', Débito: '', Transferencia: '', Crédito: '' })
    setEnviada(false)
    setCobrada(false)
    setVentaId(null)
    setModalCobro(false)
    setTabMovil('menu')
  }

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', width: '100%' }
  const sel: React.CSSProperties = { ...inp }
  const qtyBtn: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, fontFamily: 'var(--font)', padding: 0 }

  const estadoBadge = cobrada
    ? { label: '✓ COBRADA', bg: 'var(--green)', color: '#000' }
    : enviada ? { label: '🍳 EN COCINA', bg: '#D4A843', color: '#000' }
    : null

  const panelMenuJSX = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {CATEGORIAS.map(cat => (
          <button key={cat} onClick={() => setCategoriaActiva(cat)} style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid ' + (cat === categoriaActiva ? 'var(--gold)' : 'var(--border)'), background: cat === categoriaActiva ? 'var(--gold)' : 'transparent', color: cat === categoriaActiva ? '#000' : 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>{cat}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, alignContent: 'start' as const }}>
        {productosFiltrados.map(p => (
          <button key={p.id} onClick={() => agregarProducto(p)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 80 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, lineHeight: 1.3 }}>{p.nombre}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: 'var(--gold)', fontWeight: 700 }}>{fmt(p.precio)}</div>
          </button>
        ))}
      </div>
    </div>
  )

  const panelComandaJSX = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)' }}>
            COMANDA #{String(enviada ? ordenNum - 1 : ordenNum).padStart(3,'0')}
          </span>
          {estadoBadge && <span style={{ fontSize: 11, background: estadoBadge.bg, color: estadoBadge.color, borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>{estadoBadge.label}</span>}
        </div>
        <button onClick={nuevaComanda} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 14, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>🗑 Nueva</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--muted)', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>Selecciona productos para agregarlos a la comanda
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', opacity: enviada && !esAdmin ? 0.85 : 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.producto.nombre}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)', marginTop: 2 }}>{fmt(item.producto.precio * item.cantidad)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => cambiarCantidad(item.id, -1)} style={{ ...qtyBtn, opacity: enviada && !esAdmin ? 0.35 : 1, cursor: enviada && !esAdmin ? 'not-allowed' : 'pointer' }}>−</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 14, width: 24, textAlign: 'center', fontWeight: 700 }}>{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.id, +1)} style={{ ...qtyBtn, opacity: enviada && !esAdmin ? 0.35 : 1, cursor: enviada && !esAdmin ? 'not-allowed' : 'pointer' }}>+</button>
                <button onClick={() => eliminarItem(item.id)} style={{ ...qtyBtn, color: 'var(--red)', background: 'transparent', border: 'none', opacity: enviada && !esAdmin ? 0.35 : 1, cursor: enviada && !esAdmin ? 'not-allowed' : 'pointer' }}>✕</button>
              </div>
            </div>
            <input value={item.nota} onChange={e => editarNota(item.id, e.target.value)} placeholder="📝 Sin cebolla, sin salsa..." style={{ ...inp, fontSize: 12, marginTop: 6, background: 'var(--bg)', borderColor: item.nota ? 'var(--gold)' : 'var(--border)' }} />
          </div>
        ))}
      </div>

      {enviada && !cobrada && !esAdmin && <div style={{ margin: '0 14px 8px', padding: '8px 12px', background: 'rgba(212,168,67,0.08)', border: '1px solid var(--gold)', borderRadius: 8, fontSize: 12, color: 'var(--gold)', textAlign: 'center' }}>🍳 En cocina — puedes editar y presionar Actualizar cocina</div>}
      {enviada && !cobrada && esAdmin && <div style={{ margin: '0 14px 8px', padding: '8px 12px', background: 'rgba(0,200,100,0.08)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 12, color: 'var(--green)', textAlign: 'center' }}>🔄 Edita la comanda y actualiza cocina</div>}
      {cobrada && <div style={{ margin: '0 14px 8px', padding: '8px 12px', background: 'rgba(76,175,125,0.08)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 12, color: 'var(--green)', textAlign: 'center' }}>✅ Cobrada — haz clic en "Nueva" para la siguiente</div>}

      <div className="no-print" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', marginBottom: 4, fontSize: 13, color: 'var(--muted)' }}>
          <span>{totalItems} productos</span><span>{fmt(total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)', marginBottom: 14 }}>
          <span>TOTAL</span><span>{fmt(total)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* PASO 1: Enviar a cocina */}
          <button onClick={enviarACocina} disabled={guardando || items.length === 0 || cobrada}
            style={{ flex: 1, padding: '13px', borderRadius: 10, border: 'none', background: cobrada || items.length === 0 ? 'var(--surface2)' : 'var(--gold)', color: cobrada || items.length === 0 ? 'var(--muted)' : '#000', fontSize: 14, fontWeight: 700, cursor: cobrada || items.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: cobrada || items.length === 0 ? 0.4 : 1 }}>
            {guardando ? '...' : enviada ? '🔄 Actualizar cocina' : '🖨 Enviar a cocina'}
          </button>
          {/* PASO 2: Cobrar */}
          <button onClick={abrirCobro} disabled={!enviada || cobrada}
            style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid ' + (!enviada || cobrada ? 'var(--border)' : 'var(--green)'), background: cobrada ? 'var(--green)' : 'transparent', color: cobrada ? '#000' : !enviada ? 'var(--muted)' : 'var(--green)', fontSize: 14, fontWeight: 700, cursor: !enviada || cobrada ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: !enviada ? 0.35 : 1 }}>
            {cobrada ? '✓ Cobrada' : '💳 Cobrar'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <AuthGuard>
      <>
      {cajaAbierta === false && (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔴</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 24, letterSpacing: 3, color: 'var(--gold)', marginBottom: 8 }}>CAJA CERRADA</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', marginBottom: 32, maxWidth: 280 }}>El administrador no ha abierto la caja hoy.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
            <button onClick={() => window.location.href = '/cierre'} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>🔓 Abrir Caja (Admin)</button>
            <button onClick={verificarApertura} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>🔄 Verificar nuevamente</button>
            <button onClick={() => { localStorage.removeItem('lf_sesion'); window.location.href = '/login' }} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>🚪 Cambiar usuario</button>
          </div>
        </div>
      )}
      {cajaAbierta === null && (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--font)', fontSize: 14 }}>Verificando caja...</div>
      )}
      {cajaAbierta === true && <>

      {/* TICKET — sin método de pago, se imprime antes de cobrar */}
      <div id="ticket-print" style={{ display: 'none', background: 'white', color: 'black' }}>
        <div className="t-logo">LA FELICITTA</div>
        <div className="t-sub">@lafelicittacl</div>
        <div className="t-tipo">{mesa.toLowerCase().includes('llevar') ? 'PARA LLEVAR' : mesa.toLowerCase().includes('delivery') ? 'DELIVERY' : 'SERVIR EN MESA'}</div>
        <hr className="t-divider" />
        <div className="t-meta">
          <span><strong>COMANDA #{String(ordenNum - 1).padStart(3, '0')}</strong></span>
          <span>{mesa}</span>
          <span>{new Date().toLocaleDateString('es-CL')} {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <hr className="t-divider" />
        <table className="t-items">
          <thead><tr><th>Producto</th><th>C</th><th>$</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>{i.producto.nombre.length > 13 ? i.producto.nombre.substring(0, 13) + '…' : i.producto.nombre}{i.nota && <span className="nota">↳ {i.nota}</span>}</td>
                <td>{i.cantidad}</td>
                <td>{fmt(i.cantidad * i.producto.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="t-totales">
          <div className="t-fila grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
        </div>
        <hr className="t-divider" />
        <div className="t-footer">¡Gracias por su visita! ❤️</div>
      </div>

      {/* HEADER */}
      <header className="no-print" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', height: 52, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
  <img
    src="/logo-lafelicitta.png"
    alt="La Felicitta"
    style={{
      width: 48,
      height: 48,
      objectFit: 'contain',
      borderRadius: 999,
      boxShadow: '0 0 16px rgba(212,168,67,.18)'
    }}
  />
  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
    <span style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 3, color: 'var(--gold)', fontWeight: 900 }}>
      LA FELICITTA
    </span>
    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', letterSpacing: 2, marginTop: 4 }}>
      POS · CAJA
    </span>
  </div>
</div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['/', '🧾'], ['/cocina', '🍳'], ['/gastos', '💸'], ['/reportes', '📊']].map(([href, icon]) => (
            <a key={href} href={href} style={{ padding: '6px 10px', borderRadius: 8, background: href === '/' ? 'var(--gold)' : 'transparent', color: href === '/' ? '#000' : 'var(--muted)', fontSize: 18, textDecoration: 'none' }}>{icon}</a>
          ))}
          {esAdmin && <a href="/cierre" style={{ padding: '6px 10px', borderRadius: 8, background: 'transparent', color: 'var(--green)', fontSize: 18, textDecoration: 'none' }}>🔓</a>}
        </nav>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12 }}>
          {mensaje && <span style={{ fontSize: 12, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', background: 'var(--surface2)', padding: '3px 8px', borderRadius: 12, border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}` }}>{mensaje.txt}</span>}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>{hora}</span>
          <SesionBar />
        </div>
      </header>

      {/* DESKTOP */}
      <div className="no-print desktop-layout" style={{ display: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid var(--border)', overflow: 'hidden' }}>{panelMenuJSX}</div>
          <div style={{ overflow: 'hidden' }}>{panelComandaJSX}</div>
        </div>
      </div>

      {/* MOBILE */}
      <div className="no-print mobile-layout" style={{ display: 'none' }}>
        <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 52, zIndex: 99 }}>
          <button onClick={() => setTabMovil('menu')} style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', color: tabMovil === 'menu' ? 'var(--gold)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: tabMovil === 'menu' ? '2px solid var(--gold)' : '2px solid transparent' }}>🍽️ Menú</button>
          <button onClick={() => setTabMovil('comanda')} style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', color: tabMovil === 'comanda' ? 'var(--gold)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: tabMovil === 'comanda' ? '2px solid var(--gold)' : '2px solid transparent', position: 'relative' }}>
            🧾 Comanda {totalItems > 0 && <span style={{ background: enviada ? (cobrada ? 'var(--green)' : '#D4A843') : 'var(--gold)', color: '#000', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 6px', marginLeft: 4 }}>{totalItems}</span>}
          </button>
        </div>
        <div style={{ height: 'calc(100vh - 104px)', overflow: 'hidden' }}>
          {tabMovil === 'menu' ? panelMenuJSX : panelComandaJSX}
        </div>
      </div>

      {/* MODAL COBRO */}
      {modalCobro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, fontFamily: 'var(--font)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--gold)' }}>COBRO DE MESA</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{mesa} · Comanda #{String(ordenNum - 1).padStart(3,'0')}</div>
              </div>
              <button onClick={() => setModalCobro(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 18, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total a cobrar</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: 'var(--gold)' }}>{fmt(total)}</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, color: metodoPago ? 'var(--muted)' : 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' as const, display: 'block', marginBottom: 8, fontWeight: metodoPago ? 400 : 700 }}>
                {metodoPago ? '💳 Método de pago' : '⚠️ Selecciona método de pago'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...METODOS_PAGO, 'Mixto'].map(m => (
                  <button key={m} onClick={() => seleccionarMetodoPago(m)} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid ' + (m === metodoPago ? 'var(--gold)' : 'var(--border)'), background: m === metodoPago ? 'var(--gold)' : 'var(--surface2)', color: m === metodoPago ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{m}</button>
                ))}
              </div>
            </div>
            {esPagoMixto && (
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['Débito', 'Efectivo', 'Transferencia', 'Crédito'] as const).map(tipo => (
                    <div key={tipo}>
                      <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{tipo}</label>
                      <input inputMode="numeric" value={pagosMixtos[tipo]} onChange={e => cambiarPagoMixto(tipo, e.target.value)} placeholder="0" style={inp} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--mono)', color: restanteMixto === 0 ? 'var(--green)' : restanteMixto < 0 ? 'var(--red)' : 'var(--gold)' }}>
                  Pagado: {fmt(montoMixto)} · {restanteMixto === 0 ? 'Pago completo ✓' : restanteMixto > 0 ? `Falta: ${fmt(restanteMixto)}` : `Sobra: ${fmt(Math.abs(restanteMixto))}`}
                </div>
              </div>
            )}
            <button onClick={confirmarCobro} disabled={cobrando || !pagoValido}
              style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: pagoValido ? 'var(--green)' : 'var(--surface2)', color: pagoValido ? '#000' : 'var(--muted)', fontSize: 15, fontWeight: 700, cursor: pagoValido ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)', opacity: pagoValido ? 1 : 0.5 }}>
              {cobrando ? 'Registrando...' : `✓ Confirmar cobro ${fmt(total)}`}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media print { body * { visibility: hidden; } #ticket-print, #ticket-print * { visibility: visible; } #ticket-print { position: fixed; top: 0; left: 0; width: 100%; background: white; } }
        @media (min-width: 768px) { .desktop-layout { display: block !important; } .mobile-layout { display: none !important; } }
        @media (max-width: 767px) { .mobile-layout { display: block !important; } .desktop-layout { display: none !important; } }
      `}</style>
      </>}
      </>
    </AuthGuard>
  )
}
