'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { setSesion } from '@/lib/auth'

export default function LoginPage() {
  const [modo, setModo] = useState<'pin'|'admin'>('pin')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    localStorage.removeItem('lf_sesion')
  }, [])

  function presionarPin(num: string) {
    if (pin.length >= 4) return
    setPin(prev => prev + num)
    setError('')
  }

  function borrarPin() {
    setPin(prev => prev.slice(0, -1))
    setError('')
  }

  async function verificarPin(pinCompleto: string) {
    if (pinCompleto.length < 4) return
    setCargando(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('usuarios_pos')
        .select('*')
        .eq('pin', pinCompleto)
        .eq('activo', true)
        .single()

      if (error || !data) {
        setError('PIN incorrecto')
        setPin('')
      } else {
        setSesion('garzon', data.nombre, data.empresa_id)
        window.location.href = '/'
      }
    } catch {
      setError('Error de conexión')
      setPin('')
    }
    setCargando(false)
  }

  async function loginAdmin() {
    setCargando(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('usuarios_pos')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('rol', 'admin')
        .eq('activo', true)
        .single()

      if (error || !data) {
        setError('Credenciales incorrectas')
        setCargando(false)
        return
      }

      if (data.password !== password) {
        setError('Contraseña incorrecta')
        setCargando(false)
        return
      }

      setSesion('admin', data.nombre, data.empresa_id)
      window.location.href = '/'
    } catch {
      setError('Error de conexión')
    }
    setCargando(false)
  }

  useEffect(() => {
    if (pin.length === 4) verificarPin(pin)
  }, [pin])

  const btnPin = (num: string) => (
    <button
      key={num}
      onClick={() => presionarPin(num)}
      disabled={cargando}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, color: 'var(--text)', fontSize: 22, fontWeight: 700,
        fontFamily: 'var(--mono)', cursor: 'pointer', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s',
      }}
    >
      {num}
    </button>
  )

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font)', padding: 20
    }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 4, color: 'var(--gold)', marginBottom: 4 }}>
        MESAPOS
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 2, marginBottom: 32 }}>
        SISTEMA DE CAJA
      </div>

      <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 12, padding: 4, gap: 4, marginBottom: 28, border: '1px solid var(--border)' }}>
        <button onClick={() => { setModo('pin'); setError('') }} style={{ padding: '8px 24px', borderRadius: 10, border: 'none', background: modo === 'pin' ? 'var(--gold)' : 'transparent', color: modo === 'pin' ? '#000' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          👤 Garzón
        </button>
        <button onClick={() => { setModo('admin'); setError('') }} style={{ padding: '8px 24px', borderRadius: 10, border: 'none', background: modo === 'admin' ? 'var(--gold)' : 'transparent', color: modo === 'admin' ? '#000' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          🔐 Admin
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: 320 }}>
        {modo === 'pin' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: pin.length > i ? 'var(--gold)' : 'var(--surface2)',
                  border: '2px solid ' + (pin.length > i ? 'var(--gold)' : 'var(--border)'),
                  transition: 'all 0.15s'
                }} />
              ))}
            </div>

            {error && (
              <div style={{ textAlign: 'center', color: 'var(--red)', fontSize: 13, marginBottom: 16, padding: '8px', background: 'rgba(217,79,61,.1)', borderRadius: 8, border: '1px solid var(--red)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1','2','3','4','5','6','7','8','9'].map(n => btnPin(n))}
              <div />
              {btnPin('0')}
              <button onClick={borrarPin} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)', fontSize: 20, cursor: 'pointer', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⌫</button>
            </div>

            {cargando && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>Verificando...</div>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="admin@mirestaurante.com"
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '12px 14px', fontFamily: 'var(--font)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && loginAdmin()}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '12px 14px', fontFamily: 'var(--font)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'rgba(217,79,61,.1)', borderRadius: 8, border: '1px solid var(--red)' }}>
                  {error}
                </div>
              )}

              <button
                onClick={loginAdmin}
                disabled={cargando || !email || !password}
                style={{ padding: '14px', borderRadius: 10, border: 'none', background: (!email || !password) ? 'var(--surface2)' : 'var(--gold)', color: (!email || !password) ? 'var(--muted)' : '#000', fontSize: 15, fontWeight: 700, cursor: (!email || !password) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: cargando ? 0.6 : 1 }}>
                {cargando ? 'Entrando...' : '🔐 Entrar como Admin'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
