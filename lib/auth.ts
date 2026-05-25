import { supabase } from './supabase'

export type Rol = 'admin' | 'garzon'

export interface Sesion {
  rol: Rol
  nombre: string
  empresa_id: string
  expira: number
}

const CLAVE = 'lf_sesion'
const DURACION = 12 * 60 * 60 * 1000 // 12 horas
const EMPRESA_SLUG_DEFAULT = 'lafelicitta'

export function getSesion(): Sesion | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const s: Sesion = JSON.parse(raw)
    if (Date.now() > s.expira) {
      localStorage.removeItem(CLAVE)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function setSesion(rol: Rol, nombre: string, empresa_id: string) {
  const sesion: Sesion = { rol, nombre, empresa_id, expira: Date.now() + DURACION }
  localStorage.setItem(CLAVE, JSON.stringify(sesion))
}

export function cerrarSesion() {
  localStorage.removeItem(CLAVE)
  window.location.href = '/login'
}

export function esAdmin(): boolean {
  return getSesion()?.rol === 'admin'
}

export function getEmpresaId(): string | null {
  return getSesion()?.empresa_id || null
}

export async function getEmpresaIdActual(): Promise<string | null> {
  const sesion = getSesion()
  if (!sesion?.empresa_id) return null
  if (esUuid(sesion.empresa_id)) return sesion.empresa_id

  const empresaId = await resolverEmpresaId(sesion.empresa_id)
  if (!empresaId) return null

  setSesion(sesion.rol, sesion.nombre, empresaId)
  return empresaId
}

export async function resolverEmpresaId(empresaIdOSlug = EMPRESA_SLUG_DEFAULT): Promise<string | null> {
  if (esUuid(empresaIdOSlug)) return empresaIdOSlug

  const { data } = await supabase
    .from('empresas')
    .select('id')
    .eq('slug', empresaIdOSlug)
    .maybeSingle()

  return data?.id || null
}

function esUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}
