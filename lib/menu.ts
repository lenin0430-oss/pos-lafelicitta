import { supabase } from './supabase'

export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria: string
  categoria_id?: string | null
  categoria_orden?: number | null
  ingredientes?: string
  descripcion?: string | null
  imagen_url?: string | null
  disponible?: boolean | null
  destacado?: boolean | null
}

export const MENU: Producto[] = [
  { id: 'envase-para-llevar', nombre: 'Envase para llevar', precio: 300, categoria: 'Extras', ingredientes: 'Envase para pedido para llevar' },
  // ── COMBOS A LA BRASA ────────────────────────────────────────
  { id: 'cuarto-pollo-brasa', nombre: '1/4 Pollo a la Brasa Solo', precio: 4000, categoria: 'Combos a la Brasa', ingredientes: 'Pechuga o truto' },
  { id: 'medio-pollo-brasa-solo', nombre: '1/2 Pollo a la Brasa Solo', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: 'Medio pollo a la brasa solo' },
  { id: 'pollo-entero-brasa', nombre: '1 Pollo a la Brasa Solo', precio: 13000, categoria: 'Combos a la Brasa', ingredientes: 'Pollo entero a la brasa solo' },
  { id: 'combo-clasico-brasa', nombre: 'Combo Clásico Brasa', precio: 23000, categoria: 'Combos a la Brasa', ingredientes: '1 pollo a la brasa entero + papas fritas + ensalada + bebida 1.5 Lt.' },
  { id: 'combo-especial-brasa', nombre: 'Combo Especial Brasa', precio: 24000, categoria: 'Combos a la Brasa', ingredientes: '1 pollo a la brasa entero + arroz chino o arroz blanco + papas fritas + ensalada + bebida 1.5 Lt.' },
  { id: 'combo-full-familiar-brasa', nombre: 'Combo Full Familiar Brasa', precio: 28000, categoria: 'Combos a la Brasa', ingredientes: '1 pollo a la brasa entero + papas fritas + ensalada + arroz chino o arroz blanco + bebida 1.5 Lt.' },
  { id: 'medio-pollo-brasa', nombre: '1/2 Pollo Brasa', precio: 16000, categoria: 'Combos a la Brasa', ingredientes: '1/2 pollo a la brasa + papas fritas + ensalada' },
  { id: 'medio-pollo-brasa-especial', nombre: '1/2 Pollo Brasa Especial', precio: 17000, categoria: 'Combos a la Brasa', ingredientes: '1/2 pollo a la brasa + arroz chino o arroz blanco + papas fritas + ensalada' },
  { id: 'personal-brasa-papas', nombre: 'Personal Brasa + Papas', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + papas fritas' },
  { id: 'personal-brasa-arroz', nombre: 'Personal Brasa + Arroz', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + arroz chino o arroz blanco' },
  { id: 'personal-brasa-ensalada', nombre: 'Personal Brasa + Ensalada', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + ensalada' },
  { id: 'personal-brasa-arroz-ensalada', nombre: 'Personal Brasa + Arroz + Ensalada', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + arroz chino o arroz blanco + ensalada' },
  { id: 'personal-brasa-papas-arroz', nombre: 'Personal Brasa + Papas + Arroz', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + papas fritas + arroz chino o arroz blanco' },
  { id: 'personal-brasa-papas-ensalada', nombre: 'Personal Brasa + Papas + Ensalada', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + papas fritas + ensalada' },
  { id: 'personal-brasa-completo', nombre: 'Personal Brasa Completo', precio: 7500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + papas fritas + arroz chino o arroz blanco + ensalada' },
  { id: 'personal-brasa-fideos', nombre: 'Personal Brasa + Fideos', precio: 7500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + fideos' },
  { id: 'personal-brasa-papas-fideos', nombre: 'Personal Brasa + Papas + Fideos', precio: 7500, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo a la brasa + papas fritas + fideos + ensalada' },
  { id: 'combo-broaster-crunch', nombre: 'Combo Broaster Crunch', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: '1/4 pollo broaster + papas fritas + arroz chino + ensalada' },

  // ── BURGERS ──────────────────────────────────────────────────
  { id: 'burger-felicitta', nombre: 'La Felicitta', precio: 3500, categoria: 'Burgers', ingredientes: 'Carne de la casa, papas hilo, tomate, lechuga, ketchup, mostaza, mayo' },
  { id: 'burger-especial-carne', nombre: 'Especial de Carne', precio: 5000, categoria: 'Burgers', ingredientes: 'Carne, queso gouda, huevo, papas hilo, cebolla, tomate, lechuga + salsa' },
  { id: 'burger-super-carne', nombre: 'Super de Carne', precio: 6000, categoria: 'Burgers', ingredientes: 'Proteína, huevo, queso gouda, cebolla morada, lechuga, tomate, tocino + salsas' },
  { id: 'burger-doble', nombre: 'Doble', precio: 7500, categoria: 'Burgers', ingredientes: 'Doble proteína, doble queso cheddar, cebolla morada, pepinillo, tocino' },
  { id: 'burger-pelua', nombre: 'La Pelua', precio: 8500, categoria: 'Burgers', ingredientes: 'Carne mechada, huevo, tocino ahumado, lechuga, tomate, cebolla morada, queso gouda' },
  { id: 'burger-triple', nombre: 'Triple', precio: 9990, categoria: 'Burgers', ingredientes: 'Triple proteína, tocino ahumado, lechuga, tomate, cebolla morada, queso cheddar' },
  { id: 'burger-estrella-xl', nombre: 'La Estrella XL', precio: 7500, categoria: 'Burgers', ingredientes: '200g carne, lechuga, tomate, cebolla + salsas' },
  { id: 'burger-luna-xl', nombre: 'La Luna XL', precio: 7500, categoria: 'Burgers', ingredientes: '200g carne, tocineta, huevo, queso gouda, lechuga, tomate, cebolla morada' },
  { id: 'burger-casa-club-xl', nombre: 'La Casa Club XL', precio: 9500, categoria: 'Burgers', ingredientes: '200g carne, salsa de la casa, cebolla caramelizada, tocino, queso cheddar' },

  // ── PERROS ───────────────────────────────────────────────────
  { id: 'perro-luka', nombre: 'El de Luka', precio: 1000, categoria: 'Perros', ingredientes: '15cm · salchicha, repollo, papas hilo, ketchup, mayo, mostaza' },
  { id: 'perro-callejero', nombre: 'El Callejero', precio: 2500, categoria: 'Perros', ingredientes: '20cm · salchicha, repollo, papas hilo, queso gouda, mayo-ajo' },
  { id: 'perro-loco', nombre: 'El Perro Loco', precio: 3500, categoria: 'Perros', ingredientes: '22cm · salchicha, repollo, maíz, tocineta, papas hilo, queso gouda' },
  { id: 'perro-chileno', nombre: 'El Chileno', precio: 3500, categoria: 'Perros', ingredientes: '22cm · repollo, tomate, aguacate, papas hilo, queso gouda' },
  { id: 'perro-americano', nombre: 'El Americano', precio: 3990, categoria: 'Perros', ingredientes: '22cm · repollo, tocineta, queso cheddar derretido, papas hilo' },
  { id: 'perro-peluo', nombre: 'El Peluo', precio: 3990, categoria: 'Perros', ingredientes: '22cm · carne mechada casera, repollo, tomate, papas hilo, queso gouda' },

  // ── COMPLETOS Y SÁNDWICHS ────────────────────────────────────
  { id: 'as-normal', nombre: 'As — Normal', precio: 3500, categoria: 'Completos' },
  { id: 'as-xl', nombre: 'As — XL', precio: 6500, categoria: 'Completos' },
  { id: 'italiano-normal', nombre: 'Italiano — Normal', precio: 2500, categoria: 'Completos' },
  { id: 'italiano-xl', nombre: 'Italiano — XL', precio: 4500, categoria: 'Completos' },
  { id: 'churrasco-italiano', nombre: 'Churrasco Italiano', precio: 5000, categoria: 'Completos', ingredientes: 'Carne, tomate, palta, mayo casera' },
  { id: 'churrasco-super', nombre: 'Churrasco Super', precio: 5500, categoria: 'Completos', ingredientes: 'Carne, tomate, palta, lechuga, queso, mayo casera' },
  { id: 'barros-luco', nombre: 'Barros Luco', precio: 5000, categoria: 'Completos', ingredientes: 'Carne y queso' },
  { id: 'churrasco-mechada', nombre: 'Churrasco Mechada', precio: 6000, categoria: 'Completos', ingredientes: 'Carne mechada, tomate, palta, mayo, queso' },
  { id: 'chacarero', nombre: 'Chacarero', precio: 6000, categoria: 'Completos', ingredientes: 'Mayo, carne, tomate, poroto verde, ají verde' },

  // ── AREPAS ───────────────────────────────────────────────────
  { id: 'arepa-a-tu-gusto', nombre: 'Arepa a tu gusto — 5 ingredientes', precio: 3500, categoria: 'Arepas', ingredientes: 'Carne mechada · pollo · salchicha · jamón · pernil · perico · caraotas · queso gouda · reina pepida · huevo frito · mariscos · tajadas · choclo · queso llanero' },

  // ── CACHAPAS ─────────────────────────────────────────────────
  { id: 'cachapa-queso-llanero', nombre: 'Con Queso Llanero', precio: 6500, categoria: 'Cachapas', ingredientes: 'Queso rallado, mantequilla, natilla' },
  { id: 'cachapa-cochino-frito', nombre: 'Cochino Frito', precio: 8500, categoria: 'Cachapas', ingredientes: '250gr cochino, queso rallado, natilla' },
  { id: 'cachapa-queso-mano', nombre: 'Queso de Mano', precio: 7500, categoria: 'Cachapas', ingredientes: '½kg queso de mano, mantequilla, natilla' },
  { id: 'cachapa-cochino-queso', nombre: 'Cochino + Queso', precio: 10000, categoria: 'Cachapas', ingredientes: '½kg queso de mano, cochino, mantequilla, natilla' },

  // ── ARROZ CHINO ──────────────────────────────────────────────
  { id: 'arroz-salteado', nombre: 'Arroz Salteado', precio: 4500, categoria: 'Arroz chino', ingredientes: 'Pollo, jamón, diente de dragón, cebollín' },
  { id: 'pollo-arroz-papas', nombre: 'Pollo + Arroz + Papas', precio: 4990, categoria: 'Arroz chino', ingredientes: 'Pollo asado + arroz chino + papas fritas' },
  { id: 'arroz-cerdo-pollo', nombre: 'Especial Cerdo–Pollo', precio: 8000, categoria: 'Arroz chino', ingredientes: 'Arroz salteado, pollo, cerdo, huevo, cebollín' },
  { id: 'arroz-cerdo-camaron', nombre: 'Especial Cerdo–Camarón', precio: 10000, categoria: 'Arroz chino', ingredientes: 'Arroz salteado, camarón, cerdo, huevo, cebollín' },
  { id: 'arroz-la-felicitta', nombre: 'Arroz La Felicitta', precio: 12000, categoria: 'Arroz chino', ingredientes: 'Jamón, pollo, cerdo, camarón, diente de dragón, huevo' },

  // ── PEPITOS ──────────────────────────────────────────────────
  { id: 'pepito-pollo-15', nombre: 'Pepito Pollo 15cm', precio: 7500, categoria: 'Pepitos', ingredientes: '200gr pollo, huevo, tocineta, queso gouda, lechuga, tomate' },
  { id: 'pepito-carne-15', nombre: 'Pepito Carne 15cm', precio: 8500, categoria: 'Pepitos', ingredientes: '200gr carne, huevo, tocineta, queso gouda, lechuga, tomate' },
  { id: 'pepito-mixto-15', nombre: 'Pepito Mixto 15cm', precio: 9500, categoria: 'Pepitos', ingredientes: '100gr pollo + 100gr carne + 100gr chorizo, queso gouda' },
  { id: 'pepito-mixto-bestia', nombre: 'Pepito Mixto BESTIA', precio: 14990, categoria: 'Pepitos', ingredientes: 'Carne + pollo + chorizo + chuleta ahumada, queso gouda' },

  // ── PATACONES ────────────────────────────────────────────────
  { id: 'patacon-normal', nombre: 'Normal', precio: 7500, categoria: 'Patacones', ingredientes: 'Carne mechada o pollo, queso rallado, ensalada, salsas' },
  { id: 'patacon-especial', nombre: 'Especial', precio: 8500, categoria: 'Patacones', ingredientes: 'Carne mechada o pollo, jamón, tocineta, queso gauda' },
  { id: 'patacon-mixto-top', nombre: 'Mixto TOP', precio: 12000, categoria: 'Patacones', ingredientes: 'Carne mechada y pollo, jamón, tocineta, queso gauda' },

  // ── PAPAS Y ACOMPAÑAMIENTOS ──────────────────────────────────
  { id: 'papas-normal', nombre: 'Papas Normal', precio: 3500, categoria: 'Papas' },
  { id: 'papas-xl', nombre: 'Papas XL', precio: 6500, categoria: 'Papas' },
  { id: 'bacon-cheddar', nombre: 'Bacon & Cheddar', precio: 5500, categoria: 'Papas', ingredientes: 'Tocino ahumado y queso cheddar' },
  { id: 'bacon-cheddar-xl', nombre: 'Bacon & Cheddar XL', precio: 9990, categoria: 'Papas', ingredientes: 'Tocino ahumado y queso cheddar' },
  { id: 'salchipapas-normal', nombre: 'Salchipapas Normal', precio: 4500, categoria: 'Papas' },
  { id: 'salchipapas-xl', nombre: 'Salchipapas XL', precio: 7990, categoria: 'Papas' },
  { id: 'nuggets-6', nombre: 'Nuggets 6 u.', precio: 4000, categoria: 'Papas' },
  { id: 'nuggets-12', nombre: 'Nuggets 12 u.', precio: 7500, categoria: 'Papas' },

  // ── EMPANADAS ────────────────────────────────────────────────
  { id: 'emp-carne-mechada', nombre: 'Carne Mechada', precio: 3000, categoria: 'Empanadas' },
  { id: 'emp-pollo', nombre: 'Pollo', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-molida', nombre: 'Molida', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-jamon-queso', nombre: 'Jamón Queso', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-pabellon', nombre: 'Pabellón', precio: 3000, categoria: 'Empanadas' },
  { id: 'emp-caraota-queso', nombre: 'Caraota Queso', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-perico-queso-llanero', nombre: 'Perico Queso Llanero', precio: 2500, categoria: 'Empanadas' },
  { id: 'emp-queso', nombre: 'Queso', precio: 2500, categoria: 'Empanadas' },

  // ── TEQUEÑOS ─────────────────────────────────────────────────
  { id: 'tequeno-25-queso', nombre: 'Tequeños 25cm — Queso', precio: 2500, categoria: 'Tequeños' },
  { id: 'tequeno-25-jamon-queso', nombre: 'Tequeños 25cm — Jamón Queso', precio: 2500, categoria: 'Tequeños' },
  { id: 'tequeno-25-guayaba-queso', nombre: 'Tequeños 25cm — Guayaba / Queso', precio: 2500, categoria: 'Tequeños' },
  { id: 'tequenos-8cm-4', nombre: 'Tequeños 8cm — 4 unidades', precio: 2600, categoria: 'Tequeños' },
  { id: 'tequenos-8cm-8', nombre: 'Tequeños 8cm — 8 unidades', precio: 4900, categoria: 'Tequeños' },
  { id: 'tequenos-8cm-12', nombre: 'Tequeños 8cm — 12 unidades', precio: 6900, categoria: 'Tequeños' },

  // ── PASAPALOS ────────────────────────────────────────────────
  { id: 'mini-tequenos-50', nombre: 'Mini Tequeños 50 u.', precio: 13500, categoria: 'Pasapalos', ingredientes: 'Full queso · cóctel 4–5cm · con salsas' },
  { id: 'mini-tequenos-100', nombre: 'Mini Tequeños 100 u.', precio: 24300, categoria: 'Pasapalos' },
  { id: 'mix-uno-50', nombre: 'Mix Uno — 50 u.', precio: 14500, categoria: 'Pasapalos', ingredientes: '25 tequeños · 25 pasteles' },
  { id: 'mix-dos-75', nombre: 'Mix Dos — 75 u.', precio: 23900, categoria: 'Pasapalos', ingredientes: '25 tequeños · 25 pasteles · 25 bolitas' },
  { id: 'mix-tres-100', nombre: 'Mix Tres — 100 u.', precio: 26500, categoria: 'Pasapalos', ingredientes: '50 tequeños · 50 pasteles' },
  { id: 'mix-cuatro-100', nombre: 'Mix Cuatro — 100 u.', precio: 31900, categoria: 'Pasapalos', ingredientes: 'Tequeños · pasteles · bolitas · pizzas' },
  { id: 'mix-cinco-100', nombre: 'Mix Cinco — 100 u.', precio: 32900, categoria: 'Pasapalos', ingredientes: 'Tequeños · pasteles · bolitas · empanadas' },
  { id: 'mix-full-200', nombre: 'Mix Full — 200 u.', precio: 63900, categoria: 'Pasapalos', ingredientes: 'Tequeños · pasteles · bolitas · pizzas · empanadas' },

  // ── CHURROS ──────────────────────────────────────────────────
  { id: 'churros-8-azucar-flor', nombre: '8 Churros — Azúcar Flor', precio: 4500, categoria: 'Churros' },
  { id: 'churros-14-azucar-flor', nombre: '14 Churros — Azúcar Flor', precio: 6500, categoria: 'Churros' },
  { id: 'churros-8-salsas', nombre: '8 Churros + 2 Salsas', precio: 5500, categoria: 'Churros', ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },
  { id: 'churros-14-salsas', nombre: '14 Churros + 2 Salsas', precio: 6500, categoria: 'Churros', ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },
  { id: 'churros-20-salsas', nombre: '20 Churros + 2 Salsas', precio: 7500, categoria: 'Churros', ingredientes: 'Manjar · Chocolate · L. Condensada · Azúcar' },


  // ── PANADERÍA ─────────────────────────────────────────────────
  { id: 'pan-completon', nombre: 'Completón', precio: 400, categoria: 'Panadería', ingredientes: 'Pan para completón' },
  { id: 'pan-completo', nombre: 'Completo', precio: 320, categoria: 'Panadería', ingredientes: 'Pan para completo' },
  { id: 'pan-hot-dog', nombre: 'Hot Dog', precio: 250, categoria: 'Panadería', ingredientes: 'Pan hot dog clásico' },
  { id: 'pan-perro-caliente', nombre: 'Perro Caliente', precio: 280, categoria: 'Panadería', ingredientes: 'Pan para perro caliente' },
  { id: 'pan-churrasco-grande', nombre: 'Churrasco Grande', precio: 660, categoria: 'Panadería', ingredientes: 'Pan para churrasco grande' },
  { id: 'pan-churrasco-normal', nombre: 'Churrasco Normal', precio: 400, categoria: 'Panadería', ingredientes: 'Pan para churrasco normal' },
  { id: 'pan-churrasco-pequeno', nombre: 'Churrasco Pequeño', precio: 350, categoria: 'Panadería', ingredientes: 'Pan para churrasco pequeño' },
  { id: 'pan-hot-dog-brioche', nombre: 'Hot Dog Brioche', precio: 400, categoria: 'Panadería', ingredientes: 'Pan brioche para hot dog' },
  { id: 'pan-hamburguesa-brioche', nombre: 'Hamburguesa Brioche', precio: 400, categoria: 'Panadería', ingredientes: 'Pan brioche para hamburguesa' },
  { id: 'pan-pepito-xl', nombre: 'Pan de Pepito XL', precio: 800, categoria: 'Panadería', ingredientes: 'Pan especial para pepito XL' },
  { id: 'pan-pinita', nombre: 'Pan Piñita', precio: 2500, categoria: 'Panadería', ingredientes: 'Pan fresco de la casa' },
  { id: 'pan-guayaba', nombre: 'Pan de Guayaba', precio: 3000, categoria: 'Panadería', ingredientes: 'Pan dulce con guayaba' },

  // ── CHICHARRÓN ────────────────────────────────────────────────
  { id: 'chicharron-pequeno', nombre: 'Chicharrón Pequeño', precio: 1000, categoria: 'Chicharrón', ingredientes: 'Porción pequeña' },
  { id: 'chicharron-mediano', nombre: 'Chicharrón Mediano', precio: 2000, categoria: 'Chicharrón', ingredientes: 'Porción mediana' },
  { id: 'chicharron-grande', nombre: 'Chicharrón Grande', precio: 2500, categoria: 'Chicharrón', ingredientes: 'Porción grande' },

  // ── BEBIDAS ──────────────────────────────────────────────────
  { id: 'coca-500', nombre: 'Coca-Cola 500cc', precio: 1500, categoria: 'Bebidas' },
  { id: 'coca-lata', nombre: 'Coca-Cola Lata', precio: 1300, categoria: 'Bebidas' },
  { id: 'sprite-500', nombre: 'Sprite 500cc', precio: 1500, categoria: 'Bebidas' },
  { id: 'fanta-500', nombre: 'Fanta 500cc', precio: 1500, categoria: 'Bebidas' },
  { id: 'bebida-15l', nombre: 'Bebida 1.5L', precio: 2500, categoria: 'Bebidas', ingredientes: 'Coca-Cola, Sprite o Fanta' },
  { id: 'kr-personal', nombre: 'KR Personal', precio: 1000, categoria: 'Bebidas' },
  { id: 'jugo-naranja', nombre: 'Jugo Naranja', precio: 3000, categoria: 'Bebidas', ingredientes: 'Exprimido natural' },
  { id: 'jugo-mango', nombre: 'Jugo Mango', precio: 3000, categoria: 'Bebidas', ingredientes: 'Fruta natural licuada' },
  { id: 'jugo-pina', nombre: 'Jugo Piña', precio: 3000, categoria: 'Bebidas' },
  { id: 'jugo-maracuya', nombre: 'Jugo Maracuyá', precio: 3000, categoria: 'Bebidas' },
  { id: 'jugos-kris', nombre: 'Jugos Kris', precio: 1000, categoria: 'Bebidas' },
  { id: 'agua-sin-gas', nombre: 'Agua sin gas 500cc', precio: 1300, categoria: 'Bebidas' },
  { id: 'agua-con-gas', nombre: 'Agua con gas 500cc', precio: 1300, categoria: 'Bebidas' },
  { id: 'cafe-americano', nombre: 'Café Americano', precio: 1500, categoria: 'Bebidas' },
  { id: 'cafe-leche', nombre: 'Café con Leche', precio: 2000, categoria: 'Bebidas' },
  { id: 'te-infusion', nombre: 'Té / Infusión', precio: 1500, categoria: 'Bebidas', ingredientes: 'Menta, manzanilla, canela' },
  { id: 'chocolate-caliente', nombre: 'Chocolate caliente', precio: 2500, categoria: 'Bebidas' },
]

export const CATEGORIAS = Array.from(new Set(MENU.map(p => p.categoria)))

const CATEGORIA_FALLBACK_POR_NOMBRE = new Map(
  MENU.map(producto => [normalizarTexto(producto.nombre), producto.categoria])
)

export const MESAS = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Mesa 7', 'Mesa 8', 'Barra', 'Para llevar', 'Delivery'
]

const MESAS_DEFAULT_RESTAURANTE = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Para llevar', 'Delivery'
]

export const METODOS_PAGO = ['Efectivo', 'Débito', 'Transferencia', 'Crédito', 'Cortesía']

export type TipoServicio = 'Servir en mesa' | 'Para llevar' | 'Delivery'

interface EmpresaCatalogo {
  id: string
  nombre: string
  slug?: string | null
}

interface CategoriaDb {
  id: string
  nombre: string
  orden: number | null
  activo?: boolean | null
  activa?: boolean | null
}

interface MesaDb {
  id: string
  nombre: string
  numero: number | null
  activo?: boolean | null
  activa?: boolean | null
}

interface ProductoDb {
  id: string
  nombre: string
  precio: number
  descripcion: string | null
  imagen_url: string | null
  disponible: boolean | null
  destacado: boolean | null
  categoria_id: string | null
  categorias?: CategoriaDb | CategoriaDb[] | null
}

export async function cargarDatosEmpresa(empresaIdOSlug: string): Promise<{
  menu: Producto[]
  categorias: string[]
  mesas: string[]
  metodosPago: string[]
}> {
  const empresa = await getEmpresaCatalogo(empresaIdOSlug)

  if (!empresa) {
    return {
      menu: MENU,
      categorias: CATEGORIAS,
      mesas: MESAS,
      metodosPago: METODOS_PAGO,
    }
  }

  const [menu, categorias, mesas, metodosPago] = await Promise.all([
    getMenuEmpresa(empresa.id),
    getCategoriasEmpresa(empresa.id),
    getMesasEmpresa(empresa.id),
    getMetodosPagoEmpresa(empresa.id),
  ])

  const esLaFelicitta = normalizarTexto(empresa.nombre).includes('felicitta')
  const menuFinal = menu.length > 0 ? menu : esLaFelicitta ? MENU : []
  const categoriasDesdeMenu = Array.from(new Set(menuFinal.map(producto => producto.categoria).filter(categoria => !esCategoriaSinCategoria(categoria))))
  const categoriasBase = categorias.filter(categoria => !esCategoriaSinCategoria(categoria))
  const categoriasFinal = categoriasBase.length > 0
    ? unirCategorias(categoriasBase, categoriasDesdeMenu)
    : esLaFelicitta ? CATEGORIAS : categoriasDesdeMenu

  return {
    menu: menuFinal,
    categorias: categoriasFinal,
    mesas: mesas.length > 0 ? mesas : esLaFelicitta ? MESAS : MESAS_DEFAULT_RESTAURANTE,
    metodosPago: metodosPago.length > 0 ? metodosPago : METODOS_PAGO,
  }
}

export async function getMenu(empresaIdOSlug: string): Promise<Producto[]> {
  const empresa = await getEmpresaCatalogo(empresaIdOSlug)
  if (!empresa) return MENU

  const menu = await getMenuEmpresa(empresa.id)
  return menu.length > 0 ? menu : normalizarTexto(empresa.nombre) === 'la felicitta' ? MENU : []
}

export async function getCategorias(empresaIdOSlug: string): Promise<string[]> {
  const empresa = await getEmpresaCatalogo(empresaIdOSlug)
  if (!empresa) return CATEGORIAS

  const categorias = await getCategoriasEmpresa(empresa.id)
  return categorias.length > 0 ? categorias : normalizarTexto(empresa.nombre) === 'la felicitta' ? CATEGORIAS : []
}

export async function getMesas(empresaIdOSlug: string): Promise<string[]> {
  const empresa = await getEmpresaCatalogo(empresaIdOSlug)
  if (!empresa) return MESAS

  const mesas = await getMesasEmpresa(empresa.id)
  return mesas.length > 0
    ? mesas
    : normalizarTexto(empresa.nombre) === 'la felicitta'
      ? MESAS
      : MESAS_DEFAULT_RESTAURANTE
}

async function getEmpresaCatalogo(empresaIdOSlug: string): Promise<EmpresaCatalogo | null> {
  const valor = empresaIdOSlug.trim()
  const columna = esUuid(valor) ? 'id' : 'slug'

  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, slug')
    .eq(columna, valor)
    .maybeSingle()

  if (error || !data) return null
  return data as EmpresaCatalogo
}

async function getMenuEmpresa(empresaId: string): Promise<Producto[]> {
  const [productosResult, categorias] = await Promise.all([
    supabase
      .from('productos')
      .select(`
        id,
        nombre,
        precio,
        descripcion,
        imagen_url,
        disponible,
        destacado,
        categoria_id,
        categorias (
          id,
          nombre,
          orden,
          activo,
          activa
        )
      `)
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true }),
    getCategoriasDetalleEmpresa(empresaId),
  ])

  const { data, error } = productosResult
  if (error || !data) return []

  const categoriasPorId = new Map(categorias.map(categoria => [categoria.id, categoria]))

  return (data as ProductoDb[])
    .filter(producto => producto.disponible !== false)
    .map(producto => normalizarProductoDb({
      ...producto,
      categorias: producto.categoria_id ? categoriasPorId.get(producto.categoria_id) || null : null,
    }))
    .sort((a, b) => {
      const ordenCat = (a.categoria_orden ?? 999) - (b.categoria_orden ?? 999)
      return ordenCat !== 0 ? ordenCat : a.nombre.localeCompare(b.nombre, 'es')
    })
}

async function getCategoriasDetalleEmpresa(empresaId: string): Promise<CategoriaDb[]> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, orden, activo, activa')
    .eq('empresa_id', empresaId)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })

  if (error || !data) return []

  return (data as CategoriaDb[])
    .filter(categoria => categoria.activo !== false && categoria.activa !== false)
}

async function getCategoriasEmpresa(empresaId: string): Promise<string[]> {
  const categorias = await getCategoriasDetalleEmpresa(empresaId)
  return categorias.map(categoria => categoria.nombre)
}

async function getMesasEmpresa(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('mesas')
    .select('id, nombre, numero, activo, activa')
    .eq('empresa_id', empresaId)
    .order('numero', { ascending: true })
    .order('nombre', { ascending: true })

  if (error || !data) return []

  return (data as MesaDb[])
    .filter(mesa => mesa.activo !== false && mesa.activa !== false)
    .map(mesa => mesa.nombre)
}

async function getMetodosPagoEmpresa(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('configuracion_empresa')
    .select('metodos_pago')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (error || !data?.metodos_pago) return METODOS_PAGO
  return data.metodos_pago as string[]
}

function normalizarProductoDb(producto: ProductoDb): Producto {
  const categoria = Array.isArray(producto.categorias)
    ? producto.categorias[0]
    : producto.categorias
  const categoriaFallback = inferirCategoriaProducto(producto.nombre)
  const categoriaDbNombre = categoria?.nombre || ''
  const usarCategoriaDb = !!categoriaDbNombre && !esCategoriaSinCategoria(categoriaDbNombre)

  return {
    id: producto.id,
    nombre: producto.nombre,
    precio: producto.precio,
    categoria: usarCategoriaDb ? categoriaDbNombre : categoriaFallback || 'Sin categoria',
    categoria_id: producto.categoria_id,
    categoria_orden: usarCategoriaDb ? categoria?.orden ?? null : ordenCategoria(categoriaFallback),
    ingredientes: producto.descripcion || undefined,
    descripcion: producto.descripcion,
    imagen_url: producto.imagen_url,
    disponible: producto.disponible,
    destacado: producto.destacado,
  }
}

function esUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}

function inferirCategoriaProducto(nombre: string) {
  const clave = normalizarTexto(nombre)
  const categoriaExacta = CATEGORIA_FALLBACK_POR_NOMBRE.get(clave)
  if (categoriaExacta) return categoriaExacta

  if (clave.includes('pollo') && (clave.includes('brasa') || clave.includes('broaster'))) return 'Combos a la Brasa'
  if (clave.includes('hamburguesa') || clave.includes('burger') || clave.includes('chuleta') || clave.includes('mechada') || clave.includes('club house')) return 'Burgers'
  if (clave.includes('perro')) return 'Perros'
  if (clave.includes('churrasco') || clave.includes('barros') || clave.includes('chacarero') || clave.startsWith('as ') || clave.includes('italiano')) return 'Completos'
  if (clave === 'has' || clave === 'hass' || clave.includes('pizzarola')) return 'Completos'
  if (clave.includes('arepa')) return 'Arepas'
  if (clave.includes('cachapa')) return 'Cachapas'
  if (clave.includes('arroz')) return 'Arroz chino'
  if (clave.includes('pepito')) return 'Pepitos'
  if (clave.includes('patacon')) return 'Patacones'
  if (clave.includes('papa') || clave.includes('bacon') || clave.includes('salchipapa') || clave.includes('nugget')) return 'Papas'
  if (clave.includes('empanada')) return 'Empanadas'
  if (clave.includes('tequeno')) return 'Tequeños'
  if (clave.includes('pasapalo') || clave.includes('mix ') || clave.includes('mini ')) return 'Pasapalos'
  if (clave.includes('churro')) return 'Churros'
  if (clave.includes('pan') || clave.includes('completon') || clave.includes('hot dog')) return 'Panadería'
  if (clave.includes('chicharron')) return 'Chicharrón'
  if (clave.includes('bebida') || clave.includes('coca') || clave.includes('sprite') || clave.includes('fanta') || clave.includes('agua') || clave.includes('jugo') || clave.includes('cafe') || clave.includes('chocolate') || clave.includes('infusion') || clave.includes(' kr')) return 'Bebidas'

  return null
}

function ordenCategoria(categoria: string | null) {
  if (!categoria) return null
  const indice = CATEGORIAS.findIndex(c => normalizarTexto(c) === normalizarTexto(categoria))
  return indice >= 0 ? indice + 1 : null
}

function esCategoriaSinCategoria(categoria?: string | null) {
  if (!categoria) return false
  const clave = normalizarTexto(categoria)
  return clave === 'sin categoria' || clave === 'sin categorÃ­a'
}

function normalizarTexto(valor: string) {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function unirCategorias(base: string[], extras: string[]) {
  const vistas = new Set<string>()
  const resultado: string[] = []

  for (const categoria of [...base, ...extras]) {
    const clave = normalizarTexto(categoria)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    resultado.push(categoria)
  }

  return resultado
}
