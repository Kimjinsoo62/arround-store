import { useState } from 'react';
import { Map, MapMarker, Circle, CustomOverlayMap } from 'react-kakao-maps-sdk';
import axios from 'axios';

function App() {
  const [revenueData, setRevenueData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 기본 중심: 서울 강남구 테헤란로 근처
  const [center, setCenter] = useState({ lat: 37.5009, lng: 127.0371 });
  const [radius] = useState(500); // 500m 반경

  const handleMapClick = async (_t: any, mouseEvent: any) => {
    const lat = mouseEvent.latLng.getLat();
    const lng = mouseEvent.latLng.getLng();
    setCenter({ lat, lng });
    analyzeRevenue(lng, lat);
  };

  const analyzeRevenue = async (cx: number, cy: number) => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:8000/api/analyze', {
        cx: cx,
        cy: cy,
        radius_m: radius
      });
      setRevenueData(response.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("데이터를 불러오는데 실패했습니다. (API 키 및 백엔드 실행 여부를 확인하세요)");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/3 p-6 bg-white shadow-lg z-10 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">주변 상권 매출 분석</h1>
        <p className="text-sm text-gray-500 mb-6">지도에서 원하는 위치를 <strong>클릭</strong>하시면 주변 {radius}m 상권 데이터를 분석합니다.</p>

        {isLoading && (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {revenueData && !isLoading && (
          <div className="border-t pt-6 animate-fade-in">
            <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-100">
              <p className="text-blue-800 text-sm font-medium">선택 반경 내 상가 수</p>
              <p className="text-3xl font-extrabold text-blue-900 mt-1">
                {revenueData.total_stores} <span className="text-lg font-normal">개</span>
              </p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-gray-600 text-sm">추정 상권 규모 (월간 지표)</p>
              <p className="text-2xl font-bold text-gray-900">
                {revenueData.estimated_monthly_revenue.toLocaleString()} 원
              </p>
              <p className="text-xs text-gray-400 mt-2">* 공공데이터 상가 업소 수를 기반으로 한 추정치입니다.</p>
            </div>
            
            <h3 className="font-semibold text-gray-800 mb-3 text-lg">주요 업종 밀집도 (Top 5)</h3>
            <ul className="space-y-3">
              {revenueData.top_sectors?.map((sector: any, idx: number) => (
                <li key={idx} className="flex flex-col p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-700">{sector.sector}</span>
                    <span className="font-bold text-blue-600">{sector.ratio}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${sector.ratio}%` }}></div>
                  </div>
                  <span className="text-xs text-gray-400 mt-1 text-right">{sector.count}개 업소</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <Map
          center={center}
          style={{ width: '100%', height: '100%' }}
          level={4}
          onClick={handleMapClick}
        >
          {/* 중심 마커 */}
          <MapMarker position={center} />
          
          {/* 반경 표시기 */}
          <Circle
            center={center}
            radius={radius}
            strokeWeight={2}
            strokeColor={"#3b82f6"}
            strokeOpacity={0.8}
            strokeStyle={"solid"}
            fillColor={"#3b82f6"}
            fillOpacity={0.2} 
          />

          {/* 상가 위치 마커들 (최대 50개 샘플) */}
          {revenueData?.raw_items?.map((item: any, idx: number) => (
            <MapMarker
              key={idx}
              position={{ lat: parseFloat(item.lat), lng: parseFloat(item.lon) }}
              image={{
                src: "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png", 
                size: { width: 24, height: 35 }
              }}
              title={item.bizesNm}
            />
          ))}
        </Map>
      </div>
    </div>
  );
}

export default App;
