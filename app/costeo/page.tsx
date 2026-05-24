'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

interface Ingrediente { nombre: string; cantidad: number; unidad: string; costo: number }
interface Receta { id: string; producto_nombre: string; ingredientes: Ingrediente[]; costo_total: number }

export default function CosteoPage() {
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [margen, setMargen] = useState(70)
  const [precios, setPrecios] = useState<Record<string, string>>({})

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('recetas').select('*').order('producto_nombre')
      if (data) setRecetas(data)
    }
    cargar()
  }, [])

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
  const precioSugerido = (costo: number) => costo / (1 - margen / 100)
  const margenReal = (costo: number, precio: number) => precio > 0 ? ((precio - costo) / precio) * 100 : 0
  const colorMargen = (m: number) => m >= 60 ? 'var(--green)' : m >= 40 ? 'var(--gold)' : 'var(--red)'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <Nav />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>💰 Costeo de platos</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>Precio sugerido y margen real por plato</p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Margen objetivo:</label>
          <input type="range" min={10} max={90} value={margen} onChange={e => setMargen(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)', fontSize: 18, minWidth: 50 }}>{margen}%</span>
        </div>

        {recetas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
            No hay recetas. <a href="/recetas" style={{ color: 'var(--gold)' }}>Crear recetas →</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recetas.map(r => {
              const precioActual = parseFloat(precios[r.id] || '0')
              const sugerido = precioSugerido(r.costo_total)
              const mReal = margenReal(r.costo_total, precioActual)
              return (
                <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{r.producto_nombre}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Costo real</div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)', fontSize: 16 }}>{fmt(r.costo_total)}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Precio sugerido ({margen}% margen)</div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)', fontSize: 18 }}>{fmt(sugerido)}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Tu precio actual</div>
                      <input
                        type="number"
                        placeholder="$0"
                        value={precios[r.id] || ''}
                        onChange={e => setPrecios({ ...precios, [r.id]: e.target.value })}
                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18, width: '100%', outline: 'none' }}
                      />
                    </div>
                  </div>

                  {precioActual > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(mReal, 100)}%`, height: '100%', background: colorMargen(mReal), borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: colorMargen(mReal), fontSize: 14, minWidth: 50 }}>{Math.round(mReal)}%</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mReal >= 60 ? '✓ Bueno' : mReal >= 40 ? '⚠ Bajo' : '🔴 Crítico'}</span>
                    </div>
                  )}

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Ver ingredientes ({r.ingredientes.length})</summary>
                    <div style={{ marginTop: 8 }}>
                      {r.ingredientes.map((ing, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--muted)' }}>{ing.nombre} · {ing.cantidad} {ing.unidad}</span>
                          <span style={{ fontFamily: 'var(--mono)' }}>{fmt(ing.costo)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
