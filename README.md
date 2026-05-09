# POS La Felicitta 🍽️

Sistema de caja, comandas y reportes para La Felicitta.

## Stack
- **Next.js 14** — framework React
- **Supabase** — base de datos PostgreSQL + realtime
- **Vercel** — hosting gratuito

## Pantallas
- `/` — Caja: tomar pedidos e imprimir comandas 80mm
- `/cocina` — Comandas en tiempo real para cocina
- `/reportes` — Ventas del día, semana y mes + exportar CSV

---

## Setup Supabase (hacer UNA vez)

### 1. Crear tablas en Supabase

Ve a tu proyecto Supabase → **SQL Editor** → pega y ejecuta:

```sql
-- Tabla de ventas
create table ventas (
  id uuid default gen_random_uuid() primary key,
  numero integer not null,
  mesa text not null,
  mesero text,
  personas integer default 1,
  metodo_pago text default 'Débito',
  total integer not null,
  items jsonb not null default '[]',
  estado text default 'pendiente',
  nota text,
  created_at timestamptz default now()
);

-- Habilitar realtime para la pantalla de cocina
alter publication supabase_realtime add table ventas;

-- Política de acceso (permitir todo por ahora - uso interno)
alter table ventas enable row level security;
create policy "allow_all" on ventas for all using (true) with check (true);
```

### 2. Variables de entorno en Vercel

En Vercel → tu proyecto → Settings → Environment Variables, agrega:
```
NEXT_PUBLIC_SUPABASE_URL=https://xlzbqgvmwbskpfajehgi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

---

## Deploy en Vercel

1. Sube este repo a GitHub
2. Ve a vercel.com → "Import Project" → selecciona el repo
3. Agrega las variables de entorno
4. Clic en Deploy

---

## Impresora Xprinter XP-N160II (80mm USB)

1. Conecta la impresora por USB a la PC de caja
2. Instala el driver desde: https://www.xprinter.net/support/
3. En Windows: impresoras → establece como predeterminada
4. Al imprimir desde el sistema: selecciona la Xprinter, **márgenes en 0**
5. El CSS ya está optimizado para papel 80mm

---

## Desarrollo local

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales
npm run dev
```
