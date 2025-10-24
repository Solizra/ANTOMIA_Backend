-- Script para solucionar problemas de clave foránea en la tabla Trends
-- Ejecutar como: psql -U postgres -d climatetech_db -f fix-foreign-key-constraint.sql

-- 1. Verificar trends con id_newsletter que no existen
SELECT 
    t.id,
    t."id_newsletter",
    t."Título_del_Trend",
    t."Link_del_Trend"
FROM "Trends" t
LEFT JOIN "Newsletter" n ON t."id_newsletter" = n.id
WHERE t."id_newsletter" IS NOT NULL 
  AND n.id IS NULL;

-- 2. Actualizar trends con id_newsletter inválido a NULL
UPDATE "Trends" 
SET "id_newsletter" = NULL
WHERE "id_newsletter" IS NOT NULL 
  AND "id_newsletter" NOT IN (SELECT id FROM "Newsletter");

-- 3. Verificar que no quedan referencias inválidas
SELECT 
    COUNT(*) as trends_con_referencias_invalidas
FROM "Trends" t
LEFT JOIN "Newsletter" n ON t."id_newsletter" = n.id
WHERE t."id_newsletter" IS NOT NULL 
  AND n.id IS NULL;

-- 4. Mostrar estadísticas finales
SELECT 
    'Trends con newsletter válido' as descripcion,
    COUNT(*) as cantidad
FROM "Trends" t
INNER JOIN "Newsletter" n ON t."id_newsletter" = n.id
UNION ALL
SELECT 
    'Trends sin newsletter (NULL)',
    COUNT(*)
FROM "Trends" 
WHERE "id_newsletter" IS NULL
UNION ALL
SELECT 
    'Total de trends',
    COUNT(*)
FROM "Trends";

-- 5. Verificar integridad de claves foráneas
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'Trends'::regclass 
  AND contype = 'f';

\echo '========================================'
\echo 'LIMPIEZA DE CLAVES FORÁNEAS COMPLETADA'
\echo '========================================'