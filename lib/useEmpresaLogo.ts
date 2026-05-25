import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getSesion } from './auth'

export function useEmpresaLogo(fallback = '/logo-lafelicitta.png') {
  const [logoUrl, setLogoUrl] = useState(fallback)

  useEffect(() => {
    const sesion = getSesion()
    if (!sesion?.empresa_id) return

    supabase
      .from('empresas')
      .select('logo_url')
      .eq('id', sesion.empresa_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url)
      })
  }, [])

  return logoUrl
}
