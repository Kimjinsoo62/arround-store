@echo off
title Around Store - Installer
cd /d "%~dp0"

echo ======================================================
echo    Around Store 환경 점검 및 의존성 설치
echo ======================================================
echo.

REM 1. Python 점검
echo [1/4] Python 설치 확인 중...
where python >nul 2>&1
if errorlevel 1 goto :NO_PYTHON
python --version

REM 2. Node.js & npm 점검
echo.
echo [2/4] Node.js 및 npm 설치 확인 중...
where npm >nul 2>&1
if errorlevel 1 goto :NO_NODE
node --version
call npm --version

REM 3. Backend 패키지 설치
echo.
echo [3/4] 백엔드 패키지 설치 중...
cd /d "%~dp0backend"

if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul
)
if not exist ".env" (
    echo DATA_GO_KR_API_KEY=이곳에_공공데이터포털_API키를_넣으세요> .env
    echo   [안내] backend\.env 에 공공데이터포털 API 키를 입력하세요.
)

echo   - Python 가상환경 venv 점검 및 생성 중...
if not exist "venv\Scripts\python.exe" python -m venv venv

if exist "venv\Scripts\python.exe" goto :INSTALL_VENV
goto :INSTALL_GLOBAL

:INSTALL_VENV
echo   - 가상환경 venv 에 라이브러리 설치 중...
call "venv\Scripts\python.exe" -m pip install --upgrade pip
call "venv\Scripts\python.exe" -m pip install -r requirements.txt
goto :BACKEND_DONE

:INSTALL_GLOBAL
echo   - 글로벌 파이썬에 라이브러리 설치 중...
call python -m pip install --upgrade pip
call python -m pip install -r requirements.txt
goto :BACKEND_DONE

:BACKEND_DONE
echo   - 백엔드 패키지 설치 완료!

REM 4. Frontend 패키지 설치
echo.
echo [4/4] 프론트엔드 패키지 설치 중...
cd /d "%~dp0frontend"

if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul
)
if not exist ".env" (
    echo VITE_KAKAO_MAP_API_KEY=이곳에_카카오_JavaScript_앱_키를_넣으세요> .env
    echo   [안내] frontend\.env 에 카카오 JavaScript 키를 입력하세요.
)

echo   - npm install 실행 중 (잠시 기다려주세요)...
call npm install
if errorlevel 1 goto :NPM_ERROR

cd /d "%~dp0"
echo.
echo ======================================================
echo    모든 의존성 설치가 성공적으로 완료되었습니다!
echo    이제 START.BAT 를 더블 클릭하여 실행하세요.
echo ======================================================
echo.
pause
exit /b 0

:NO_PYTHON
echo.
echo [오류] Python이 설치되어 있지 않거나 시스템 PATH에 등록되지 않았습니다.
echo        https://www.python.org 에서 Python 3.10 이상을 설치하고,
echo        설치 시 'Add python.exe to PATH' 체크박스를 반드시 선택해주세요.
echo.
pause
exit /b 1

:NO_NODE
echo.
echo [오류] Node.js 또는 npm이 설치되어 있지 않거나 시스템 PATH에 등록되지 않았습니다.
echo        https://nodejs.org 에서 Node.js LTS 버전을 다운로드하여 설치해주세요.
echo.
pause
exit /b 1

:NPM_ERROR
echo.
echo [오류] 프론트엔드 npm 패키지 설치 중 오류가 발생했습니다.
echo        인터넷 연결을 확인하고 다시 시도해주세요.
echo.
pause
exit /b 1
