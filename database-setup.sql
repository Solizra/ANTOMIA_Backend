-- Script de configuración de base de datos para ANTOMIA
-- Ejecutar como: psql -U postgres -f database-setup.sql

-- Crear base de datos si no existe
SELECT 'CREATE DATABASE climatetech_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'climatetech_db')\gexec

-- Conectar a la base de datos
\c climatetech_db;

-- Crear tabla Newsletter
CREATE TABLE IF NOT EXISTS "Newsletter" (
    "id" SERIAL PRIMARY KEY,
    "link" VARCHAR(500) NOT NULL,
    "Resumen" TEXT,
    "titulo" VARCHAR(500) NOT NULL,
    "fecha_creacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla Trends
CREATE TABLE IF NOT EXISTS "Trends" (
    "id" SERIAL PRIMARY KEY,
    "id_newsletter" INTEGER REFERENCES "Newsletter"("id") ON DELETE SET NULL,
    "Título_del_Trend" VARCHAR(500) NOT NULL,
    "Link_del_Trend" VARCHAR(500) NOT NULL,
    "Nombre_Newsletter_Relacionado" VARCHAR(500),
    "Fecha_Relación" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "Relacionado" BOOLEAN DEFAULT FALSE,
    "Analisis_relacion" TEXT,
    "fecha_creacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla Fuentes
CREATE TABLE IF NOT EXISTS "Fuentes" (
    "id" SERIAL PRIMARY KEY,
    "nombre" VARCHAR(200) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "activa" BOOLEAN DEFAULT TRUE,
    "fecha_creacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar datos de ejemplo en Newsletter
INSERT INTO "Newsletter" ("link", "Resumen", "titulo") VALUES
('https://example.com/newsletter1', 'Resumen del primer newsletter sobre tecnologías climáticas', 'Tecnologías Climáticas: El Futuro Verde'),
('https://example.com/newsletter2', 'Análisis de inversiones en energías renovables y sostenibilidad', 'Inversiones Verdes: Oportunidades Sostenibles'),
('https://example.com/newsletter3', 'Reporte sobre innovaciones en captura de carbono', 'Captura de Carbono: Innovación Ambiental'),
('https://example.com/newsletter4', 'Estudio sobre movilidad eléctrica y transporte sostenible', 'Movilidad Eléctrica: Transporte del Futuro'),
('https://example.com/newsletter5', 'Análisis de políticas climáticas y regulaciones ambientales', 'Políticas Climáticas: Marco Regulatorio')
ON CONFLICT DO NOTHING;

-- Insertar datos de ejemplo en Fuentes
INSERT INTO "Fuentes" ("nombre", "url", "activa") VALUES
('TechCrunch', 'techcrunch.com', TRUE),
('Wired', 'wired.com', TRUE),
('The Verge', 'theverge.com', TRUE),
('MIT Technology Review', 'technologyreview.com', TRUE),
('Nature', 'nature.com', TRUE),
('Science', 'science.org', TRUE),
('Reuters', 'reuters.com', TRUE),
('Bloomberg', 'bloomberg.com', TRUE),
('Financial Times', 'ft.com', TRUE),
('Wall Street Journal', 'wsj.com', TRUE),
('BBC', 'bbc.com', TRUE),
('CNN', 'cnn.com', TRUE),
('CleanTechnica', 'cleantechnica.com', TRUE),
('GreenTech Media', 'greentechmedia.com', TRUE),
('Carbon Brief', 'carbonbrief.org', TRUE),
('Inside Climate News', 'insideclimatenews.org', TRUE),
('El País', 'elpais.com', TRUE),
('El Confidencial', 'elconfidencial.com', TRUE),
('National Geographic', 'nationalgeographic.com', TRUE),
('Ambito', 'ambito.com', TRUE),
('Infobae', 'infobae.com', TRUE)
ON CONFLICT DO NOTHING;

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_trends_link ON "Trends"("Link_del_Trend");
CREATE INDEX IF NOT EXISTS idx_trends_newsletter ON "Trends"("id_newsletter");
CREATE INDEX IF NOT EXISTS idx_trends_fecha ON "Trends"("Fecha_Relación");
CREATE INDEX IF NOT EXISTS idx_newsletter_titulo ON "Newsletter"("titulo");
CREATE INDEX IF NOT EXISTS idx_fuentes_activa ON "Fuentes"("activa");

-- Crear tabla Feedback para retroalimentación de la IA
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" SERIAL PRIMARY KEY,
    "trendId" INTEGER,
    "action" VARCHAR(50) NOT NULL, -- e.g., 'delete', 'archive'
    "reason" TEXT,                 -- e.g., 'bad_relation', 'other'
    "feedback" VARCHAR(50),        -- e.g., 'positive', 'negative'
    "trendData" JSONB,             -- snapshot del trend
    "timestamp" TIMESTAMP,         -- momento del evento en el front
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices útiles para consultas futuras
CREATE INDEX IF NOT EXISTS idx_feedback_trendid ON "Feedback"("trendId");
CREATE INDEX IF NOT EXISTS idx_feedback_action ON "Feedback"("action");

-- Mostrar información de las tablas creadas
\dt

-- Mostrar conteo de registros
SELECT 'Newsletter' as tabla, COUNT(*) as registros FROM "Newsletter"
UNION ALL
SELECT 'Trends' as tabla, COUNT(*) as registros FROM "Trends"
UNION ALL
SELECT 'Fuentes' as tabla, COUNT(*) as registros FROM "Fuentes";

-- Mensaje de confirmación
\echo '========================================'
\echo 'BASE DE DATOS CONFIGURADA EXITOSAMENTE'
\echo '========================================'
\echo 'Base de datos: climatetech_db'
\echo 'Tablas creadas: Newsletter, Trends, Fuentes'
\echo 'Datos de ejemplo insertados'
\echo '========================================'
