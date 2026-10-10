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

class LocationQuery(BaseModel):
    cx: float # 경도
    cy: float # 위도
    radius_m: int = 500

DATA_GO_KR_API_KEY = os.getenv("DATA_GO_KR_API_KEY")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Around Store API is running"}

@app.post("/api/analyze")
def analyze_revenue(query: LocationQuery):
    if not DATA_GO_KR_API_KEY:
        raise HTTPException(status_code=500, detail="Data.go.kr API Key is not set")
    
    # 상가업소 조회 (반경)
    url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius"
    params = {
        "serviceKey": DATA_GO_KR_API_KEY,
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
        if not items:
            return {"status": "no_data", "items": []}
            
        # 업종별 집계
        from collections import Counter
        sector_counter = Counter(item.get("indsLclsNm") for item in items if item.get("indsLclsNm"))
        
        total_stores = sum(sector_counter.values())
        top_sectors = [
            {"sector": sector, "count": count, "ratio": round((count / total_stores) * 100, 1)}
            for sector, count in sector_counter.most_common(5)
        ]
        
        # 가상의 예상 매출액 계산 (데이터포털에서는 실제 매출액을 제공하지 않으므로 상가 수 비례 산정 로직 적용)
        # TODO: 실제 매출액 분석 알고리즘 또는 외부 매출 데이터 결합
        estimated_monthly_revenue = total_stores * 3000000 
        
        return {
            "cx": query.cx,
            "cy": query.cy,
            "radius": query.radius_m,
            "total_stores": total_stores,
            "estimated_monthly_revenue": estimated_monthly_revenue,
            "top_sectors": top_sectors,
            "raw_items": items[:50] # 프론트엔드 지도 표시용
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 호출 오류: {str(e)}")
