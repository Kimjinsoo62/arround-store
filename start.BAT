@echo off
cd /d "%~dp0"

REM 0. 의존성 설치 확인
if not exist "frontend\node_modules" goto :NOT_INSTALLED

REM PC 실행 시 커맨드 창이 실행되더라도 즉시 백그라운드(최소화)로 내려가도록 처리
if "%1"=="min" goto :RUN_MINIMIZED
start /min "Around Store - Runner" "%~f0" min
exit /b

:RUN_MINIMIZED
title Around Store - Runner

echo ======================================================
echo    Around Store 서비스를 시작합니다. (백그라운드 실행)
echo ======================================================
echo.

echo [1/3] 기존 포트(8080, 3000) 점유 상태 점검 및 정리...
powershell -NoProfile -Command "$ports = @(8080, 3000); foreach ($port in $ports) { $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } } }"

echo.
echo [2/3] 백엔드(FastAPI) 서버 시작 중 (백그라운드)...
cd /d "%~dp0backend"
if exist "venv\Scripts\python.exe" goto :START_VENV
goto :START_GLOBAL

:START_VENV
start /min "Around Store - Backend" cmd /k "venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8080"
goto :START_FRONTEND

:START_GLOBAL
start /min "Around Store - Backend" cmd /k "python -m uvicorn main:app --host 127.0.0.1 --port 8080"
goto :START_FRONTEND

:START_FRONTEND
echo.
echo [3/3] 프론트엔드(React + Vite) 서버 시작 중 (백그라운드)...
cd /d "%~dp0frontend"
start /min "Around Store - Frontend" cmd /k npm run dev

cd /d "%~dp0"

echo.
echo 서버가 구동될 때까지 잠시 대기 중...
ping 127.0.0.1 -n 5 >nul

echo 브라우저를 엽니다...
start http://localhost:3000

echo.
echo ======================================================
echo    실행 완료! 브라우저(http://localhost:3000)를 확인하세요.
echo    종료할 때는 STOP.bat 을 실행해주세요.
echo ======================================================
echo.
exit /b 0

:NOT_INSTALLED
title Around Store - Runner
echo.
echo ======================================================
echo  [경고] 프론트엔드 의존성(node_modules)이 설치되어 있지 않습니다.
echo         먼저 [install.bat] 을 실행하여 환경 구성을 완료해주세요.
echo ======================================================
echo.
pause
exit /b 1
