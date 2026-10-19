# Start Memory Monitor Desktop & ADB Reverse Port Forwarding
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   OS Memory Monitor - Desktop Launcher   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Locate ADB
$adbPath = "adb"
if (-not (Get-Command "adb" -ErrorAction SilentlyContinue)) {
    $sdkAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $sdkAdb) {
        $adbPath = $sdkAdb
    } else {
        Write-Warning "Could not automatically locate adb.exe. Ensure Android SDK platform-tools is in PATH."
    }
}

# 2. Setup ADB reverse port forwarding
Write-Host "`n[1/3] Setting up ADB reverse port forwarding over USB (tcp:8080 -> tcp:8080)..." -ForegroundColor Yellow
try {
    & $adbPath reverse tcp:8080 tcp:8080
    Write-Host "ADB reverse rule active:" -ForegroundColor Green
    & $adbPath reverse --list
} catch {
    Write-Warning "Failed setting adb reverse: $_"
    Write-Warning "Please make sure your phone is plugged in via USB with USB Debugging enabled."
}

# 3. Check node dependencies
$desktopDir = Join-Path $PSScriptRoot "desktop"
if (-not (Test-Path (Join-Path $desktopDir "node_modules"))) {
    Write-Host "`n[2/3] Installing desktop Node.js dependencies..." -ForegroundColor Yellow
    npm --prefix $desktopDir install
}

# 4. Launch Desktop Server
Write-Host "`n[3/3] Starting Desktop Dashboard..." -ForegroundColor Yellow
Write-Host "Dashboard will be accessible at: http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray

Set-Location $desktopDir
node server.js
