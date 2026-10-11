import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Around Store Revenue API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app_control import router as app_control_router  # [종료]·[업데이트] API
app.include_router(app_control_router)

class LocationQuery(BaseModel):
    cx: float # 경도
    cy: float # 위도
    radius_m: int = 300

DATA_GO_KR_API_KEY = os.getenv("DATA_GO_KR_API_KEY")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Around Store API is running"}

@app.get("/api/google-location")
def get_google_location():
    """PC 모드에서 IP 기반 구글 위치값 반환"""
    try:
        res = requests.get("https://ipwho.is/", timeout=3)
        if res.status_code == 200:
            data = res.json()
            if data.get("success", False) and data.get("latitude") and data.get("longitude"):
                return {
                    "source": "google_ip",
                    "lat": float(data.get("latitude")),
                    "lng": float(data.get("longitude")),
                    "city": data.get("city", "서울")
                }
    except Exception as e:
        print("IP location lookup failed:", e)
    
    # 기본값: 구글 코리아 (서울 강남파이낸스센터)
    return {
        "source": "google_default",
        "lat": 37.5000,
        "lng": 127.0365,
        "city": "서울 강남구 역삼동 (구글 코리아)"
    }

@app.post("/api/analyze")
def analyze_revenue(query: LocationQuery):
    if not DATA_GO_KR_API_KEY:
        raise HTTPException(status_code=500, detail="Data.go.kr API Key is not set")
    
    # 상가업소 조회 (반경)
    url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius"
    params = {
        "ServiceKey": DATA_GO_KR_API_KEY,
        "pageNo": "1",
        "numOfRows": "1000",
        "cx": str(query.cx),
        "cy": str(query.cy),
        "radius": str(query.radius_m),
        "type": "json"
    }
    
    try:
        response = requests.get(url, params=params, verify=False)
        data = response.json()
        
        items = data.get("body", {}).get("items", [])
        total_count_from_api = data.get("body", {}).get("totalCount", len(items))
        
        if not items:
            return {"status": "no_data", "items": []}
            
        # 업종별 집계 (최대 1000개 샘플 기준)
        from collections import Counter
        sector_counter = Counter(item.get("indsLclsNm") for item in items if item.get("indsLclsNm"))
        
        sample_total = sum(sector_counter.values())
        top_sectors = [
            {"sector": sector, "count": int(count * (total_count_from_api / sample_total)) if sample_total > 0 else count, "ratio": round((count / sample_total) * 100, 1)}
            for sector, count in sector_counter.most_common(5)
        ]
        
        # 업종별 예상 평균 월 매출액 가중치 (가상의 데이터)
        revenue_weights = {
            "음식": 45000000,
            "소매": 25000000,
            "서비스": 15000000,
            "학문/교육": 12000000,
            "숙박": 50000000,
            "관광/여가/오락": 20000000,
            "부동산": 8000000,
            "생활서비스": 10000000
        }
        
        # 샘플 1000개에 대한 매출액 합산
        sample_revenue = 0
        for item in items:
            sector = item.get("indsLclsNm", "")
            sample_revenue += revenue_weights.get(sector, 10000000)
            
        # 전체 상가 수에 비례하여 매출액 스케일링
        estimated_monthly_revenue = int(sample_revenue * (total_count_from_api / max(1, sample_total)))
        
        # 상권 다각형 조회 (storeZoneInRadius)
        zone_url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeZoneInRadius"
        # 반경이 너무 작으면(예: 100m) 상권 구역이 안 나올 수 있으므로 구역 조회 시에는 최소 500m 사용
        zone_radius = max(query.radius_m, 500)
        zone_params = {
            "ServiceKey": DATA_GO_KR_API_KEY,
            "pageNo": "1",
            "numOfRows": "50",
            "cx": str(query.cx),
            "cy": str(query.cy),
            "radius": str(zone_radius),
            "type": "json"
        }
        
        polygons = []
        try:
            zone_response = requests.get(zone_url, params=zone_params, verify=False, timeout=5)
            zone_data = zone_response.json()
            zone_items = zone_data.get("body", {}).get("items", [])
            for z_item in zone_items:
                if "coords" in z_item:
                    polygons.append({
                        "trarNo": z_item.get("trarNo"),
                        "mainTrarNm": z_item.get("mainTrarNm"),
                        "coords": z_item.get("coords")
                    })
        except Exception as e:
            print("Failed to fetch zone polygons:", e)
        
        return {
            "cx": query.cx,
            "cy": query.cy,
            "radius": query.radius_m,
            "total_stores": total_count_from_api,
            "estimated_monthly_revenue": estimated_monthly_revenue,
            "top_sectors": top_sectors,
            "raw_items": items[:50], # 프론트엔드 지도 표시용
            "polygons": polygons
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 호출 오류: {str(e)}")

from fastapi import Request

@app.get("/api/sdsc2/{endpoint}")
async def proxy_sdsc2(endpoint: str, request: Request):
    if not DATA_GO_KR_API_KEY:
        raise HTTPException(status_code=500, detail="Data.go.kr API Key is not set")
    
    url = f"https://apis.data.go.kr/B553077/api/open/sdsc2/{endpoint}"
    
    # 전달받은 query params 복사
    params = dict(request.query_params)
    params["ServiceKey"] = DATA_GO_KR_API_KEY
    if "type" not in params:
        params["type"] = "json"
        
    try:
        response = requests.get(url, params=params, verify=False)
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 호출 오류: {str(e)}")
