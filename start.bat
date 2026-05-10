@echo off
title Super Admin Digital

echo.
echo  ========================================
echo   Super Admin Digital ^| Dev Startup
echo  ========================================
echo.

:: Check Docker
echo [1/5] Checking Docker containers...
docker ps --filter "name=setads-db-1" --filter "status=running" -q >nul 2>&1
if errorlevel 1 (
    echo       Starting Docker services...
    cd /d "%~dp0"
    docker compose up -d db redis >nul 2>&1
    timeout /t 5 /nobreak >nul
    echo       Docker started.
) else (
    echo       PostgreSQL + Redis already running.
)

:: Django backend
echo [2/5] Starting Django backend (port 8001)...
start "Django Backend" /min cmd /c "cd /d %~dp0backend && venv\Scripts\python.exe manage.py runserver 8001 --noreload > %TEMP%\superadmin_django.log 2>&1"
timeout /t 3 /nobreak >nul
echo       Django started. Log: %TEMP%\superadmin_django.log

:: Celery Worker
echo [3/5] Starting Celery worker...
start "Celery Worker" /min cmd /c "cd /d %~dp0backend && venv\Scripts\python.exe -m celery -A core_project worker --loglevel=warning --pool=solo > %TEMP%\superadmin_worker.log 2>&1"
timeout /t 4 /nobreak >nul
echo       Celery worker started. Log: %TEMP%\superadmin_worker.log

:: Celery Beat
echo [4/5] Starting Celery Beat scheduler...
start "Celery Beat" /min cmd /c "cd /d %~dp0backend && venv\Scripts\python.exe -m celery -A core_project beat --loglevel=warning --scheduler django_celery_beat.schedulers:DatabaseScheduler > %TEMP%\superadmin_beat.log 2>&1"
timeout /t 2 /nobreak >nul
echo       Celery Beat started. Log: %TEMP%\superadmin_beat.log

:: Next.js Frontend
echo [5/5] Starting Next.js frontend (port 3002)...
start "Next.js Frontend" /min cmd /c "cd /d %~dp0frontend && npm run dev -- -p 3002 > %TEMP%\superadmin_frontend.log 2>&1"
timeout /t 5 /nobreak >nul
timeout /t 5 /nobreak >nul
echo       Frontend started. Log: %TEMP%\superadmin_frontend.log

:: Done
echo.
echo  ========================================
echo   All services running!
echo  ========================================
echo.
echo   Dashboard    : http://localhost:3002
echo   API          : http://localhost:8001/api/
echo   Django Admin : http://localhost:8001/admin/
echo.
echo   Login: admin / admin123
echo.
echo   Logs:
echo     Django   : %TEMP%\superadmin_django.log
echo     Worker   : %TEMP%\superadmin_worker.log
echo     Beat     : %TEMP%\superadmin_beat.log
echo     Frontend : %TEMP%\superadmin_frontend.log
echo.
echo   Press any key to STOP all services...
pause >nul

:: Teardown
echo.
echo Stopping services...
taskkill /fi "WindowTitle eq Django Backend*"  /f >nul 2>&1
taskkill /fi "WindowTitle eq Celery Worker*"   /f >nul 2>&1
taskkill /fi "WindowTitle eq Celery Beat*"     /f >nul 2>&1
taskkill /fi "WindowTitle eq Next.js Frontend*" /f >nul 2>&1
echo Done.
