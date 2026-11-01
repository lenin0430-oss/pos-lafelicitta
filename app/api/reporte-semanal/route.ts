import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const EMPRESA_ID = '382de687-99e1-4303-bbac-783561f663f0'

function fmt(n: number) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

export async function GET(request: Request) {
  // Verificar token secreto
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (token !== 'lafelicitta2026') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    // Rango: lunes pasado a domingo pasado
    const hoy = new Date()
    const diaSemana = hoy.getDay() // 0=dom, 1=lun...
    const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1
    const lunesActual = new Date(hoy)
    lunesActual.setDate(hoy.getDate() - diasDesdeHoy(hoy))
    lunesActual.setHours(0, 0, 0, 0)

    const lunesPasado = new Date(lunesActual)
    lunesPasado.setDate(lunesActual.getDate() - 7)

    const domingoFin = new Date(lunesActual)
    domingoFin.setSeconds(-1)

    const desde = lunesPasado.toISOString()
    const hasta = domingoFin.toISOString()

    // Ventas de la semana
    const { data: ventas } = await supabase
      .from('ventas')
      .select('total, metodo_pago, created_at')
      .eq('empresa_id', EMPRESA_ID)
      .eq('estado', 'listo')
      .gte('created_at', desde)
      .lte('created_at', hasta)

    const totalVentas = (ventas || []).reduce((s, v) => s + (v.total || 0), 0)
    const cantVentas = (ventas || []).length
    const efectivo = (ventas || []).filter(v => (v.metodo_pago || '').toLowerCase().includes('efectivo')).reduce((s, v) => s + v.total, 0)
    const debito = (ventas || []).filter(v => (v.metodo_pago || '').toLowerCase().includes('deb')).reduce((s, v) => s + v.total, 0)
    const transfer = (ventas || []).filter(v => (v.metodo_pago || '').toLowerCase().includes('trans')).reduce((s, v) => s + v.total, 0)
    const qr = (ventas || []).filter(v => (v.metodo_pago || '').toLowerCase().includes('mercado')).reduce((s, v) => s + v.total, 0)

    // Promedio diario
    const promedioDiario = Math.round(totalVentas / 7)

    // Gastos de la semana
    const { data: gastos } = await supabase
      .from('gastos')
      .select('monto, categoria')
      .eq('empresa_id', EMPRESA_ID)
      .gte('created_at', desde)
      .lte('created_at', hasta)

    const totalGastos = (gastos || []).reduce((s, g) => s + (g.monto || 0), 0)
    const gastosSueldos = (gastos || []).filter(g => g.categoria === 'sueldos').reduce((s, g) => s + (g.monto || 0), 0)
    const gastosIngredientes = (gastos || []).filter(g => g.categoria === 'ingredientes').reduce((s, g) => s + (g.monto || 0), 0)

    // Propinas de la semana
    const { data: propinas } = await supabase
      .from('propinas')
      .select('monto, empleado')
      .eq('empresa_id', EMPRESA_ID)
      .gte('created_at', desde)
      .lte('created_at', hasta)

    const totalPropinas = (propinas || []).reduce((s, p) => s + (p.monto || 0), 0)

    // Cierres con diferencia
    const { data: cierres } = await supabase
      .from('cierres_caja')
      .select('diferencia, fecha')
      .eq('empresa_id', EMPRESA_ID)
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('diferencia', { ascending: true })

    const peorDiferencia = (cierres || []).length > 0 ? cierres![0].diferencia : 0
    const totalDiferencias = (cierres || []).reduce((s, c) => s + (c.diferencia || 0), 0)

    // Resultado neto estimado
    const neto = totalVentas - totalGastos

    // Armar mensaje
    const fechaDesde = lunesPasado.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    const fechaHasta = domingoFin.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })

    const mensaje = `📊 *REPORTE SEMANAL LA FELICITTA*
📅 ${fechaDesde} al ${fechaHasta}

💰 *VENTAS*
Total: *${fmt(totalVentas)}*
Comandas: ${cantVentas}
Promedio diario: ${fmt(promedioDiario)}

💳 *POR MÉTODO*
Efectivo: ${fmt(efectivo)}
Débito: ${fmt(debito)}
Transferencia: ${fmt(transfer)}
Mercado Pago: ${fmt(qr)}

💸 *GASTOS*
Total: *${fmt(totalGastos)}*
Sueldos: ${fmt(gastosSueldos)}
Ingredientes: ${fmt(gastosIngredientes)}

🎯 *RESULTADO*
Neto estimado: *${fmt(neto)}*

${totalPropinas > 0 ? `💰 Propinas semana: ${fmt(totalPropinas)}\n` : ''}${Math.abs(totalDiferencias) > 0 ? `⚠️ Diferencias acumuladas: ${fmt(totalDiferencias)}\n` : ''}${peorDiferencia < -10000 ? `🚨 Peor diferencia: ${fmt(peorDiferencia)}\n` : ''}`

    // Enviar por WhatsApp via bot
    await fetch('http://67.205.170.244:3001/cierre-turno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': 'lafelicitta2026'
      },
      body: JSON.stringify({ alerta_diferencia: false, reporte_semanal: true, mensaje_custom: mensaje })
    })

    return NextResponse.json({ ok: true, totalVentas, totalGastos, neto })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

function diasDesdeHoy(hoy: Date) {
  const diaSemana = hoy.getDay()
  return diaSemana === 0 ? 6 : diaSemana - 1
}
