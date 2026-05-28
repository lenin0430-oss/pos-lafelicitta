'use client'
import { useState } from 'react'
import Nav from '@/components/Nav'
import AuthGuard from '@/components/AuthGuard'
import { supabase } from '@/lib/supabase'
import { getEmpresaIdActual } from '@/lib/auth'

const panes = [
  ['Pan perro pequeno 70g', 35],
  ['Pan perro grande 105g', 47],
  ['Pan completo 120g', 51],
  ['Pan churrasco 150g', 71],
] as const

export default function Page() {
  const [m, setM] = useState('')
  const [busy, setBusy] = useState(false)
  async function subir(nombre: string, costo: number) {
    const empresa_id = await getEmpresaIdActual()
    if (!empresa_id) { setM('No hay empresa activa'); return }
    setBusy(true)
    const body = { producto_nombre: nombre, ingredientes: [{ nombre: 'Masa pan salado', cantidad: 1, unidad: 'unidad', costo }], costo_total: costo }
    const q = await supabase.from('recetas').select('id').eq('empresa_id', empresa_id).eq('producto_nombre', nombre).maybeSingle()
    const r = q.data?.id
      ? await supabase.from('recetas').update(body).eq('empresa_id', empresa_id).eq('id', q.data.id)
      : await supabase.from('recetas').insert({ ...body, empresa_id })
    setM(r.error ? r.error.message : nombre + ' guardado')
    setBusy(false)
  }
  return <AuthGuard><main style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', paddingBottom:60 }}><Nav active="costeo"/><div style={{ maxWidth:760, margin:'0 auto', padding:20 }}><h1 style={{ color:'var(--gold)' }}>Guardar panes salados</h1>{m && <p style={{ color:'var(--green)' }}>{m}</p>}{panes.map(([n,c])=><div key={n} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}><b>{n} · ${c}</b><button disabled={busy} onClick={()=>subir(n,c)} style={{ background:'var(--gold)', color:'#000', border:0, borderRadius:8, padding:'10px 12px', fontWeight:800 }}>Subir</button></div>)}<a href="/costeo" style={{ display:'block', marginTop:16, color:'var(--gold)' }}>Ver Costeo</a></div></main></AuthGuard>
}
