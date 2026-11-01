-- Paso 2: separar datos operativos por empresa.
-- Ejecutar en Supabase SQL Editor antes de publicar el codigo.
-- No borra datos. Todo lo existente se asigna a La Felicitta.

DO $$
DECLARE
  v_empresa_id uuid;
  v_tabla text;
  v_tablas text[] := ARRAY[
    'ventas',
    'aperturas_caja',
    'cierres_caja',
    'gastos',
    'insumos',
    'recetas',
    'stock_insumos',
    'stock_compras',
    'stock_movimientos',
    'usuarios_pos'
  ];
BEGIN
  SELECT id INTO v_empresa_id
  FROM public.empresas
  WHERE slug = 'lafelicitta'
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No existe empresa con slug lafelicitta. Crea/actualiza la empresa antes de correr esta migracion.';
  END IF;

  FOREACH v_tabla IN ARRAY v_tablas
  LOOP
    IF to_regclass('public.' || v_tabla) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id)',
        v_tabla
      );

      EXECUTE format(
        'UPDATE public.%I SET empresa_id = $1 WHERE empresa_id IS NULL',
        v_tabla
      ) USING v_empresa_id;

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)',
        'idx_' || v_tabla || '_empresa_id',
        v_tabla
      );

      RAISE NOTICE 'Tabla % preparada con empresa_id %', v_tabla, v_empresa_id;
    ELSE
      RAISE NOTICE 'Tabla % no existe, se omite', v_tabla;
    END IF;
  END LOOP;
END $$;

-- Verificacion rapida.
SELECT
  e.nombre AS empresa,
  e.slug,
  COALESCE((SELECT COUNT(*) FROM public.ventas v WHERE v.empresa_id = e.id), 0) AS ventas,
  COALESCE((SELECT COUNT(*) FROM public.gastos g WHERE g.empresa_id = e.id), 0) AS gastos,
  COALESCE((SELECT COUNT(*) FROM public.aperturas_caja a WHERE a.empresa_id = e.id), 0) AS aperturas,
  COALESCE((SELECT COUNT(*) FROM public.cierres_caja c WHERE c.empresa_id = e.id), 0) AS cierres,
  COALESCE((SELECT COUNT(*) FROM public.insumos i WHERE i.empresa_id = e.id), 0) AS insumos,
  COALESCE((SELECT COUNT(*) FROM public.recetas r WHERE r.empresa_id = e.id), 0) AS recetas
FROM public.empresas e
WHERE e.slug = 'lafelicitta';
