import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MesaPOS — Sistema de Caja y Comandas',
  description: 'MesaPOS para restaurantes, comida rápida y negocios gastronómicos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
