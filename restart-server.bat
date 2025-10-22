@echo off
echo ========================================
echo REINICIANDO SERVIDOR BACKEND
echo ========================================

echo Deteniendo procesos de Node.js...
taskkill /f /im node.exe 2>nul

echo Esperando 3 segundos...
timeout /t 3 /nobreak >nul

echo Iniciando servidor backend...
cd /d "%~dp0"
npm start

echo ========================================
echo SERVIDOR REINICIADO
echo ========================================
pause
