# PowerShell script to activate .venv, start web UI and launch browser
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (Test-Path "$ScriptDir\.venv\Scripts\Activate.ps1") {
    & "$ScriptDir\.venv\Scripts\Activate.ps1"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " AI-Verified Secure Data Wiping & Certification" -ForegroundColor Green
Write-Host " Local Web Interface starting on http://127.0.0.1:5000" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Open browser after a short delay so server has time to bind
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://127.0.0.1:5000"
} | Out-Null

& "$ScriptDir\.venv\Scripts\python.exe" "$ScriptDir\web\app.py"
