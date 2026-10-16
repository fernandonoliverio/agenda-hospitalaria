@echo off
cd /d "%~dp0"

echo Iniciando Hospi...
start "" cmd /c "node server.js"
timeout /t 3 >nul
start "" http://localhost:3001
echo La app ya está disponible en http://localhost:3001
git
