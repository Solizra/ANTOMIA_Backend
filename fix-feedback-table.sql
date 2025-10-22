-- Script para corregir la tabla Feedback y permitir trendId NULL
-- Ejecutar en la base de datos

-- Primero, eliminar la restricción de clave foránea existente
ALTER TABLE "Feedback" DROP CONSTRAINT IF EXISTS "Feedback_trendId_fkey";

-- Ahora permitir que trendId sea NULL
ALTER TABLE "Feedback" ALTER COLUMN "trendId" DROP NOT NULL;

-- Opcional: agregar la restricción de nuevo pero permitiendo NULL
-- ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_trendId_fkey" 
-- FOREIGN KEY ("trendId") REFERENCES "Trends"("id") ON DELETE SET NULL;

-- Verificar la estructura
\d "Feedback"
