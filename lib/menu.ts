export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria: string
}

export const MENU: Producto[] = [
  // Entradas
  { id: 'tequenos', nombre: 'Tequeños (6u)', precio: 3500, categoria: 'Entradas' },
  { id: 'empanada-pabellon', nombre: 'Empanada de Pabellón', precio: 2200, categoria: 'Entradas' },
  { id: 'empanada-queso', nombre: 'Empanada de Queso', precio: 2000, categoria: 'Entradas' },
  { id: 'pasapalos', nombre: 'Pasapalos Mix', precio: 8500, categoria: 'Entradas' },

  // Platos principales
  { id: 'arepa', nombre: 'Arepa Venezolana', precio: 4500, categoria: 'Principales' },
  { id: 'pabellon', nombre: 'Pabellón Criollo', precio: 7800, categoria: 'Principales' },
  { id: 'cachapa', nombre: 'Cachapa con Queso', precio: 5200, categoria: 'Principales' },
  { id: 'asado-negro', nombre: 'Asado Negro', precio: 9500, categoria: 'Principales' },
  { id: 'hallaca', nombre: 'Hallaca', precio: 4800, categoria: 'Principales' },
  { id: 'sancocho', nombre: 'Sancocho (domingo)', precio: 6500, categoria: 'Principales' },
  { id: 'parrilla', nombre: 'Parrilla (domingo)', precio: 12000, categoria: 'Principales' },

  // Bebidas
  { id: 'jugo', nombre: 'Jugo Natural', precio: 2000, categoria: 'Bebidas' },
  { id: 'agua', nombre: 'Agua Mineral', precio: 1200, categoria: 'Bebidas' },
  { id: 'bebida-cola', nombre: 'Bebida Cola', precio: 1500, categoria: 'Bebidas' },
  { id: 'cafe', nombre: 'Café / Marrón', precio: 1800, categoria: 'Bebidas' },

  // Postres
  { id: 'churros', nombre: 'Churros (salsa)', precio: 3200, categoria: 'Postres' },
  { id: 'bienmesabe', nombre: 'Bienmesabe', precio: 2800, categoria: 'Postres' },
]

export const CATEGORIAS = Array.from(new Set(MENU.map(p => p.categoria)))

export const MESAS = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Barra', 'Para llevar', 'Delivery'
]

export const METODOS_PAGO = ['Efectivo', 'Débito', 'QR MercadoPago', 'Transferencia']
