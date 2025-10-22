-- Script para corregir la restricción de clave foránea entre Feedback y Trends
-- Ejecutar como: psql -U postgres -d climatetech_db -f fix-foreign-key-constraint.sql

-- Conectar a la base de datos
\c climatetech_db;

-- Verificar si la restricción ya existe
DO $$
BEGIN
    -- Verificar si la restricción de clave foránea ya existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'Feedback_trendId_fkey' 
        AND table_name = 'Feedback'
    ) THEN
        -- Agregar la restricción de clave foránea con CASCADE DELETE
        ALTER TABLE "Feedback" 
        ADD CONSTRAINT "Feedback_trendId_fkey" 
        FOREIGN KEY ("trendId") 
        REFERENCES "Trends"("id") 
        ON DELETE CASCADE;
        
        RAISE NOTICE 'Restricción de clave foránea agregada exitosamente';
    ELSE
        RAISE NOTICE 'La restricción de clave foránea ya existe';
    END IF;
END $$;

-- Verificar la estructura actual
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name = 'Feedback';

-- Mensaje de confirmación
\echo '========================================'
\echo 'RESTRICCIÓN DE CLAVE FORÁNEA CONFIGURADA'
\echo '========================================'
\echo 'La tabla Feedback ahora tiene CASCADE DELETE'
\echo 'Los registros de Feedback se eliminarán automáticamente'
\echo 'cuando se elimine el trend relacionado'
\echo '========================================'
