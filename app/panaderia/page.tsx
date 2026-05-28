'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'

type Insumo = { id: string; nombre: string; unidad: string; precio_ultimo: number }
type Ingrediente = { insumoId: string; nombre: string; cantidad: number; unidad: string; costo: number }
type RecetaPan = { nombre: string; gramos: number; rendimiento: number; ingredientes: { nombre: string; cantidad: number; unidad: string }[] }

const MASA_TOTAL_GR = 5690
const BASE_RECETA = [
  { nombre: 'Harina de trigo', cantidadTotal: 3.36, unidad: 'kg' },
  { nombre: 'Azucar', cantidadTotal: 0.5, unidad: 'kg' },
  { nombre: 'Sal', cantidadTotal: 0.025, unidad: 'kg' },
  { nombre: 'Huevos', cantidadTotal: 2, unidad: 'unidad' },
  { nombre: 'Leche', cantidadTotal: 0.5, unidad: 'L' },
  { nombre: 'Levadura', cantidadTotal: 0.025, unidad: 'kg' },
  { nombre: 'Mantequilla', cantidadTotal: 0.4, unidad: 'kg' },
]

function crearReceta(nombre: string, gramos: number): RecetaPan {
  const rendimiento = MASA_TOTAL_GR / gramos
  return {
    nombre,
    gramos,
    rendimiento,
    ingredientes: BASE_RECETA.map(i => ({
      nombre: i.nombre,
      cantidad: Number((i.cantidadTotal / rendimiento).toFixed(5)),
      unidad: i.unidad,
    })),
  }
}

const RECETAS = [
  crearReceta('Pan brioche 120g', 120),
  crearReceta('Pan brioche 140g', 140),
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
    const nombres = PRECIOS.map(p => p.nombre)
    const { data, error } = await supabase.from('stock_insumos').select('id,nombre,unidad,precio_ultimo').eq('empresa_id', empresaId).in('nombre', nombres)
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
    msg('Precios base actualizados', 'ok')
    setGuardando(false)
  }

  function calcular(receta: RecetaPan) {
    const ingredientes = receta.ingredientes.map(r => {
      const insumo = insumos.find(i => i.nombre.toLowerCase() === r.nombre.toLowerCase())
      return { base: r, insumo, costo: insumo ? Number(insumo.precio_ultimo || 0) * r.cantidad : 0 }
    })
    const costoTotal = ingredientes.reduce((s, i) => s + i.costo, 0)
    const faltantes = ingredientes.filter(i => !i.insumo)
    const sinPrecio = ingredientes.filter(i => i.insumo && Number(i.insumo.precio_ultimo || 0) <= 0)
    return { ingredientes, costoTotal, faltantes, sinPrecio }
  }

  async function guardarReceta(receta: RecetaPan) {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { msg('No hay empresa activa', 'err'); return }
    const calc = calcular(receta)
    if (calc.faltantes.length) { msg('Faltan insumos: ' + calc.faltantes.map(f => f.base.nombre).join(', '), 'err'); return }
    if (calc.sinPrecio.length) { msg('Faltan precios: ' + calc.sinPrecio.map(f => f.base.nombre).join(', '), 'err'); return }
    setGuardando(true)
    const recetaIngredientes: Ingrediente[] = calc.ingredientes.map(i => ({ insumoId: i.insumo!.id, nombre: i.insumo!.nombre, cantidad: i.base.cantidad, unidad: i.insumo!.unidad, costo: Math.round(i.costo) }))
    const datos = { producto_nombre: receta.nombre, ingredientes: recetaIngredientes, costo_total: Math.round(calc.costoTotal) }
    const { data: existente, error: buscarError } = await supabase.from('recetas').select('id').eq('empresa_id', empresaId).eq('producto_nombre', receta.nombre).maybeSingle()
    if (buscarError) { msg('Error buscando receta: ' + buscarError.message, 'err'); setGuardando(false); return }
    const { error } = existente?.id ? await supabase.from('recetas').update(datos).eq('empresa_id', empresaId).eq('id', existente.id) : await supabase.from('recetas').insert({ ...datos, empresa_id: empresaId })
    if (error) msg('Error guardando receta: ' + error.message, 'err')
    else msg('Receta ' + receta.nombre + ' guardada en Costeo', 'ok')
    setGuardando(false)
  }

  return (
    <AuthGuard>
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 70 }}>
        <Nav active="costeo" />
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '22px 14px' }}>
          <h1 style={{ color: 'var(--gold)', fontSize: 24, fontWeight: 800, margin: 0 }}>Panadería</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Pan brioche calculado por unidad. Huevo base: $250/unidad.</p>
          {mensaje && <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 8, background: mensaje.tipo === 'ok' ? 'rgba(76,175,125,.15)' : 'rgba(220,50,50,.15)', border: `1px solid ${mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`, color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{mensaje.txt}</div>}
          <button onClick={actualizarPreciosBase} disabled={guardando} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', fontWeight: 900, cursor: 'pointer', margin: '12px 0' }}>{guardando ? 'Procesando...' : 'Actualizar precios base de panadería'}</button>
          {RECETAS.map(receta => {
            const calc = calcular(receta)
            return (
              <div key={receta.nombre} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginTop: 14 }}>
                <h2 style={{ color: 'var(--gold)', fontSize: 18, margin: '0 0 8px' }}>{receta.nombre}</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Masa aprox. {MASA_TOTAL_GR.toLocaleString('es-CL')}g · corte {receta.gramos}g · rendimiento aprox. {receta.rendimiento.toFixed(1)} panes.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {calc.ingredientes.map(i => <div key={i.base.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}>
                    <div><div style={{ fontWeight: 800 }}>{i.base.nombre}</div><div style={{ color: 'var(--muted)', fontSize: 12 }}>Cantidad por pan: {i.base.cantidad} {i.base.unidad}</div></div>
                    <div style={{ color: i.insumo ? 'var(--muted)' : 'var(--red)', fontSize: 12 }}>{i.insumo ? fmt(i.insumo.precio_ultimo) + '/' + i.insumo.unidad : 'No existe en Stock'}</div>
                    <div style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmt(i.costo)}</div>
                  </div>)}
                </div>
                <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--muted)' }}>Costo estimado por pan</span><strong style={{ color: 'var(--gold)', fontSize: 24 }}>{fmt(calc.costoTotal)}</strong></div>
                <button onClick={() => guardarReceta(receta)} disabled={guardando} style={{ marginTop: 14, width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 900, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Subir receta ' + receta.nombre + ' a Costeo'}</button>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><a href="/stock-admin" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Editar precios</a><a href="/costeo" style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>Ver Costeo</a></div>
        </div>
      </main>
    </AuthGuard>
  )
}
