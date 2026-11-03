import { createClient } from '@supabase/supabase-js'
import { crearClienteDatos } from './clienteDatos'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function esUrlValida(valor: string) {
  return /^https?:\/\//i.test(valor)
}

const supabaseUrl = esUrlValida(rawUrl) ? rawUrl : 'https://placeholder.supabase.co'
const supabaseKey = rawKey && !rawKey.includes('PEGAR_AQUI') ? rawKey : 'placeholder-anon-key'

if (typeof window !== 'undefined' && (!esUrlValida(rawUrl) || !rawKey || rawKey.includes('PEGAR_AQUI'))) {
  console.warn('Supabase no está configurado en este entorno. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.')
}

const clienteDirecto = createClient(supabaseUrl, supabaseKey)

// Con NEXT_PUBLIC_DATOS_VIA_SERVIDOR=1 el navegador NO consulta las tablas privadas: todo pasa por /api/datos (sesión firmada + reglas del servidor).
// Sin la variable, comportamiento anterior (cliente directo con llave pública). Ver docs/PERMISOS_PLAN.md.
export const DATOS_VIA_SERVIDOR = process.env.NEXT_PUBLIC_DATOS_VIA_SERVIDOR === '1'
const haySesionLocal = () => {
  if (typeof window === 'undefined') return false
  try { const s = JSON.parse(localStorage.getItem('lf_sesion') || 'null'); return !!s && Date.now() < s.expira } catch { return false }
}
export const supabase: typeof clienteDirecto = DATOS_VIA_SERVIDOR
  ? (crearClienteDatos(clienteDirecto, haySesionLocal) as unknown as typeof clienteDirecto)
  : clienteDirecto
