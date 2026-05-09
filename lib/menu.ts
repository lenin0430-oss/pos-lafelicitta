export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria: string
}

export const MENU: Producto[] = [
  // ── BURGERS ──────────────────────────────────────────────────
  { id: 'burger-felicitta',       nombre: 'Burger La Felicitta',      precio: 3500,  categoria: 'Burgers' },
  { id: 'burger-especial-carne',  nombre: 'Burger Especial de Carne', precio: 5000,  categoria: 'Burgers' },
  { id: 'burger-super-carne',     nombre: 'Burger Super de Carne',    precio: 6000,  categoria: 'Burgers' },
  { id: 'burger-doble',           nombre: 'Burger Doble',             precio: 7500,  categoria: 'Burgers' },
  { id: 'burger-pelua',           nombre: 'Burger La Pelua',          precio: 8500,  categoria: 'Burgers' },
  { id: 'burger-triple',          nombre: 'Burger Triple',            precio: 9990,  categoria: 'Burgers' },
  { id: 'burger-estrella-xl',     nombre: 'La Estrella XL',           precio: 7500,  categoria: 'Burgers' },
  { id: 'burger-luna-xl',         nombre: 'La Luna XL',               precio: 7500,  categoria: 'Burgers' },
  { id: 'burger-casa-club-xl',    nombre: 'La Casa Club XL',          precio: 9500,  categoria: 'Burgers' },

  // ── PERROS ───────────────────────────────────────────────────
  { id: 'perro-luka',             nombre: 'Perro El de Luka',         precio: 1000,  categoria: 'Perros' },
  { id: 'perro-callejero',        nombre: 'Perro El Callejero',       precio: 2500,  categoria: 'Perros' },
  { id: 'perro-loco',             nombre: 'Perro El Loco',            precio: 3500,  categoria: 'Perros' },
  { id: 'perro-chileno',          nombre: 'Perro El Chileno',         precio: 3500,  categoria: 'Perros' },
  { id: 'perro-americano',        nombre: 'Perro El Americano',       precio: 3990,  categoria: 'Perros' },
  { id: 'perro-peluo',            nombre: 'Perro El Peluo',           precio: 3990,  categoria: 'Perros' },

  // ── COMPLETOS / SÁNDWICHS ────────────────────────────────────
  { id: 'as-normal',              nombre: 'As Normal',                precio: 3500,  categoria: 'Completos' },
  { id: 'as-xl',                  nombre: 'As XL',                    precio: 6500,  categoria: 'Completos' },
  { id: 'italiano-normal',        nombre: 'Italiano Normal',          precio: 2500,  categoria: 'Completos' },
  { id: 'italiano-xl',            nombre: 'Italiano XL',              precio: 4500,  categoria: 'Completos' },
  { id: 'churrasco-italiano',     nombre: 'Churrasco Italiano',       precio: 5000,  categoria: 'Completos' },
  { id: 'churrasco-super',        nombre: 'Churrasco Super',          precio: 5500,  categoria: 'Completos' },
  { id: 'barros-luco',            nombre: 'Barros Luco',              precio: 5000,  categoria: 'Completos' },
  { id: 'churrasco-mechada',      nombre: 'Churrasco Mechada',        precio: 6000,  categoria: 'Completos' },
  { id: 'chacarero',              nombre: 'Chacarero',                precio: 6000,  categoria: 'Completos' },

  // ── AREPAS ───────────────────────────────────────────────────
  { id: 'arepa-venezolana',       nombre: 'Arepa Venezolana (5 ingr)',precio: 3500,  categoria: 'Arepas' },

  // ── CACHAPAS ─────────────────────────────────────────────────
  { id: 'cachapa-queso-llanero',  nombre: 'Cachapa Queso Llanero',    precio: 6500,  categoria: 'Cachapas' },
  { id: 'cachapa-cochino',        nombre: 'Cachapa Cochino Frito',    precio: 8500,  categoria: 'Cachapas' },
  { id: 'cachapa-queso-mano',     nombre: 'Cachapa Queso de Mano',    precio: 7500,  categoria: 'Cachapas' },
  { id: 'cachapa-cochino-queso',  nombre: 'Cachapa Cochino + Queso',  precio: 10000, categoria: 'Cachapas' },

  // ── ARROZ CHINO ──────────────────────────────────────────────
  { id: 'arroz-salteado',         nombre: 'Arroz Salteado',           precio: 4500,  categoria: 'Arroz Chino' },
  { id: 'pollo-arroz-papas',      nombre: 'Pollo + Arroz + Papas',    precio: 4990,  categoria: 'Arroz Chino' },
  { id: 'arroz-cerdo-pollo',      nombre: 'Arroz Especial Cerdo-Pollo',precio: 8000, categoria: 'Arroz Chino' },
  { id: 'arroz-cerdo-camaron',    nombre: 'Arroz Especial Cerdo-Camarón',precio:10000,categoria:'Arroz Chino'},
  { id: 'arroz-la-felicitta',     nombre: 'Arroz La Felicitta',       precio: 12000, categoria: 'Arroz Chino' },

  // ── PEPITOS ──────────────────────────────────────────────────
  { id: 'pepito-pollo',           nombre: 'Pepito Pollo 15cm',        precio: 7500,  categoria: 'Pepitos' },
  { id: 'pepito-carne',           nombre: 'Pepito Carne 15cm',        precio: 8500,  categoria: 'Pepitos' },
  { id: 'pepito-mixto',           nombre: 'Pepito Mixto 15cm',        precio: 9500,  categoria: 'Pepitos' },
  { id: 'pepito-bestia',          nombre: 'Pepito Mixto BESTIA 30cm', precio: 14990, categoria: 'Pepitos' },

  // ── PATACONES ────────────────────────────────────────────────
  { id: 'patacon-normal',         nombre: 'Patacón Normal',           precio: 7500,  categoria: 'Patacones' },
  { id: 'patacon-especial',       nombre: 'Patacón Especial',         precio: 8500,  categoria: 'Patacones' },
  { id: 'patacon-mixto-top',      nombre: 'Patacón Mixto TOP',        precio: 12000, categoria: 'Patacones' },

  // ── PAPAS ─────────────────────────────────────────────────────
  { id: 'papas-normal',           nombre: 'Papas Fritas Normal',      precio: 3500,  categoria: 'Papas' },
  { id: 'papas-xl',               nombre: 'Papas Fritas XL',          precio: 6500,  categoria: 'Papas' },
  { id: 'bacon-cheddar',          nombre: 'Bacon & Cheddar',          precio: 5500,  categoria: 'Papas' },
  { id: 'bacon-cheddar-xl',       nombre: 'Bacon & Cheddar XL',       precio: 9990,  categoria: 'Papas' },
  { id: 'salchipapas-normal',     nombre: 'Salchipapas Normal',       precio: 4500,  categoria: 'Papas' },
  { id: 'salchipapas-xl',         nombre: 'Salchipapas XL',           precio: 7990,  categoria: 'Papas' },
  { id: 'nuggets-6',              nombre: 'Nuggets 6u',               precio: 4000,  categoria: 'Papas' },
  { id: 'nuggets-12',             nombre: 'Nuggets 12u',              precio: 7500,  categoria: 'Papas' },

  // ── EMPANADAS ────────────────────────────────────────────────
  { id: 'emp-mechada',            nombre: 'Empanada Carne Mechada',   precio: 3000,  categoria: 'Empanadas' },
  { id: 'emp-pollo',              nombre: 'Empanada Pollo',           precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-molida',             nombre: 'Empanada Molida',          precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-jamon-queso',        nombre: 'Empanada Jamón Queso',     precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-pabellon',           nombre: 'Empanada Pabellón',        precio: 3000,  categoria: 'Empanadas' },
  { id: 'emp-caraota-queso',      nombre: 'Empanada Caraota Queso',   precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-perico-queso',       nombre: 'Empanada Perico Queso Llanero', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-queso',              nombre: 'Empanada Queso',           precio: 2500,  categoria: 'Empanadas' },

  // ── TEQUEÑOS ─────────────────────────────────────────────────
  { id: 'tequeno-25-queso',       nombre: 'Tequeño 25cm Queso',       precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequeno-25-jamon',       nombre: 'Tequeño 25cm Jamón Queso', precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequeno-25-guayaba',     nombre: 'Tequeño 25cm Guayaba',     precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequenos-x4',            nombre: 'Tequeños x4 (8cm)',        precio: 2600,  categoria: 'Tequeños' },
  { id: 'tequenos-x8',            nombre: 'Tequeños x8 (8cm)',        precio: 4900,  categoria: 'Tequeños' },
  { id: 'tequenos-x12',           nombre: 'Tequeños x12 (8cm)',       precio: 6900,  categoria: 'Tequeños' },

  // ── PASAPALOS ────────────────────────────────────────────────
  { id: 'mini-tequenos-50',       nombre: 'Mini Tequeños 50u',        precio: 13500, categoria: 'Pasapalos' },
  { id: 'mini-tequenos-100',      nombre: 'Mini Tequeños 100u',       precio: 24300, categoria: 'Pasapalos' },
  { id: 'mix-uno-50',             nombre: 'Mix Uno 50u',              precio: 14500, categoria: 'Pasapalos' },
  { id: 'mix-dos-75',             nombre: 'Mix Dos 75u',              precio: 23900, categoria: 'Pasapalos' },
  { id: 'mix-tres-100',           nombre: 'Mix Tres 100u',            precio: 26500, categoria: 'Pasapalos' },
  { id: 'mix-cuatro-100',         nombre: 'Mix Cuatro 100u',          precio: 31900, categoria: 'Pasapalos' },
  { id: 'mix-cinco-100',          nombre: 'Mix Cinco 100u',           precio: 32900, categoria: 'Pasapalos' },
  { id: 'mix-full-200',           nombre: 'Mix Full 200u',            precio: 63900, categoria: 'Pasapalos' },

  // ── CHURROS ──────────────────────────────────────────────────
  { id: 'churros-8-azucar',       nombre: 'Churros x8 Azúcar',        precio: 4500,  categoria: 'Churros' },
  { id: 'churros-14-azucar',      nombre: 'Churros x14 Azúcar',       precio: 6500,  categoria: 'Churros' },
  { id: 'churros-8-salsas',       nombre: 'Churros x8 + 2 Salsas',    precio: 5500,  categoria: 'Churros' },
  { id: 'churros-14-salsas',      nombre: 'Churros x14 + 2 Salsas',   precio: 6500,  categoria: 'Churros' },
  { id: 'churros-20-salsas',      nombre: 'Churros x20 + 2 Salsas',   precio: 7500,  categoria: 'Churros' },

  // ── BEBIDAS ──────────────────────────────────────────────────
  { id: 'coca-500',               nombre: 'Coca-Cola 500cc',          precio: 1500,  categoria: 'Bebidas' },
  { id: 'coca-lata',              nombre: 'Coca-Cola Lata',           precio: 1300,  categoria: 'Bebidas' },
  { id: 'sprite-500',             nombre: 'Sprite 500cc',             precio: 1500,  categoria: 'Bebidas' },
  { id: 'fanta-500',              nombre: 'Fanta 500cc',              precio: 1500,  categoria: 'Bebidas' },
  { id: 'bebida-15l',             nombre: 'Bebida 1.5L',              precio: 2500,  categoria: 'Bebidas' },
  { id: 'kr-personal',            nombre: 'KR Personal',              precio: 1000,  categoria: 'Bebidas' },
  { id: 'jugo-naranja',           nombre: 'Jugo Naranja Natural',     precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugo-mango',             nombre: 'Jugo Mango',               precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugo-pina',              nombre: 'Jugo Piña',                precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugo-maracuya',          nombre: 'Jugo Maracuyá',            precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugos-kris',             nombre: 'Jugos Kris',               precio: 1000,  categoria: 'Bebidas' },
  { id: 'agua-sin-gas',           nombre: 'Agua sin gas 500cc',       precio: 1300,  categoria: 'Bebidas' },
  { id: 'agua-con-gas',           nombre: 'Agua con gas 500cc',       precio: 1300,  categoria: 'Bebidas' },
  { id: 'cafe-americano',         nombre: 'Café Americano',           precio: 1500,  categoria: 'Bebidas' },
  { id: 'cafe-leche',             nombre: 'Café con Leche',           precio: 2000,  categoria: 'Bebidas' },
  { id: 'te-infusion',            nombre: 'Té / Infusión',            precio: 1500,  categoria: 'Bebidas' },
  { id: 'chocolate-caliente',     nombre: 'Chocolate Caliente',       precio: 2500,  categoria: 'Bebidas' },
]

export const CATEGORIAS = Array.from(new Set(MENU.map(p => p.categoria)))

export const MESAS = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Mesa 7', 'Mesa 8', 'Barra', 'Para llevar', 'Delivery'
]

export const METODOS_PAGO = ['Efectivo', 'Débito', 'QR MercadoPago', 'Transferencia']

// Tipo de servicio — aparece en la comanda impresa
export type TipoServicio = 'Mesa' | 'Para llevar' | 'Delivery'
