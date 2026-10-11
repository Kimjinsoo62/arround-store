@echo off
title Around Store - Terminator
cd /d "%~dp0"

echo ======================================================
echo    Around Store 서비스를 종료합니다.
echo ======================================================
echo.

echo [1/2] 실행 중인 서버 콘솔 창 닫기...
taskkill /F /FI "WINDOWTITLE eq Around Store - Runner*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Around Store - Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Around Store - Frontend*" >nul 2>&1

echo.
echo [2/2] 사용 중인 포트(8080, 3000) 프로세스 종료 중...
powershell -NoProfile -Command "$ports = @(8080, 3000); foreach ($port in $ports) { $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -gt 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host ('  - 종료된 프로세스 PID: ' + $p) } } } }"

echo.
echo ======================================================
echo    Around Store 가 정상적으로 종료되었습니다.
echo ======================================================
echo.
pause
