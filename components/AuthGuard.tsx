'use client'
import { useEffect, useState } from 'react'
import { getSesion, cerrarSesion, type Rol } from '@/lib/auth'

interface Props {
  children: React.ReactNode
  rolRequerido?: Rol // si no se pasa, cualquier rol puede entrar
}

export default function AuthGuard({ children, rolRequerido }: Props) {
  const [verificando, setVerificando] = useState(true)
  const [permitido, setPermitido] = useState(false)

  useEffect(() => {
    const sesion = getSesion()

    if (!sesion) {
      window.location.href = '/login'
      return
    }

    if (rolRequerido && sesion.rol !== rolRequerido) {
      // No tiene permiso — redirigir a caja
      window.location.href = '/'
      return
    }

    setPermitido(true)
    setVerificando(false)
  }, [rolRequerido])

  if (verificando) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', color: 'var(--muted)', fontSize: 14 }}>
        Verificando acceso...
      </div>
    )
  }

  if (!permitido) return null

  return <>{children}</>
}
