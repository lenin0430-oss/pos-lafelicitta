// Gestión de sesión simple con localStorage
// Roles: 'admin' | 'garzon'

export type Rol = 'admin' | 'garzon'

export interface Sesion {
  rol: Rol
  nombre: string
  expira: number // timestamp
}

const CLAVE = 'lf_sesion'
const DURACION = 12 * 60 * 60 * 1000 // 12 horas

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

export function setSesion(rol: Rol, nombre: string) {
  const sesion: Sesion = { rol, nombre, expira: Date.now() + DURACION }
  localStorage.setItem(CLAVE, JSON.stringify(sesion))
}

export function cerrarSesion() {
  localStorage.removeItem(CLAVE)
  window.location.href = '/login'
}

export function esAdmin(): boolean {
  return getSesion()?.rol === 'admin'
}
