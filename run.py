"""
상권분석(arround-store) 진입점. NSSM 이 이 파일을 실행한다.
- backend/main.py 의 FastAPI 앱(/api/*)을 그대로 쓰고
- frontend/dist (vite build 결과)를 같은 포트에서 정적 파일로 제공한다.
PORT 는 .env 를 따른다. 프론트를 고쳤다면 frontend 에서 `npm run build` 후 서비스를 재시작한다.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
DIST_DIR = BASE_DIR / "frontend" / "dist"

load_dotenv(BASE_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")  # DATA_GO_KR_API_KEY
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("APP_RUN_MODE", "service")  # [종료] 시 서버를 내리지 않는다 (backend/app_control.py)

from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from main import app  # noqa: E402  (.env 로드 후 import)

# backend 의 "/" 상태 JSON 은 화면(index.html)에 자리를 내주고, 상태 확인은 /health 로 옮긴다
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/"]


@app.get("/health")
def _health():
    return JSONResponse({"status": "ok", "app": os.getenv("APP_NAME", BASE_DIR.name)})


if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def _spa(path: str):
        f = (DIST_DIR / path).resolve()
        if path and f.is_file() and DIST_DIR.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST_DIR / "index.html")

PORT = int(os.environ["PORT"])
HOST = os.getenv("BIND_HOST", "127.0.0.1")

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
