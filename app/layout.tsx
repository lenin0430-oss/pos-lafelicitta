import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'POS La Felicitta',
  description: 'Sistema de caja y comandas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
