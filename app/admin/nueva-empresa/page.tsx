'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import AuthGuard from '@/components/AuthGuard'

// ──────────────────────────────────────────────────────────
//  /admin/nueva-empresa
//  Solo accesible para rol = 'admin'
//  Crea la empresa + usuario admin en una sola operación
// ──────────────────────────────────────────────────────────

function slugify(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function NuevaEmpresaPage() {
  // Datos empresa
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [slug, setSlug] = useState('')
  const [colorPrimario, setColorPrimario] = useState('#C9A84C')

  // Datos admin del restaurante
  const [adminNombre, setAdminNombre] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPin, setAdminPin] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'err'; msg: string } | null>(null)

  function handleNombreChange(v: string) {
    setNombre(v)
    setSlug(slugify(v))
  }

  async function crearRestaurante() {
    // Validaciones
    if (!nombre.trim()) return mostrar('err', 'Ingresa el nombre del restaurante')
    if (!slug.trim()) return mostrar('err', 'El slug no puede estar vacío')
    if (!ciudad.trim()) return mostrar('err', 'Ingresa la ciudad')
    if (!adminNombre.trim()) return mostrar('err', 'Ingresa el nombre del administrador')
    if (!adminEmail.trim()) return mostrar('err', 'Ingresa el email del administrador')
    if (adminPin.length < 4) return mostrar('err', 'El PIN debe tener al menos 4 dígitos')

    setGuardando(true)
    setResultado(null)

    try {
      // 1. Crear empresa
      const { data: empresa, error: errEmpresa } = await supabase
        .from('empresas')
        .insert({
          nombre: nombre.trim(),
          slug: slug.trim(),
          ciudad: ciudad.trim(),
          color_primario: colorPrimario,
          activo: true,
        })
        .select('id')
        .single()

      if (errEmpresa || !empresa) {
        const msg = errEmpresa?.message || 'Error al crear la empresa'
        if (msg.includes('slug')) {
          mostrar('err', `El slug "${slug}" ya existe. Elige otro nombre o cámbialo manualmente.`)
        } else {
          mostrar('err', 'Error al crear empresa: ' + msg)
        }
        setGuardando(false)
        return
      }

      // 2. Crear usuario admin para esa empresa
      const { error: errUsuario } = await supabase
        .from('usuarios')
        .insert({
          nombre: adminNombre.trim(),
          email: adminEmail.toLowerCase().trim(),
          pin: adminPin.trim(),
          rol: 'admin',
          empresa_id: empresa.id,
          activo: true,
        })

      if (errUsuario) {
        // Si falla el usuario, eliminar la empresa recién creada
        await supabase.from('empresas').delete().eq('id', empresa.id)
        mostrar('err', 'Error al crear usuario admin: ' + errUsuario.message)
        setGuardando(false)
        return
      }

      // ¡Éxito!
      mostrar('ok', `✅ Restaurante "${nombre}" creado correctamente. El admin puede entrar con su email y PIN.`)

      // Limpiar formulario
      setNombre('')
      setSlug('')
      setCiudad('')
      setColorPrimario('#C9A84C')
      setAdminNombre('')
      setAdminEmail('')
      setAdminPin('')

    } catch (e: any) {
      mostrar('err', 'Error inesperado: ' + e.message)
    }

    setGuardando(false)
  }

  function mostrar(tipo: 'ok' | 'err', msg: string) {
    setResultado({ tipo, msg })
  }

  const input = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { placeholder?: string; type?: string; maxLength?: number; readOnly?: boolean }
  ) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={opts?.type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={opts?.placeholder}
        maxLength={opts?.maxLength}
        readOnly={opts?.readOnly}
        style={{
          width: '100%',
          background: opts?.readOnly ? 'var(--surface2)' : 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: opts?.readOnly ? 'var(--muted)' : 'var(--text)',
          padding: '11px 14px',
          fontFamily: 'var(--font)',
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
          opacity: opts?.readOnly ? 0.7 : 1,
        }}
      />
    </div>
  )

  return (
    <AuthGuard rolRequerido="admin">
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

        {/* Header */}
        <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--gold)' }}>MESAPOS</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Panel Admin</span>
          <nav style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
            <a href="/" style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }}>🧾 Volver a Caja</a>
            <a href="/admin/restaurantes" style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }}>📋 Ver restaurantes</a>
          </nav>
        </header>

        <div style={{ padding: 32, maxWidth: 680, margin: '0 auto' }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 2, color: 'var(--text)', margin: 0, marginBottom: 6 }}>NUEVO RESTAURANTE</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Completa el formulario para registrar un nuevo cliente en MesaPos. Se crea la empresa y el usuario administrador en un solo paso.
            </p>
          </div>

          {/* Resultado */}
          {resultado && (
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              marginBottom: 24,
              background: resultado.tipo === 'ok' ? 'rgba(76,175,125,.12)' : 'rgba(217,79,61,.12)',
              border: `1px solid ${resultado.tipo === 'ok' ? 'var(--green)' : 'var(--red)'}`,
              color: resultado.tipo === 'ok' ? 'var(--green)' : 'var(--red)',
              fontSize: 14,
              lineHeight: 1.5,
            }}>
              {resultado.msg}
            </div>
          )}

          {/* SECCIÓN 1: Datos del restaurante */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 2, color: 'var(--gold)', marginBottom: 18 }}>
              🍽 DATOS DEL RESTAURANTE
            </div>

            {input('Nombre del restaurante', nombre, handleNombreChange, { placeholder: 'Ej: Pizzería El Sol' })}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                Slug (URL) — se genera automático
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="pizzeria-el-sol"
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>mesapos.app/→ {slug || '...'}</span>
              </div>
            </div>

            {input('Ciudad', ciudad, setCiudad, { placeholder: 'Ej: Santiago, Iquique, Valparaíso' })}

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                Color principal
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="color"
                  value={colorPrimario}
                  onChange={e => setColorPrimario(e.target.value)}
                  style={{ width: 48, height: 40, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface2)', padding: 2 }}
                />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--muted)' }}>{colorPrimario}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#C9A84C', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'].map(c => (
                    <div
                      key={c}
                      onClick={() => setColorPrimario(c)}
                      style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: colorPrimario === c ? '2px solid white' : '2px solid transparent' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Usuario administrador */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 2, color: 'var(--gold)', marginBottom: 18 }}>
              👤 USUARIO ADMINISTRADOR
            </div>

            {input('Nombre del administrador', adminNombre, setAdminNombre, { placeholder: 'Ej: Carlos Méndez' })}
            {input('Email', adminEmail, setAdminEmail, { placeholder: 'carlos@pizzeriaelsol.com', type: 'email' })}

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                PIN de acceso (4 dígitos)
              </label>
              <input
                type="password"
                value={adminPin}
                onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                maxLength={6}
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 18, outline: 'none', boxSizing: 'border-box', letterSpacing: 6 }}
              />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, margin: '5px 0 0' }}>
                El dueño usará este PIN junto a su email para entrar como admin.
              </p>
            </div>
          </div>

          {/* Botón crear */}
          <button
            onClick={crearRestaurante}
            disabled={guardando}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 12,
              border: 'none',
              background: guardando ? 'var(--surface2)' : 'var(--gold)',
              color: guardando ? 'var(--muted)' : '#000',
              fontSize: 16,
              fontWeight: 700,
              cursor: guardando ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)',
              letterSpacing: 1,
            }}
          >
            {guardando ? 'Creando restaurante...' : '🍽 Crear Restaurante'}
          </button>
        </div>
      </div>
    </AuthGuard>
  )
}
