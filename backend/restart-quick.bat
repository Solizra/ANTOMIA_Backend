@echo off
echo ========================================
echo REINICIO RAPIDO - APLICANDO CAMBIOS
echo ========================================

echo Deteniendo Node.js...
taskkill /f /im node.exe 2>nul

echo Esperando 2 segundos...
timeout /t 2 /nobreak >nul

echo Iniciando servidor...
cd /d "%~dp0"
start npm start

echo ========================================
echo SERVIDOR REINICIADO - CAMBIOS APLICADOS
echo ========================================
