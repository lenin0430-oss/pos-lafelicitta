import { createClient } from '@supabase/supabase-js'

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

export const supabase = createClient(supabaseUrl, supabaseKey)
