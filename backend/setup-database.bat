@echo off
echo ========================================
echo CONFIGURACION DE BASE DE DATOS ANTOMIA
echo ========================================
echo.

echo 1. Verificando si PostgreSQL esta instalado...
where psql >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PostgreSQL no esta instalado.
    echo.
    echo Para instalar PostgreSQL:
    echo 1. Ve a https://www.postgresql.org/download/windows/
    echo 2. Descarga e instala PostgreSQL para Windows
    echo 3. Durante la instalacion, anota la contraseña del usuario 'postgres'
    echo 4. Ejecuta este script nuevamente
    echo.
    pause
    exit /b 1
)

echo PostgreSQL encontrado.
echo.

echo 2. Verificando si el servicio PostgreSQL esta ejecutandose...
sc query postgresql-x64-15 >nul 2>&1
if %errorlevel% neq 0 (
    echo Iniciando servicio PostgreSQL...
    net start postgresql-x64-15
    if %errorlevel% neq 0 (
        echo ERROR: No se pudo iniciar el servicio PostgreSQL
        echo Verifica que PostgreSQL este instalado correctamente
        pause
        exit /b 1
    )
)

echo Servicio PostgreSQL ejecutandose.
echo.

echo 3. Creando base de datos y tablas...
echo Ejecutando script SQL...
psql -U postgres -f database-setup.sql

if %errorlevel% neq 0 (
    echo ERROR: No se pudo ejecutar el script SQL
    echo Verifica que la contraseña sea correcta
    echo.
    echo Para ejecutar manualmente:
    echo psql -U postgres -f database-setup.sql
    pause
    exit /b 1
)

echo.
echo ========================================
echo CONFIGURACION COMPLETADA EXITOSAMENTE
echo ========================================
echo.
echo Ahora puedes:
echo 1. Copiar el archivo env.example a .env
echo 2. Editar .env con tu contraseña de PostgreSQL
echo 3. Ejecutar: npm start
echo.
pause
