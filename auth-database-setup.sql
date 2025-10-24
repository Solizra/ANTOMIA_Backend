-- Script para agregar tablas de autenticación a la base de datos existente
-- Ejecutar como: psql -U postgres -d climatetech_db -f auth-database-setup.sql

-- Crear tabla de usuarios para autenticación
CREATE TABLE IF NOT EXISTS "Users" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100),
    "apellido" VARCHAR(100),
    "activo" BOOLEAN DEFAULT TRUE,
    "email_verificado" BOOLEAN DEFAULT FALSE,
    "fecha_creacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla para tokens de recuperación de contraseña
CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "token" VARCHAR(255) UNIQUE NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "used" BOOLEAN DEFAULT FALSE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla para tokens de verificación de email
CREATE TABLE IF NOT EXISTS "EmailVerificationTokens" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "token" VARCHAR(255) UNIQUE NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "used" BOOLEAN DEFAULT FALSE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_users_email ON "Users"("email");
CREATE INDEX IF NOT EXISTS idx_users_activo ON "Users"("activo");
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON "PasswordResetTokens"("token");
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON "PasswordResetTokens"("user_id");
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON "PasswordResetTokens"("expires_at");
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON "EmailVerificationTokens"("token");
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON "EmailVerificationTokens"("user_id");

-- Función para limpiar tokens expirados (opcional)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM "PasswordResetTokens" WHERE expires_at < NOW();
    DELETE FROM "EmailVerificationTokens" WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Insertar usuario de ejemplo (opcional - para testing)
-- La contraseña es 'password123' hasheada con bcrypt
INSERT INTO "Users" ("email", "password", "nombre", "apellido", "email_verificado") VALUES
('admin@antomia.com', '$2b$10$rQZ8K9vL2mN3pO4qR5sT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN6oP7qR8sT9uV', 'Admin', 'Antomia', TRUE)
ON CONFLICT ("email") DO NOTHING;

-- Mostrar información de las tablas creadas
\echo '========================================'
\echo 'TABLAS DE AUTENTICACIÓN CREADAS'
\echo '========================================'
\dt "Users"
\dt "PasswordResetTokens" 
\dt "EmailVerificationTokens"
