# Super Admin Digital — Dev startup script
# Run from i:\setads\backend: .\start_dev.ps1

$BACKEND = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BACKEND

Write-Host "[1/3] Starting Django on http://localhost:8001 ..."
Start-Process -FilePath ".\venv\Scripts\python.exe" `
    -ArgumentList "manage.py","runserver","8001","--noreload" `
    -NoNewWindow `
    -RedirectStandardOutput "$env:TEMP\superadmin_django.log" `
    -RedirectStandardError  "$env:TEMP\superadmin_django.log"

Write-Host "[2/3] Starting Celery worker (pool=solo, Windows-safe) ..."
Start-Process -FilePath ".\venv\Scripts\python.exe" `
    -ArgumentList "-m","celery","-A","core_project","worker","--loglevel=info","--pool=solo" `
    -NoNewWindow `
    -RedirectStandardOutput "$env:TEMP\superadmin_worker.log" `
    -RedirectStandardError  "$env:TEMP\superadmin_worker.log"

Write-Host "[3/3] Starting Celery Beat scheduler ..."
Start-Process -FilePath ".\venv\Scripts\python.exe" `
    -ArgumentList "-m","celery","-A","core_project","beat","--loglevel=warning","--scheduler","django_celery_beat.schedulers:DatabaseScheduler" `
    -NoNewWindow `
    -RedirectStandardOutput "$env:TEMP\superadmin_beat.log" `
    -RedirectStandardError  "$env:TEMP\superadmin_beat.log"

Start-Sleep -Seconds 6
Write-Host ""
Write-Host "Services started. Logs:"
Write-Host "  Django : $env:TEMP\superadmin_django.log"
Write-Host "  Worker : $env:TEMP\superadmin_worker.log"
Write-Host "  Beat   : $env:TEMP\superadmin_beat.log"
Write-Host ""
Write-Host "API    : http://localhost:8001/api/"
Write-Host "Admin  : http://localhost:8001/admin/"
Write-Host ""
Write-Host "Frontend: cd i:\setads\frontend && npm run dev"
