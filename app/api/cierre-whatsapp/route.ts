import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const datos = await request.json()
    const res = await fetch('http://67.205.170.244:3001/cierre-turno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': 'lafelicitta2026'
      },
      body: JSON.stringify(datos)
    })
    const json = await res.json()
    return NextResponse.json(json)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
