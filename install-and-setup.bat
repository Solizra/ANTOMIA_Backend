@echo off
echo ========================================
echo INSTALACION COMPLETA ANTOMIA
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

echo 3. Creando archivo de configuracion .env...
if not exist .env (
    if exist env.example (
        copy env.example .env
        echo Archivo .env creado desde env.example
        echo.
        echo IMPORTANTE: Edita el archivo .env y cambia 'tu_password_aqui' por tu contraseña real de PostgreSQL
        echo.
    ) else (
        echo Creando archivo .env basico...
        echo DB_HOST=localhost > .env
        echo DB_DATABASE=climatetech_db >> .env
        echo DB_USER=postgres >> .env
        echo DB_PASSWORD=tu_password_aqui >> .env
        echo DB_PORT=5432 >> .env
        echo PORT=3000 >> .env
        echo NODE_ENV=development >> .env
        echo.
        echo IMPORTANTE: Edita el archivo .env y cambia 'tu_password_aqui' por tu contraseña real de PostgreSQL
        echo.
    )
) else (
    echo Archivo .env ya existe.
)

echo 4. Creando base de datos y tablas...
echo Ejecutando script SQL...
psql -U postgres -f database-setup.sql

if %errorlevel% neq 0 (
    echo ERROR: No se pudo ejecutar el script SQL
    echo Verifica que la contraseña sea correcta
    echo.
    echo Para ejecutar manualmente:
    echo psql -U postgres -f database-setup.sql
    echo.
    echo O edita el archivo .env con la contraseña correcta y ejecuta:
    echo setup-database.bat
    pause
    exit /b 1
)

echo.
echo 5. Instalando dependencias de Node.js...
if exist package.json (
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: No se pudieron instalar las dependencias
        echo Verifica que Node.js este instalado
        pause
        exit /b 1
    )
) else (
    echo ERROR: No se encontro package.json
    echo Asegurate de estar en el directorio backend
    pause
    exit /b 1
)

echo.
echo ========================================
echo INSTALACION COMPLETADA EXITOSAMENTE
echo ========================================
echo.
echo Ahora puedes:
echo 1. Verificar que el archivo .env tenga la contraseña correcta
echo 2. Ejecutar: npm start
echo 3. Abrir: http://localhost:3000/api/Trends
echo.
echo Para probar la conexion:
echo GET http://localhost:3000/api/Newsletter
echo GET http://localhost:3000/api/Trends
echo GET http://localhost:3000/api/Fuentes
echo.
pause