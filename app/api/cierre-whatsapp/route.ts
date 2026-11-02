import { NextResponse } from 'next/server'
import { sesionDelServidor } from '@/lib/restaurante'
import { autorizarCierreWhatsapp } from '@/lib/seguridadBot'

// Reenvía el cierre de turno al bot. Exige sesión del negocio vinculado, filtra el contenido
// y usa un secreto que solo existe en el servidor (BOT_SECRET). Sin configuración: 503.
export async function POST(request: Request) {
  const botUrl = process.env.BOT_URL
  const botSecret = process.env.BOT_SECRET
  let datos: unknown = null
  try { datos = await request.json() } catch { /* cuerpo inválido: lo rechaza el validador */ }

  const r = autorizarCierreWhatsapp(sesionDelServidor(request), datos, {
    empresaPermitida: process.env.BOT_EMPRESA_ID,
    botConfigurado: Boolean(botUrl && botSecret),
  })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status })

  try {
    const res = await fetch(`${botUrl}/cierre-turno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': botSecret as string },
      body: JSON.stringify(r.payload),
    })
    const json = await res.json().catch(() => ({}))
    return NextResponse.json(json, { status: res.ok ? 200 : 502 })
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo contactar al bot' }, { status: 502 })
  }
}
