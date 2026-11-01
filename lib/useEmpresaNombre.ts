import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getSesion } from './auth'

/**
 * Hook que carga el nombre de la empresa activa desde Supabase.
 * Funciona para cualquier restaurant — no tiene nada hardcodeado.
 *
 * Uso:
 *   const empresaNombre = useEmpresaNombre()
 *   // → "LA FELICITTA" para La Felicitta
 *   // → "PIZZERÍA EL SOL" para el próximo cliente, etc.
 */
export function useEmpresaNombre(fallback = 'MESAPOS') {
  const [nombre, setNombre] = useState(fallback)

  useEffect(() => {
    const sesion = getSesion()
    if (!sesion?.empresa_id) return

    supabase
      .from('empresas')
      .select('nombre')
      .eq('id', sesion.empresa_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nombre) setNombre(data.nombre.toUpperCase())
      })
  }, [])

  return nombre
}
