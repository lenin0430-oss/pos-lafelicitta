'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

type Insumo = { id: string; nombre: string; unidad: string; precio_ultimo: number }
type Ingrediente = { insumoId: string; nombre: string; cantidad: number; unidad: string; costo: number }

const RECETA = [
  { nombre: 'Harina de trigo', cantidad: 0.0715, unidad: 'kg' },
  { nombre: 'Azucar', cantidad: 0.0106, unidad: 'kg' },
  { nombre: 'Sal', cantidad: 0.00053, unidad: 'kg' },
  { nombre: 'Huevos', cantidad: 0.043, unidad: 'unidad' },
  { nombre: 'Leche', cantidad: 0.0106, unidad: 'L' },
  { nombre: 'Levadura', cantidad: 0.00053, unidad: 'kg' },
  { nombre: 'Mantequilla', cantidad: 0.0085, unidad: 'kg' },
]

const PRECIOS = [
  { nombre: 'Harina de trigo', unidad: 'kg', categoria: 'Panadería', precio_ultimo: 620, stock_minimo: 5 },
  { nombre: 'Azucar', unidad: 'kg', categoria: 'Panadería', precio_ultimo: 1000, stock_minimo: 2 },
  { nombre: 'Sal', unidad: 'kg', categoria: 'Panadería', precio_ultimo: 800, stock_minimo: 1 },
  { nombre: 'Huevos', unidad: 'unidad', categoria: 'Otros', precio_ultimo: 250, stock_minimo: 30 },
  { nombre: 'Leche', unidad: 'L', categoria: 'Lácteos', precio_ultimo: 1250, stock_minimo: 2 },
  { nombre: 'Levadura', unidad: 'kg', categoria: 'Panadería', precio_ultimo: 7700, stock_minimo: 0.2 },
  { nombre: 'Mantequilla', unidad: 'kg', categoria: 'Lácteos', precio_ultimo: 3200, stock_minimo: 1 },
]

export default function PanaderiaPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [mensaje, setMensaje] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const msg = (txt: string, tipo: 'ok' | 'err') => { setMensaje({ txt, tipo }); setTimeout(() => setMensaje(null), 5000) }

  async function cargar() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    const { data, error } = await supabase.from('stock_insumos').select('id,nombre,unidad,precio_ultimo').eq('empresa_id', empresaId).in('nombre', RECETA.map(r => r.nombre))
    if (error) msg('Error cargando insumos: ' + error.message, 'err')
    else setInsumos((data || []) as Insumo[])
  }

  async function actualizarPreciosBase() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }
    setGuardando(true)
    for (const p of PRECIOS) {
      const { data: existe, error: buscarError } = await supabase.from('stock_insumos').select('id').eq('empresa_id', empresaId).eq('nombre', p.nombre).maybeSingle()
      if (buscarError) { msg('Error buscando ' + p.nombre + ': ' + buscarError.message, 'err'); setGuardando(false); return }
      const datos = { unidad: p.unidad, categoria: p.categoria, precio_ultimo: p.precio_ultimo, stock_minimo: p.stock_minimo, updated_at: new Date().toISOString() }
      const res = existe?.id
        ? await supabase.from('stock_insumos').update(datos).eq('empresa_id', empresaId).eq('id', existe.id)
        : await supabase.from('stock_insumos').insert({ empresa_id: empresaId, nombre: p.nombre, stock_actual: 0, ...datos })
      if (res.error) { msg('Error actualizando ' + p.nombre + ': ' + res.error.message, 'err'); setGuardando(false); return }
    }
    await cargar()
    msg('Precios base actualizados. Huevo quedó en $250/unidad.', 'ok')
    setGuardando(false)
  }

  const ingredientes = useMemo(() => RECETA.map(r => {
    const insumo = insumos.find(i => i.nombre.toLowerCase() === r.nombre.toLowerCase())
    return { base: r, insumo, costo: insumo ? Number(insumo.precio_ultimo || 0) * r.cantidad : 0 }
  }), [insumos])

  const costoTotal = ingredientes.reduce((s, i) => s + i.costo, 0)
  const faltantes = ingredientes.filter(i => !i.insumo)
  const sinPrecio = ingredientes.filter(i => i.insumo && Number(i.insumo.precio_ultimo || 0) <= 0)

  async function guardarReceta() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }
    if (faltantes.length) { msg('Faltan insumos: ' + faltantes.map(f => f.base.nombre).join(', '), 'err'); return }
    if (sinPrecio.length) { msg('Faltan precios: ' + sinPrecio.map(f => f.base.nombre).join(', '), 'err'); return }
    setGuardando(true)
    const recetaIngredientes: Ingrediente[] = ingredientes.map(i => ({ insumoId: i.insumo!.id, nombre: i.insumo!.nombre, cantidad: i.base.cantidad, unidad: i.insumo!.unidad, costo: Math.round(i.costo) }))
    const datos = { producto_nombre: 'Pan brioche 120g', ingredientes: recetaIngredientes, costo_total: Math.round(costoTotal) }
    const { data: existente } = await supabase.from('recetas').select('id').eq('empresa_id', empresaId).eq('producto_nombre', 'Pan brioche 120g').maybeSingle()
    const { error } = existente?.id ? await supabase.from('recetas').update(datos).eq('empresa_id', empresaId).eq('id', existente.id) : await supabase.from('recetas').insert({ ...datos, empresa_id: empresaId })
    if (error) msg('Error guardando receta: ' + error.message, 'err')
    else msg('Receta Pan brioche 120g guardada en Costeo', 'ok')
    setGuardando(false)
  }

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="costeo" />
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '22px 14px' }}>
          <h1 style={{ color: 'var(--gold)', fontSize: 24, fontWeight: 800, margin: 0 }}>Panadería</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Pan brioche calculado por unidad de 120g. Huevo base: $250/unidad.</p>
          {mensaje && <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{mensaje.txt}</div>}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginTop: 14 }}>
            <h2 style={{ color: 'var(--gold)', fontSize: 18, margin: '0 0 8px' }}>Pan brioche 120g</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Masa aprox. 5.690g · corte 120g · rendimiento aprox. 47 panes.</p>
            <button onClick={actualizarPreciosBase} disabled={guardando} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', fontWeight: 900, cursor: 'pointer', marginBottom: 12 }}>{guardando ? 'Procesando...' : 'Actualizar precios base del pan brioche'}</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ingredientes.map(i => <div key={i.base.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}>
                <div><div style={{ fontWeight: 800 }}>{i.base.nombre}</div><div style={{ color: 'var(--muted)', fontSize: 12 }}>Cantidad por pan: {i.base.cantidad} {i.base.unidad}</div></div>
                <div style={{ color: i.insumo ? 'var(--muted)' : 'var(--red)', fontSize: 12 }}>{i.insumo ? fmt(i.insumo.precio_ultimo) + '/' + i.insumo.unidad : 'No existe en Stock'}</div>
                <div style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmt(i.costo)}</div>
              </div>)}
            </div>
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--muted)' }}>Costo estimado por pan</span><strong style={{ color: 'var(--gold)', fontSize: 24 }}>{fmt(costoTotal)}</strong></div>
            <button onClick={guardarReceta} disabled={guardando} style={{ marginTop: 14, width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 900, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Subir receta Pan brioche 120g a Costeo'}</button>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><a href="/stock-admin" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Editar precios</a><a href="/costeo" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Ver Costeo</a></div>
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}
