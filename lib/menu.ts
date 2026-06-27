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
  { id: 'cuarto-pollo-solo', nombre: '¼ Pollo solo', precio: 3000, categoria: 'Combos a la Brasa', ingredientes: 'Pechuga o trutro' },
  { id: 'medio-pollo-solo', nombre: '½ Pollo solo', precio: 6000, categoria: 'Combos a la Brasa', ingredientes: 'Medio pollo a la brasa solo' },
  { id: 'pollo-entero-solo', nombre: '1 Pollo solo', precio: 12000, categoria: 'Combos a la Brasa', ingredientes: 'Pollo entero a la brasa solo' },
  { id: 'combo-clasico-brasa', nombre: 'Combo Clásico Brasa', precio: 22000, categoria: 'Combos a la Brasa', ingredientes: '1 pollo a la brasa entero + papas fritas + ensalada + bebida 1.5L' },
  { id: 'combo-especial-brasa', nombre: 'Combo Especial Brasa', precio: 23000, categoria: 'Combos a la Brasa', ingredientes: '1 pollo a la brasa entero + arroz + papas fritas + ensalada + bebida 1.5L' },
  { id: 'medio-pollo-brasa', nombre: '½ Pollo Brasa', precio: 13000, categoria: 'Combos a la Brasa', ingredientes: '½ pollo a la brasa + papas fritas + ensalada + bebida personal KR' },
  { id: 'medio-pollo-brasa-especial', nombre: '½ Pollo Brasa Especial', precio: 14000, categoria: 'Combos a la Brasa', ingredientes: '½ pollo a la brasa + papas + arroz + ensalada + bebida personal KR' },
  { id: 'personal-brasa-papas', nombre: '¼ Pollo + Papas', precio: 6000, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + papas fritas' },
  { id: 'personal-brasa-arroz', nombre: '¼ Pollo + Arroz', precio: 6000, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + arroz' },
  { id: 'personal-brasa-ensalada', nombre: '¼ Pollo + Ensalada', precio: 5500, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + ensalada' },
  { id: 'personal-brasa-arroz-ensalada', nombre: '¼ Pollo + Arroz + Ensalada', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + arroz + ensalada' },
  { id: 'personal-brasa-papas-arroz', nombre: '¼ Pollo + Papas + Arroz', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + papas + arroz' },
  { id: 'personal-brasa-papas-ensalada', nombre: '¼ Pollo + Papas + Ensalada', precio: 6500, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + papas + ensalada' },
  { id: 'personal-brasa-completo', nombre: '¼ Pollo + Papas + Arroz + Ensalada', precio: 7000, categoria: 'Combos a la Brasa', ingredientes: '¼ pollo a la brasa + papas + arroz + ensalada' },

  // ── ALMUERZOS ────────────────────────────────────────────────
  { id: 'almuerzo-pollo-agridulce', nombre: 'Pollo agridulce', precio: 6990, categoria: 'Almuerzos', ingredientes: 'Pollo agridulce + 2 acompañamientos' },
  { id: 'almuerzo-chop-suey', nombre: 'Chop suey de pollo', precio: 6990, categoria: 'Almuerzos', ingredientes: 'Chop suey de pollo + 2 acompañamientos' },
  { id: 'almuerzo-pechuga-crispy', nombre: 'Pechuga Crispy al Estilo Chef', precio: 6990, categoria: 'Almuerzos', ingredientes: 'Pechuga crispy + 2 acompañamientos' },
  { id: 'almuerzo-pollo-brasa', nombre: 'Pollo a la brasa', precio: 7500, categoria: 'Almuerzos', ingredientes: 'Pollo a la brasa + 2 acompañamientos' },
  { id: 'almuerzo-costillas-agridulce', nombre: 'Costillas chinas agridulce', precio: 7990, categoria: 'Almuerzos', ingredientes: 'Costillas chinas agridulce + 2 acompañamientos' },

  // ── BURGERS ──────────────────────────────────────────────────
  { id: 'burger-felicitta', nombre: 'La Felicitta', precio: 3500, categoria: 'Burgers', ingredientes: 'Carne de la casa, papas hilo, tomate, lechuga, ketchup, mostaza, mayo' },
  { id: 'burger-especial-carne', nombre: 'Especial de Carne', precio: 5000, categoria: 'Burgers', ingredientes: 'Carne, queso gouda, huevo, papas hilo, cebolla, tomate, lechuga + salsa' },
  { id: 'burger-doble', nombre: 'Doble', precio: 7500, categoria: 'Burgers', ingredientes: 'Doble proteína, doble queso cheddar, cebolla morada, pepinillo, tocino' },
  { id: 'burger-pelua', nombre: 'La Pelua', precio: 8500, categoria: 'Burgers', ingredientes: 'Carne mechada, huevo, tocino ahumado, lechuga, tomate, cebolla morada, queso gouda' },
  { id: 'burger-triple', nombre: 'Triple', precio: 9990, categoria: 'Burgers', ingredientes: 'Triple proteína, tocino ahumado, lechuga, tomate, cebolla morada, queso cheddar' },
  { id: 'burger-estrella-xl', nombre: 'XL La Estrella', precio: 7500, categoria: 'Burgers', ingredientes: '200g carne, lechuga, tomate, cebolla + salsas. Incluye papas.' },
  { id: 'burger-luna-xl', nombre: 'XL La Luna', precio: 7500, categoria: 'Burgers', ingredientes: '200g carne, tocineta, huevo, queso gouda, lechuga, tomate, cebolla morada. Incluye papas.' },

  // ── PERROS ───────────────────────────────────────────────────
  { id: 'perro-luka', nombre: 'El de Luka', precio: 1000, categoria: 'Perros', ingredientes: '15cm · salchicha, repollo, papas hilo, ketchup, mayo, mostaza' },
  { id: 'perro-panchito', nombre: 'Panchito', precio: 1000, categoria: 'Perros', ingredientes: 'Solo salsas: ketchup, mayo y mostaza' },
  { id: 'perro-callejero', nombre: 'El Callejero', precio: 2500, categoria: 'Perros', ingredientes: '20cm · salchicha, repollo, papas hilo, queso gouda, mayo-ajo' },
  { id: 'perro-americano', nombre: 'El Americano', precio: 3990, categoria: 'Perros', ingredientes: '22cm · repollo, tocineta, queso cheddar, papas hilo' },
  { id: 'perro-peluo', nombre: 'El Peluo', precio: 3990, categoria: 'Perros', ingredientes: '22cm · carne mechada casera, repollo, tomate, papas hilo, queso gouda' },
  { id: 'perro-perripollo', nombre: 'El Perripollo', precio: 3500, categoria: 'Perros', ingredientes: 'Pollo a la plancha o mechado, repollo con cilantro, papas hilo, queso amarillo, salsas básicas y salsa de la casa' },

  // ── COMPLETOS Y SÁNDWICHS ────────────────────────────────────
  { id: 'as-normal', nombre: 'As Normal', precio: 4990, categoria: 'Completos' },
  { id: 'as-xl', nombre: 'XL As', precio: 8990, categoria: 'Completos' },
  { id: 'italiano-normal', nombre: 'Italiano Normal', precio: 2500, categoria: 'Completos' },
  { id: 'italiano-xl', nombre: 'XL Italiano', precio: 4500, categoria: 'Completos' },
  { id: 'churrasco-italiano', nombre: 'Churrasco Italiano', precio: 5000, categoria: 'Completos', ingredientes: 'Carne, tomate, palta, mayo casera' },
  { id: 'churrasco-super', nombre: 'Churrasco Super', precio: 5500, categoria: 'Completos', ingredientes: 'Carne, tomate, palta, lechuga, queso, mayo casera' },
  { id: 'barros-luco', nombre: 'Barros Luco', precio: 5000, categoria: 'Completos', ingredientes: 'Carne y queso' },
  { id: 'churrasco-mechada', nombre: 'Churrasco Mechada', precio: 6500, categoria: 'Completos', ingredientes: 'Carne mechada, tomate, palta, mayo, queso' },
  { id: 'chacarero', nombre: 'Chacarero', precio: 6500, categoria: 'Completos', ingredientes: 'Mayo, carne, tomate, poroto verde, ají verde' },

  // ── AREPAS ───────────────────────────────────────────────────
  { id: 'arepa-la-resuelta', nombre: 'La Resuelta', precio: 4500, categoria: 'Arepas', ingredientes: 'Elige hasta 5 ingredientes: carne mechada, pollo mechado, carne molida, pernil, caraotas, queso blanco, queso amarillo, queso gouda, palta, plátano frito, pico de gallo, mayo casera o salsa ajo-cilantro' },
  { id: 'arepa-la-resuelta-kr', nombre: 'La Resuelta + KR', precio: 5000, categoria: 'Arepas', ingredientes: 'La Resuelta con bebida KR personal incluida' },
  { id: 'arepa-reina-pepiada', nombre: 'Reina Pepiada', precio: 5990, categoria: 'Arepas', ingredientes: 'Pollo desmechado, palta cremosa y mayonesa casera' },
  { id: 'arepa-pelua', nombre: 'Pelúa', precio: 5990, categoria: 'Arepas', ingredientes: 'Carne mechada de res y queso amarillo derretido' },
  { id: 'arepa-domino', nombre: 'Dominó', precio: 4990, categoria: 'Arepas', ingredientes: 'Caraotas negras y queso blanco rallado' },
  { id: 'arepa-perico', nombre: 'Perico', precio: 4990, categoria: 'Arepas', ingredientes: 'Huevos revueltos con tomate, cebolla, pimentón y queso blanco' },
  { id: 'arepa-pabellon', nombre: 'Pabellón', precio: 6490, categoria: 'Arepas', ingredientes: 'Carne mechada, caraotas negras, plátano frito y queso blanco rallado' },
  { id: 'arepa-sifrina', nombre: 'Sifrina', precio: 5990, categoria: 'Arepas', ingredientes: 'Pollo desmechado, palta, queso amarillo y mayonesa' },
  { id: 'arepa-tumbarrancho', nombre: 'Tumbarrancho', precio: 7490, categoria: 'Arepas', ingredientes: 'Carne mechada, jamón, queso amarillo y caraotas negras' },
  { id: 'arepa-rompe-colchon', nombre: 'Rompe Colchón', precio: 8990, categoria: 'Arepas', ingredientes: 'Camarones salteados, palta, queso blanco y pico de gallo' },
  { id: 'arepa-la-italiana', nombre: 'La Italiana', precio: 7990, categoria: 'Arepas', ingredientes: 'Pernil desmechado, queso gouda derretido, pico de gallo y palta' },
  { id: 'arepa-la-maracucha', nombre: 'La Maracucha', precio: 6990, categoria: 'Arepas', ingredientes: 'Pernil, queso blanco y plátano frito' },

  // ── CACHAPAS ─────────────────────────────────────────────────
  { id: 'cachapa-queso-llanero', nombre: 'Cachapa Queso Llanero', precio: 6500, categoria: 'Cachapas', ingredientes: 'Queso rallado, mantequilla, natilla' },
  { id: 'cachapa-cochino-frito', nombre: 'Cachapa Cochino Frito', precio: 8500, categoria: 'Cachapas', ingredientes: '250g cochino, queso rallado, natilla' },
  { id: 'cachapa-queso-mano', nombre: 'Cachapa Queso de Mano', precio: 7500, categoria: 'Cachapas', ingredientes: 'Queso de mano, mantequilla, natilla' },
  { id: 'cachapa-cochino-queso', nombre: 'Cachapa Cochino + Queso', precio: 10000, categoria: 'Cachapas', ingredientes: 'Queso de mano, cochino, mantequilla, natilla' },

  // ── ARROZ CHINO ──────────────────────────────────────────────
  { id: 'arroz-salteado', nombre: 'Arroz Salteado', precio: 4500, categoria: 'Arroz chino', ingredientes: 'Pollo, jamón, diente de dragón, cebollín' },
  { id: 'arroz-cerdo-pollo', nombre: 'Especial Cerdo–Pollo', precio: 8000, categoria: 'Arroz chino', ingredientes: 'Arroz salteado, pollo, cerdo, huevo, cebollín' },
  { id: 'arroz-cerdo-camaron', nombre: 'Especial Cerdo–Camarón', precio: 10000, categoria: 'Arroz chino', ingredientes: 'Arroz salteado, camarón, cerdo, huevo, cebollín' },
  { id: 'arroz-la-felicitta', nombre: 'Arroz La Felicitta', precio: 12000, categoria: 'Arroz chino', ingredientes: 'Jamón, pollo, cerdo, camarón, diente de dragón, huevo' },

  // ── PAPAS Y ACOMPAÑAMIENTOS ──────────────────────────────────
  { id: 'papas-normal', nombre: 'Papas Normal', precio: 3500, categoria: 'Papas' },
  { id: 'papas-xl', nombre: 'Papas XL', precio: 6500, categoria: 'Papas' },
  { id: 'bacon-cheddar', nombre: 'Bacon & Cheddar', precio: 5500, categoria: 'Papas', ingredientes: 'Tocino ahumado y queso cheddar' },
  { id: 'bacon-cheddar-xl', nombre: 'XL Bacon & Cheddar', precio: 9990, categoria: 'Papas', ingredientes: 'Tocino ahumado y queso cheddar XL' },
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
  { id: 'tequeno-25-guayaba-queso', nombre: 'Tequeños 25cm — Guayaba/Queso', precio: 2500, categoria: 'Tequeños' },
  { id: 'tequenos-8cm-4', nombre: 'Tequeños 8cm — 4 unidades', precio: 2500, categoria: 'Tequeños' },
  { id: 'tequenos-8cm-8', nombre: 'Tequeños 8cm — 8 unidades', precio: 4700, categoria: 'Tequeños' },
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
  { id: 'jugo-maracuya', nombre: 'Jugo Maracuyá', precio: 2800, categoria: 'Bebidas' },
  { id: 'jugo-maracuya-leche', nombre: 'Jugo Maracuyá con leche', precio: 3500, categoria: 'Bebidas' },
  { id: 'jugo-frutilla', nombre: 'Jugo Frutilla', precio: 2800, categoria: 'Bebidas' },
  { id: 'jugo-frutilla-leche', nombre: 'Jugo Frutilla con leche', precio: 3500, categoria: 'Bebidas' },
  { id: 'jugo-mango', nombre: 'Jugo Mango', precio: 2800, categoria: 'Bebidas' },
  { id: 'jugo-mango-leche', nombre: 'Jugo Mango con leche', precio: 3500, categoria: 'Bebidas' },
  { id: 'jugo-pina', nombre: 'Jugo Piña', precio: 2800, categoria: 'Bebidas' },
  { id: 'jugo-pina-leche', nombre: 'Jugo Piña con leche', precio: 3500, categoria: 'Bebidas' },
  { id: 'limonada', nombre: 'Limonada', precio: 2500, categoria: 'Bebidas' },
  { id: 'papelon-limon', nombre: 'Papelón con limón', precio: 2500, categoria: 'Bebidas' },
  { id: 'jarra-limonada', nombre: 'Jarra limonada', precio: 6000, categoria: 'Bebidas' },
  { id: 'jarra-papelon', nombre: 'Jarra papelón', precio: 6000, categoria: 'Bebidas' },
  { id: 'cafe-americano', nombre: 'Café Americano', precio: 1500, categoria: 'Bebidas' },
  { id: 'cafe-leche', nombre: 'Café con Leche', precio: 2000, categoria: 'Bebidas' },
  { id: 'te-infusion', nombre: 'Té / Infusión', precio: 1500, categoria: 'Bebidas', ingredientes: 'Menta, manzanilla, canela' },
  { id: 'chocolate-caliente', nombre: 'Chocolate caliente', precio: 2500, categoria: 'Bebidas' },
  { id: 'agua-500', nombre: 'Agua 500cc', precio: 1300, categoria: 'Bebidas' },
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
  const [productosResult, categoriasResult] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio, descripcion, imagen_url, disponible, destacado, categoria_id')
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true }),
    supabase
      .from('categorias')
      .select('id, nombre, orden, activo, activa')
      .eq('empresa_id', empresaId)
  ])

  const { data, error } = productosResult
  if (error || !data) return []

  const cats = categoriasResult.data || []
  const categoriasPorId = new Map(cats.map((c: CategoriaDb) => [c.id, c]))

  return (data as ProductoDb[])
    .filter(producto => producto.disponible !== false)
    .map(producto => {
      const cat = producto.categoria_id ? (categoriasPorId.get(producto.categoria_id) as CategoriaDb | undefined) ?? null : null
      return normalizarProductoDb({ ...producto, categorias: cat })
    })
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
  if (clave.includes('papa') || clave.includes('bacon') || clave.includes('salchipapa') || clave.includes('nugget')) return 'Papas'
  if (clave.includes('empanada')) return 'Empanadas'
  if (clave.includes('tequeno')) return 'Tequeños'
  if (clave.includes('pasapalo') || clave.includes('mix ') || clave.includes('mini ')) return 'Pasapalos'
  if (clave.includes('churro')) return 'Churros'
  if (clave.includes('pan') || clave.includes('completon') || clave.includes('hot dog')) return 'Panadería'
  if (clave.includes('chicharron')) return 'Chicharrón'
  if (clave.includes('almuerzo') || clave.includes('chop suey') || clave.includes('costilla') || clave.includes('pechuga crispy')) return 'Almuerzos'
  if (clave.includes('bebida') || clave.includes('coca') || clave.includes('sprite') || clave.includes('fanta') || clave.includes('agua') || clave.includes('jugo') || clave.includes('cafe') || clave.includes('chocolate') || clave.includes('infusion') || clave.includes(' kr') || clave.includes('limonada') || clave.includes('papelon') || clave.includes('jarra')) return 'Bebidas'

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
