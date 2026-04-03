@echo off
title ZapOfertas
echo.
echo  ========================================
echo   Iniciando ZapOfertas...
echo  ========================================
echo.

cd /d "%~dp0"

echo  [1/4] Verificando Evolution API (Docker)...
docker ps --filter "name=evolution-api" --filter "status=running" --format "{{.Names}}" | findstr "evolution-api" > nul 2>&1
if errorlevel 1 (
    echo  - Postgres e Evolution API nao estao rodando. Iniciando...
    docker start postgres > nul 2>&1
    timeout /t 3 /nobreak > nul
    docker start evolution-api > nul 2>&1
    timeout /t 5 /nobreak > nul
    echo  - Evolution API iniciada.
) else (
    echo  - Evolution API ja esta rodando.
)

echo.
echo  [2/4] Iniciando Backend...
start "ZapOfertas - Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"

timeout /t 6 /nobreak > nul

echo  [3/4] Iniciando Frontend...
start "ZapOfertas - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 8 /nobreak > nul

echo  [4/4] Abrindo navegador...
start http://localhost:5173

echo.
echo  ZapOfertas iniciado com sucesso!
echo  Acesse: http://localhost:5173
echo.
pause
