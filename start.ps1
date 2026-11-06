# HSE VMS - Start Script (PowerShell)
# Run this script to start both backend and frontend

Write-Host "Starting HSE Visitor Management System..." -ForegroundColor Cyan
Write-Host ""

# Start backend
Write-Host "[1/2] Starting Backend (port 5000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start frontend
Write-Host "[2/2] Starting Frontend (port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; & 'C:\Program Files\nodejs\npm.cmd' run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  HSE VMS is starting up!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Visitor Portal:  http://localhost:5173" -ForegroundColor White
Write-Host "  Admin Dashboard: http://localhost:5173/admin/login" -ForegroundColor White
Write-Host "  Backend API:     http://localhost:5000/api/health" -ForegroundColor White
Write-Host ""
Write-Host "  Admin Login: admin / Admin@HSE2024" -ForegroundColor Gray
Write-Host ""
