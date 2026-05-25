'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'
import AuthGuard from '@/components/AuthGuard'
import { useEmpresaNombre } from '@/lib/useEmpresaNombre'

interface Venta {
  id: string
  numero: number
  mesa: string
  mesero: string
  items: { nombre: string; cantidad: number; nota?: string; ingredientes?: string }[]
  estado: 'pendiente' | 'en_proceso' | 'listo'
  created_at: string
  total: number
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: '🔴 Nuevo',
  en_proceso: '🟡 En proceso',
  listo: '🟢 Listo',
}
const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#d94f3d',
  en_proceso: '#e8a32c',
  listo: '#4caf7d',
}

export default function CocinaPage() {
  const empresaNombre = useEmpresaNombre()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [filtro, setFiltro] = useState<'pendiente' | 'en_proceso' | 'todos'>('pendiente')
  const [hora, setHora] = useState('')

  useEffect(() => {
    cargarVentas()
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)

    const canal = supabase.channel('cocina')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => cargarVentas())
      .subscribe()

    return () => { supabase.removeChannel(canal); clearInterval(tick) }
  }, [])

  async function cargarVentas() {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) { setVentas([]); return }

    const { data } = await supabase
      .from('ventas')
      .select('*')
      .eq('empresa_id', empresaId)
      .in('estado', ['pendiente', 'en_proceso'])
      .order('created_at', { ascending: true })
    if (data) setVentas(data)
  }

  async function cambiarEstado(id: string, estado: string) {
    const empresaId = await getEmpresaIdActual()
    if (!empresaId) return
    await supabase.from('ventas').update({ estado }).eq('empresa_id', empresaId).eq('id', id)
    cargarVentas()
  }

  const ventasFiltradas = filtro === 'todos' ? ventas : ventas.filter(v => v.estado === filtro)

  function minutosDesde(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000 / 60
    return Math.floor(diff)
  }

  return (
    <AuthGuard>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
        {/* Header */}
        <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 3, color: 'var(--gold)' }}>{empresaNombre}</span>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
            {[['/', '🧾 Caja'], ['/cocina', '🍳 Cocina'], ['/reportes', '📊 Reportes']].map(([href, label]) => (
              <a key={href} href={href} style={{ padding: '5px 14px', borderRadius: 6, background: href === '/cocina' ? 'var(--gold)' : 'transparent', color: href === '/cocina' ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid ' + (href === '/cocina' ? 'var(--gold)' : 'var(--border)') }}>{label}</a>
            ))}
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>⚡ Tiempo real</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{hora}</span>
          </div>
        </header>

        <div style={{ padding: 20 }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, color: 'var(--muted)', marginRight: 8 }}>FILTRAR:</span>
            {[['pendiente', '🔴 Nuevos'], ['en_proceso', '🟡 En proceso'], ['todos', 'Todos']].map(([val, label]) => (
              <button key={val} onClick={() => setFiltro(val as any)} style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (filtro === val ? 'var(--gold)' : 'var(--border)'), background: filtro === val ? 'var(--gold)' : 'transparent', color: filtro === val ? '#000' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>{ventasFiltradas.length} comandas</span>
          </div>

          {/* Grid comandas */}
          {ventasFiltradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🍳</div>
              <div style={{ fontSize: 16 }}>No hay comandas pendientes</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {ventasFiltradas.map(venta => {
                const mins = minutosDesde(venta.created_at)
                const urgente = mins >= 15 && venta.estado === 'pendiente'
                return (
                  <div key={venta.id} style={{ background: 'var(--surface)', border: `2px solid ${urgente ? 'var(--red)' : ESTADO_COLOR[venta.estado]}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .3s' }}>
                    <div style={{ background: urgente ? 'var(--red)' : ESTADO_COLOR[venta.estado], padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1, color: '#fff' }}>#{String(venta.numero).padStart(3, '0')} — {venta.mesa}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 11 }}>{mins}min</div>
                        {urgente && <div style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>⚠️ DEMORADO</div>}
                      </div>
                    </div>

                    <div style={{ padding: 14 }}>
                      <div style={{ marginBottom: 10 }}>
                        {(venta.items || []).map((item, idx) => (
                          <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--gold)', minWidth: 24 }}>{item.cantidad}×</span>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{item.nombre}</div>
                              {item.ingredientes && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.35, marginTop: 3 }}>↳ {item.ingredientes}</div>}
                              {item.nota && <div style={{ fontSize: 12, color: 'var(--gold)', fontStyle: 'italic', marginTop: 3 }}>📝 {item.nota}</div>}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={`/?editar=${venta.id}`} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center', textDecoration: 'none' }}>
                          ✏️ Editar
                        </a>
                        {venta.estado === 'pendiente' && (
                          <button onClick={() => cambiarEstado(venta.id, 'en_proceso')} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#e8a32c', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            🍳 En proceso
                          </button>
                        )}
                        {venta.estado === 'en_proceso' && (
                          <button onClick={() => cambiarEstado(venta.id, 'listo')} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            ✅ Listo
                          </button>
                        )}
                        {venta.estado === 'listo' && (
                          <button onClick={() => cambiarEstado(venta.id, 'entregado')} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            📦 Entregado
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
