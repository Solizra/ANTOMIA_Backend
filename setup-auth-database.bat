@echo off
echo ========================================
echo CONFIGURANDO BASE DE DATOS DE AUTENTICACION
echo ========================================
echo.

echo Verificando conexion a PostgreSQL...
psql -U postgres -d climatetech_db -c "SELECT version();" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: No se puede conectar a PostgreSQL
    echo Asegurate de que PostgreSQL este ejecutandose y las credenciales sean correctas
    pause
    exit /b 1
)

echo Conexion exitosa a PostgreSQL
echo.

echo Ejecutando script de configuracion de autenticacion...
psql -U postgres -d climatetech_db -f auth-database-setup.sql

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo CONFIGURACION COMPLETADA EXITOSAMENTE
    echo ========================================
    echo.
    echo Las siguientes tablas han sido creadas:
    echo - Users (usuarios)
    echo - PasswordResetTokens (tokens de recuperacion)
    echo - EmailVerificationTokens (tokens de verificacion)
    echo.
    echo Usuario de ejemplo creado:
    echo Email: admin@antomia.com
    echo Password: password123
    echo.
) else (
    echo.
    echo ERROR: Hubo un problema ejecutando el script
    echo Revisa los logs de PostgreSQL para mas detalles
    echo.
)

echo Presiona cualquier tecla para continuar...
pause >nul
