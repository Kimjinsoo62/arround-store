"""
[종료] · [업데이트] 버튼용 API.
- POST /api/shutdown        : 캐시 삭제 → 서버 프로세스·포트 정리 → cmd 창 닫기 (브라우저 닫기는 화면이 한다)
- GET  /api/update/check    : git fetch 후 새 커밋 목록
- POST /api/update/apply    : git pull --ff-only, 진행 로그를 돌려준다

실행 방식(APP_RUN_MODE)에 따라 종료 동작이 다르다.
- dev     : start.BAT 로 띄운 개발 모드(백엔드 8080 + Vite 3000). 전부 내리고 창도 닫는다.
- service : 포털(NSSM 서비스, run.py). 프로세스를 끝내도 NSSM 이 곧바로 다시 띄우고 다른 PC 사용자도
            쓰는 중일 수 있으므로 서버는 그대로 두고 캐시만 지운다. 서비스 정지는 포털 관리자 화면에서 한다.
            업데이트도 서비스 계정이 앱 폴더에 쓸 수 없어 확인(ls-remote)만 하고 적용은 안내만 한다.
"""
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter

APP_DIR = Path(__file__).resolve().parent.parent      # apps/arround-store
DEV_PORTS = (3000, 8080)
WINDOW_TITLE = "Around Store*"                        # start.BAT 가 여는 cmd 창 제목
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
DETACHED = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

router = APIRouter()


def _run_mode() -> str:
    return os.getenv("APP_RUN_MODE", "dev")


def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=APP_DIR, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, creationflags=NO_WINDOW)
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, str(e)


def _git(*args: str, timeout: int = 60) -> tuple[int, str]:
    # 서비스 계정으로 돌 때 폴더 소유자가 달라 "dubious ownership" 으로 막히지 않게 한다
    return _run(["git", "-c", "safe.directory=*", *args], timeout=timeout)


# ---------------- 종료 ----------------
def _clear_cache() -> list[str]:
    removed = []
    skip = {".venv", "venv", "node_modules", ".git"}
    for root, dirs, _ in os.walk(APP_DIR):
        if "__pycache__" in dirs:
            shutil.rmtree(Path(root) / "__pycache__", ignore_errors=True)
            removed.append(str(Path(root, "__pycache__").relative_to(APP_DIR)))
        dirs[:] = [d for d in dirs if d not in skip and d != "__pycache__"]
    vite_cache = APP_DIR / "frontend" / "node_modules" / ".vite"
    if vite_cache.is_dir():
        shutil.rmtree(vite_cache, ignore_errors=True)
        removed.append("frontend/node_modules/.vite")
    return removed


def _free_ports(ports, keep: set[int]) -> list[int]:
    killed = []
    _, out = _run(["netstat", "-ano", "-p", "TCP"], timeout=15)
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[3] != "LISTENING" or not parts[4].isdigit():
            continue
        if not any(parts[1].endswith(f":{p}") for p in ports):
            continue
        pid = int(parts[4])
        if pid in keep or pid in killed:
            continue
        _run(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=10)
        killed.append(pid)
    return killed


def _shutdown_dev() -> None:
    time.sleep(0.5)                                   # 응답이 브라우저에 도착할 시간
    _free_ports(DEV_PORTS, keep={os.getpid(), os.getppid()})
    # 자기 콘솔 창은 자기가 살아 있을 때 죽이면 conhost 가 깨지므로, 분리된 cmd 가 잠시 뒤 창들을 닫는다
    subprocess.Popen(
        f'cmd /c ping 127.0.0.1 -n 2 >nul & taskkill /FI "WINDOWTITLE eq {WINDOW_TITLE}" /T /F',
        creationflags=DETACHED | NO_WINDOW, close_fds=True)
    os._exit(0)


@router.post("/api/shutdown")
def api_shutdown():
    mode = _run_mode()
    steps = [f"캐시 삭제: {len(_clear_cache())}개 폴더"]
    if mode == "service":
        steps.append("포털 서비스로 실행 중 → 서버는 유지(정지는 포털 관리자 화면)")
    else:
        steps += [f"서버 종료 · 포트 {', '.join(map(str, DEV_PORTS))} 정리", "명령 창 닫기"]
        threading.Thread(target=_shutdown_dev, daemon=True).start()
    return {"ok": True, "mode": mode, "steps": steps}


# ---------------- 업데이트 ----------------
def _upstream() -> str:
    code, out = _git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    return out if code == 0 else ""


SERVICE_UPDATE_HELP = ("포털 서비스 계정은 앱 폴더에 쓸 수 없어(data·logs 만 쓰기) 여기서는 적용할 수 없습니다.\n"
                       "이 PC에서 앱 폴더의 start.BAT(개발 모드)로 띄운 화면의 [업데이트]를 쓰거나,\n"
                       "apps\\arround-store 에서 git pull 후 포털에서 앱을 재시작하세요.")


def _check_readonly() -> dict:
    """서비스 계정은 .git 에 쓸 수 없어 fetch 대신 ls-remote(읽기 전용)로 원격 HEAD 만 비교한다."""
    up = _upstream()
    if not up:
        return {"ok": False, "message": "추적 중인 원격 브랜치가 없습니다."}
    remote, _, branch = up.partition("/")
    code, out = _git("ls-remote", remote, f"refs/heads/{branch}", timeout=60)
    if code != 0 or not out.split():
        return {"ok": False, "message": f"원격 저장소 확인 실패\n{out}"}
    remote_head = out.split()[0]
    _, local_head = _git("rev-parse", "HEAD")
    if remote_head == local_head.strip():
        return {"ok": True, "upstream": up, "commits": [], "count": 0, "localChanges": False}
    return {"ok": False, "message": f"새 버전이 있습니다 ({up} {remote_head[:7]}).\n\n{SERVICE_UPDATE_HELP}"}


@router.get("/api/update/check")
def api_update_check():
    if not (APP_DIR / ".git").exists():
        return {"ok": False, "message": "git 저장소가 아닙니다."}
    if _run_mode() == "service":
        return _check_readonly()
    code, out = _git("fetch", "--quiet", timeout=90)
    if code != 0:
        return {"ok": False, "message": f"원격 저장소 확인 실패\n{out}"}
    up = _upstream()
    if not up:
        return {"ok": False, "message": "추적 중인 원격 브랜치가 없습니다."}
    _, log = _git("log", "--pretty=format:%h %ad %s", "--date=short", f"HEAD..{up}")
    commits = [line for line in log.splitlines() if line.strip()]
    _, dirty = _git("status", "--porcelain", "--untracked-files=no")
    return {"ok": True, "upstream": up, "commits": commits, "count": len(commits),
            "localChanges": bool(dirty.strip())}


@router.post("/api/update/apply")
def api_update_apply():
    if _run_mode() == "service":
        return {"ok": False, "log": [], "message": SERVICE_UPDATE_HELP}
    log = []
    up = _upstream()
    _, before = _git("rev-parse", "HEAD")
    code, out = _git("pull", "--ff-only", timeout=180)
    log.append("$ git pull --ff-only")
    log.append(out or "(출력 없음)")
    if code != 0:
        return {"ok": False, "log": log,
                "message": "업데이트 실패. 이 PC에서 고친 파일이 원격과 겹치면 먼저 정리해야 합니다."}
    _, changed = _git("diff", "--name-only", before.strip(), "HEAD")
    files = [f for f in changed.splitlines() if f.strip()]
    log.append(f"변경 파일 {len(files)}개 ({up})")
    notes = []
    if any(f.endswith("requirements.txt") or f.endswith("package.json") for f in files):
        notes.append("의존성이 바뀌었습니다 → install.bat 을 다시 실행하세요.")
    if any(f.startswith("frontend/") for f in files):
        notes.append("화면 코드가 바뀌었습니다 → frontend 에서 npm run build 를 실행하세요.")
    return {"ok": True, "log": log, "files": files, "notes": notes}
