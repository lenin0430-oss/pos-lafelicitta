export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria: string
  ingredientes?: string
}

export const MENU: Producto[] = [
  // ── BURGERS ──────────────────────────────────────────────────
  { id: 'burger-felicitta',      nombre: 'Burger La Felicitta',       precio: 3500,  categoria: 'Burgers',    ingredientes: 'Carne de la casa, papas hilo, tomate, lechuga, ketchup, mostaza, mayo' },
  { id: 'burger-especial-carne', nombre: 'Burger Especial de Carne',  precio: 5000,  categoria: 'Burgers',    ingredientes: 'Carne, queso gouda, huevo, papas hilo, cebolla, tomate, lechuga + salsa' },
  { id: 'burger-super-carne',    nombre: 'Burger Super de Carne',     precio: 6000,  categoria: 'Burgers',    ingredientes: 'Proteína, huevo, queso gouda, cebolla morada, lechuga, tomate, tocino + salsas' },
  { id: 'burger-doble',          nombre: 'Burger Doble',              precio: 7500,  categoria: 'Burgers',    ingredientes: 'Doble proteína, doble queso cheddar, cebolla morada, pepinillo, tocino' },
  { id: 'burger-pelua',          nombre: 'Burger La Pelua',           precio: 8500,  categoria: 'Burgers',    ingredientes: 'Carne mechada, huevo, tocino ahumado, lechuga, tomate, cebolla morada, queso gouda' },
  { id: 'burger-triple',         nombre: 'Burger Triple',             precio: 9990,  categoria: 'Burgers',    ingredientes: 'Triple proteína, tocino ahumado, lechuga, tomate, cebolla morada, queso cheddar' },
  { id: 'burger-estrella-xl',    nombre: 'La Estrella XL',            precio: 7500,  categoria: 'Burgers',    ingredientes: '200g carne, lechuga, tomate, cebolla + salsas' },
  { id: 'burger-luna-xl',        nombre: 'La Luna XL',                precio: 7500,  categoria: 'Burgers',    ingredientes: '200g carne, tocineta, huevo, queso gouda, lechuga, tomate, cebolla morada' },
  { id: 'burger-casa-club-xl',   nombre: 'La Casa Club XL',           precio: 9500,  categoria: 'Burgers',    ingredientes: '200g carne, salsa de la casa, cebolla caramelizada, tocino, queso cheddar' },

  // ── PERROS ───────────────────────────────────────────────────
  { id: 'perro-luka',            nombre: 'Perro El de Luka',          precio: 1000,  categoria: 'Perros',     ingredientes: '15cm · salchicha, repollo, papas hilo, ketchup, mayo, mostaza' },
  { id: 'perro-callejero',       nombre: 'Perro El Callejero',        precio: 2500,  categoria: 'Perros',     ingredientes: '20cm · salchicha, repollo, papas hilo, queso gouda, mayo-ajo' },
  { id: 'perro-loco',            nombre: 'Perro El Loco',             precio: 3500,  categoria: 'Perros',     ingredientes: '22cm · salchicha, repollo, maíz, tocineta, papas hilo, queso gouda' },
  { id: 'perro-chileno',         nombre: 'Perro El Chileno',          precio: 3500,  categoria: 'Perros',     ingredientes: '22cm · repollo, tomate, aguacate, papas hilo, queso gouda' },
  { id: 'perro-americano',       nombre: 'Perro El Americano',        precio: 3990,  categoria: 'Perros',     ingredientes: '22cm · repollo, tocineta, queso cheddar derretido, papas hilo' },
  { id: 'perro-peluo',           nombre: 'Perro El Peluo',            precio: 3990,  categoria: 'Perros',     ingredientes: '22cm · carne mechada casera, repollo, tomate, papas hilo, queso gouda' },

  // ── COMPLETOS / SÁNDWICHS ────────────────────────────────────
  { id: 'as-normal',             nombre: 'As Normal',                 precio: 3500,  categoria: 'Completos' },
  { id: 'as-xl',                 nombre: 'As XL',                     precio: 6500,  categoria: 'Completos' },
  { id: 'italiano-normal',       nombre: 'Italiano Normal',           precio: 2500,  categoria: 'Completos' },
  { id: 'italiano-xl',           nombre: 'Italiano XL',               precio: 4500,  categoria: 'Completos' },
  { id: 'churrasco-italiano',    nombre: 'Churrasco Italiano',        precio: 5000,  categoria: 'Completos',  ingredientes: 'Carne, tomate, palta, mayo casera' },
  { id: 'churrasco-super',       nombre: 'Churrasco Super',           precio: 5500,  categoria: 'Completos',  ingredientes: 'Carne, tomate, palta, lechuga, queso, mayo casera' },
  { id: 'barros-luco',           nombre: 'Barros Luco',               precio: 5000,  categoria: 'Completos',  ingredientes: 'Carne y queso' },
  { id: 'churrasco-mechada',     nombre: 'Churrasco Mechada',         precio: 6000,  categoria: 'Completos',  ingredientes: 'Carne mechada, tomate, palta, mayo, queso' },
  { id: 'chacarero',             nombre: 'Chacarero',                 precio: 6000,  categoria: 'Completos',  ingredientes: 'Mayo, carne, tomate, poroto verde, ají verde' },

  // ── AREPAS ───────────────────────────────────────────────────
  { id: 'arepa-venezolana',      nombre: 'Arepa Venezolana (5 ingr)', precio: 3500,  categoria: 'Arepas',     ingredientes: 'Carne mechada · pollo · salchicha · jamón · pernil · perico · caraotas · queso gouda · reina pepida · huevo frito · mariscos · tajadas · choclo · queso llanero' },

  // ── CACHAPAS ─────────────────────────────────────────────────
  { id: 'cachapa-queso-llanero', nombre: 'Cachapa Queso Llanero',     precio: 6500,  categoria: 'Cachapas',   ingredientes: 'Queso rallado, mantequilla, natilla' },
  { id: 'cachapa-cochino',       nombre: 'Cachapa Cochino Frito',     precio: 8500,  categoria: 'Cachapas',   ingredientes: '250gr cochino, queso rallado, natilla' },
  { id: 'cachapa-queso-mano',    nombre: 'Cachapa Queso de Mano',     precio: 7500,  categoria: 'Cachapas',   ingredientes: '½kg queso de mano, mantequilla, natilla' },
  { id: 'cachapa-cochino-queso', nombre: 'Cachapa Cochino + Queso',   precio: 10000, categoria: 'Cachapas',   ingredientes: '½kg queso de mano, cochino, mantequilla, natilla' },

  // ── ARROZ CHINO ──────────────────────────────────────────────
  { id: 'arroz-salteado',        nombre: 'Arroz Salteado',            precio: 4500,  categoria: 'Arroz Chino', ingredientes: 'Pollo, jamón, diente de dragón, cebollín' },
  { id: 'pollo-arroz-papas',     nombre: 'Pollo + Arroz + Papas',     precio: 4990,  categoria: 'Arroz Chino', ingredientes: 'Pollo asado + arroz chino + papas fritas' },
  { id: 'arroz-cerdo-pollo',     nombre: 'Arroz Especial Cerdo-Pollo',precio: 8000,  categoria: 'Arroz Chino', ingredientes: 'Arroz salteado, pollo, cerdo, huevo, cebollín' },
  { id: 'arroz-cerdo-camaron',   nombre: 'Arroz Especial Cerdo-Camarón',precio:10000,categoria: 'Arroz Chino', ingredientes: 'Arroz salteado, camarón, cerdo, huevo, cebollín' },
  { id: 'arroz-la-felicitta',    nombre: 'Arroz La Felicitta',        precio: 12000, categoria: 'Arroz Chino', ingredientes: 'Jamón, pollo, cerdo, camarón, diente de dragón, huevo' },

  // ── PEPITOS ──────────────────────────────────────────────────
  { id: 'pepito-pollo',          nombre: 'Pepito Pollo 15cm',         precio: 7500,  categoria: 'Pepitos',    ingredientes: '200gr pollo, huevo, tocineta, queso gouda, lechuga, tomate' },
  { id: 'pepito-carne',          nombre: 'Pepito Carne 15cm',         precio: 8500,  categoria: 'Pepitos',    ingredientes: '200gr carne, huevo, tocineta, queso gouda, lechuga, tomate' },
  { id: 'pepito-mixto',          nombre: 'Pepito Mixto 15cm',         precio: 9500,  categoria: 'Pepitos',    ingredientes: '100gr pollo + 100gr carne + 100gr chorizo, queso gouda' },
  { id: 'pepito-bestia',         nombre: 'Pepito Mixto BESTIA 30cm',  precio: 14990, categoria: 'Pepitos',    ingredientes: 'Carne + pollo + chorizo + chuleta ahumada, queso gouda' },

  // ── PATACONES ────────────────────────────────────────────────
  { id: 'patacon-normal',        nombre: 'Patacón Normal',            precio: 7500,  categoria: 'Patacones',  ingredientes: 'Carne mechada o pollo, queso rallado, ensalada, salsas' },
  { id: 'patacon-especial',      nombre: 'Patacón Especial',          precio: 8500,  categoria: 'Patacones',  ingredientes: 'Carne mechada o pollo, jamón, tocineta, queso gauda' },
  { id: 'patacon-mixto-top',     nombre: 'Patacón Mixto TOP',         precio: 12000, categoria: 'Patacones',  ingredientes: 'Carne mechada y pollo, jamón, tocineta, queso gauda' },

  // ── PAPAS ─────────────────────────────────────────────────────
  { id: 'papas-normal',          nombre: 'Papas Fritas Normal',       precio: 3500,  categoria: 'Papas' },
  { id: 'papas-xl',              nombre: 'Papas Fritas XL',           precio: 6500,  categoria: 'Papas' },
  { id: 'bacon-cheddar',         nombre: 'Bacon & Cheddar',           precio: 5500,  categoria: 'Papas',      ingredientes: 'Tocino ahumado y queso cheddar' },
  { id: 'bacon-cheddar-xl',      nombre: 'Bacon & Cheddar XL',        precio: 9990,  categoria: 'Papas',      ingredientes: 'Tocino ahumado y queso cheddar (porción grande)' },
  { id: 'salchipapas-normal',    nombre: 'Salchipapas Normal',        precio: 4500,  categoria: 'Papas' },
  { id: 'salchipapas-xl',        nombre: 'Salchipapas XL',            precio: 7990,  categoria: 'Papas' },
  { id: 'nuggets-6',             nombre: 'Nuggets 6u',                precio: 4000,  categoria: 'Papas' },
  { id: 'nuggets-12',            nombre: 'Nuggets 12u',               precio: 7500,  categoria: 'Papas' },

  // ── EMPANADAS ────────────────────────────────────────────────
  { id: 'emp-mechada',           nombre: 'Empanada Carne Mechada',    precio: 3000,  categoria: 'Empanadas' },
  { id: 'emp-pollo',             nombre: 'Empanada Pollo',            precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-molida',            nombre: 'Empanada Molida',           precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-jamon-queso',       nombre: 'Empanada Jamón Queso',      precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-pabellon',          nombre: 'Empanada Pabellón',         precio: 3000,  categoria: 'Empanadas' },
  { id: 'emp-caraota-queso',     nombre: 'Empanada Caraota Queso',    precio: 2500,  categoria: 'Empanadas' },
  { id: 'emp-perico-queso',      nombre: 'Empanada Perico Queso Llanero', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-queso',             nombre: 'Empanada Queso',            precio: 2500,  categoria: 'Empanadas' },

  // ── TEQUEÑOS ─────────────────────────────────────────────────
  { id: 'tequeno-25-queso',      nombre: 'Tequeño 25cm Queso',        precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequeno-25-jamon',      nombre: 'Tequeño 25cm Jamón Queso',  precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequeno-25-guayaba',    nombre: 'Tequeño 25cm Guayaba/Queso',precio: 2500,  categoria: 'Tequeños' },
  { id: 'tequenos-x4',           nombre: 'Tequeños x4 (8cm)',         precio: 2600,  categoria: 'Tequeños' },
  { id: 'tequenos-x8',           nombre: 'Tequeños x8 (8cm)',         precio: 4900,  categoria: 'Tequeños' },
  { id: 'tequenos-x12',          nombre: 'Tequeños x12 (8cm)',        precio: 6900,  categoria: 'Tequeños' },

  // ── PASAPALOS ────────────────────────────────────────────────
  { id: 'mini-tequenos-50',      nombre: 'Mini Tequeños 50u',         precio: 13500, categoria: 'Pasapalos',  ingredientes: 'Full queso · cóctel 4–5cm · con salsas' },
  { id: 'mini-tequenos-100',     nombre: 'Mini Tequeños 100u',        precio: 24300, categoria: 'Pasapalos' },
  { id: 'mix-uno-50',            nombre: 'Mix Uno 50u',               precio: 14500, categoria: 'Pasapalos',  ingredientes: '25 tequeños · 25 pasteles' },
  { id: 'mix-dos-75',            nombre: 'Mix Dos 75u',               precio: 23900, categoria: 'Pasapalos',  ingredientes: '25 tequeños · 25 pasteles · 25 bolitas' },
  { id: 'mix-tres-100',          nombre: 'Mix Tres 100u',             precio: 26500, categoria: 'Pasapalos',  ingredientes: '50 tequeños · 50 pasteles' },
  { id: 'mix-cuatro-100',        nombre: 'Mix Cuatro 100u',           precio: 31900, categoria: 'Pasapalos',  ingredientes: 'Tequeños · pasteles · bolitas · pizzas' },
  { id: 'mix-cinco-100',         nombre: 'Mix Cinco 100u',            precio: 32900, categoria: 'Pasapalos',  ingredientes: 'Tequeños · pasteles · bolitas · empanadas' },
  { id: 'mix-full-200',          nombre: 'Mix Full 200u',             precio: 63900, categoria: 'Pasapalos',  ingredientes: 'Tequeños · pasteles · bolitas · pizzas · empanadas' },

  // ── CHURROS ──────────────────────────────────────────────────
  { id: 'churros-8-azucar',      nombre: 'Churros x8 Azúcar Flor',    precio: 4500,  categoria: 'Churros' },
  { id: 'churros-14-azucar',     nombre: 'Churros x14 Azúcar Flor',   precio: 6500,  categoria: 'Churros' },
  { id: 'churros-8-salsas',      nombre: 'Churros x8 + 2 Salsas',     precio: 5500,  categoria: 'Churros',    ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },
  { id: 'churros-14-salsas',     nombre: 'Churros x14 + 2 Salsas',    precio: 6500,  categoria: 'Churros',    ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },
  { id: 'churros-20-salsas',     nombre: 'Churros x20 + 2 Salsas',    precio: 7500,  categoria: 'Churros',    ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },

  // ── BEBIDAS ──────────────────────────────────────────────────
  { id: 'coca-500',              nombre: 'Coca-Cola 500cc',           precio: 1500,  categoria: 'Bebidas' },
  { id: 'coca-lata',             nombre: 'Coca-Cola Lata',            precio: 1300,  categoria: 'Bebidas' },
  { id: 'sprite-500',            nombre: 'Sprite 500cc',              precio: 1500,  categoria: 'Bebidas' },
  { id: 'fanta-500',             nombre: 'Fanta 500cc',               precio: 1500,  categoria: 'Bebidas' },
  { id: 'bebida-15l',            nombre: 'Bebida 1.5L',               precio: 2500,  categoria: 'Bebidas',    ingredientes: 'Coca-Cola, Sprite o Fanta' },
  { id: 'kr-personal',           nombre: 'KR Personal',               precio: 1000,  categoria: 'Bebidas' },
  { id: 'jugo-naranja',          nombre: 'Jugo Naranja',              precio: 3000,  categoria: 'Bebidas',    ingredientes: 'Exprimido natural' },
  { id: 'jugo-mango',            nombre: 'Jugo Mango',                precio: 3000,  categoria: 'Bebidas',    ingredientes: 'Fruta natural licuada' },
  { id: 'jugo-pina',             nombre: 'Jugo Piña',                 precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugo-maracuya',         nombre: 'Jugo Maracuyá',             precio: 3000,  categoria: 'Bebidas' },
  { id: 'jugos-kris',            nombre: 'Jugos Kris',                precio: 1000,  categoria: 'Bebidas' },
  { id: 'agua-sin-gas',          nombre: 'Agua sin gas 500cc',        precio: 1300,  categoria: 'Bebidas' },
  { id: 'agua-con-gas',          nombre: 'Agua con gas 500cc',        precio: 1300,  categoria: 'Bebidas' },
  { id: 'cafe-americano',        nombre: 'Café Americano',            precio: 1500,  categoria: 'Bebidas' },
  { id: 'cafe-leche',            nombre: 'Café con Leche',            precio: 2000,  categoria: 'Bebidas' },
  { id: 'te-infusion',           nombre: 'Té / Infusión',             precio: 1500,  categoria: 'Bebidas',    ingredientes: 'Menta, manzanilla, canela' },
  { id: 'chocolate-caliente',    nombre: 'Chocolate Caliente',        precio: 2500,  categoria: 'Bebidas' },
]

export const CATEGORIAS = Array.from(new Set(MENU.map(p => p.categoria)))

export const MESAS = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Mesa 7', 'Mesa 8', 'Barra', 'Para llevar', 'Delivery'
]

export const METODOS_PAGO = ['Efectivo', 'Débito', 'Transferencia', 'Crédito', 'Cortesía']

export type TipoServicio = 'Servir en mesa' | 'Para llevar' | 'Delivery'
