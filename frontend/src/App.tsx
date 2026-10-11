import React, { useState, useEffect } from 'react';
import { Map, MapMarker, Circle, Polygon, Rectangle, CustomOverlayMap, useKakaoLoader } from 'react-kakao-maps-sdk';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import ApiTestPanel from './ApiTestPanel';
import AppToolbar from './AppToolbar';

ChartJS.register(ArcElement, Tooltip, Legend);

const parseWKTPolygon = (wkt: string) => {
  if (!wkt || !wkt.startsWith('POLYGON')) return [];
  const coordsString = wkt.replace('POLYGON', '').trim().replace(/^\(\(|\)\)$/g, '');
  const points = coordsString.split(',').map(point => point.trim());
  return points.map(point => {
    const [lng, lat] = point.split(' ');
    if (!lat || !lng) return null;
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }).filter((p: any) => p !== null && !isNaN(p.lat) && !isNaN(p.lng)) as { lat: number, lng: number }[];
};

const KAKAO_LIBRARIES = ['services', 'clusterer'] as const;

function App() {
  const [revenueData, setRevenueData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapInstance, setMapInstance] = useState<any>(null);

  const [loading, error] = useKakaoLoader({
    appkey: import.meta.env.VITE_KAKAO_MAP_API_KEY,
    libraries: KAKAO_LIBRARIES as any,
  });
  
  useEffect(() => {
    if (loading) {
      setMapLoaded(false);
      setMapError("");
    } else if (error) {
      setMapLoaded(false);
      setMapError(`카카오맵 스크립트를 불러오지 못했습니다. 도메인(${window.location.origin}) 등록 또는 API 키를 확인해주세요.`);
    } else {
      setMapLoaded(true);
      setMapError("");
    }
  }, [loading, error]);
  
  // 기본 중심: 위치 정보를 허용하지 않았을 때의 기본값 (강남역)
  // 기본 중심: 구글 코리아 (PC 기본값)
  const [center, setCenter] = useState({ lat: 37.5000, lng: 127.0365 });
  const [radius, setRadius] = useState(300); // 300m 반경
  const [divId, setDivId] = useState("1168064000"); // 기본 행정동 코드
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [locationSource, setLocationSource] = useState<string>('');

  const analyzeRevenue = async (cx: number, cy: number, r?: number) => {
    setIsLoading(true);
    try {
      const response = await axios.post('/api/analyze', {
        cx: cx,
        cy: cy,
        radius_m: r || radius
      });
      setRevenueData(response.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("데이터를 불러오는데 실패했습니다. (API 키 및 백엔드 실행 여부를 확인하세요)");
    } finally {
      setIsLoading(false);
    }
  };

  // 모바일 기기(폰 모드) 판별
  const checkIsMobile = () => {
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const isSmallTouch = (window.innerWidth <= 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
    return isMobileUA || isSmallTouch;
  };

  // 폰 모드(GPS) vs PC 모드(구글 위치값) 초기 위치 획득
  const initLocation = async () => {
    const isMobile = checkIsMobile();

    if (isMobile) {
      // 1. [폰 모드]: 기기 GPS 하드웨어 센서 우선 활용
      setLocationSource('📱 폰 모드 (GPS)');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setCenter({ lat, lng });
            analyzeRevenue(lng, lat);
          },
          (error) => {
            console.warn("모바일 GPS 수신 실패 또는 권한 미허용, 기본값 사용:", error);
            analyzeRevenue(center.lng, center.lat);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        analyzeRevenue(center.lng, center.lat);
      }
    } else {
      // 2. [PC 모드]: 크롬/브라우저 구글 위치 서비스 및 IP 기반 구글 위치값 활용
      setLocationSource('💻 PC 모드 (구글 위치)');
      let resolved = false;

      // 브라우저의 구글 네트워크 위치 서비스 시도 (enableHighAccuracy: false로 빠른 조회)
      const tryBrowserGoogleLocation = () => {
        return new Promise<boolean>((resolve) => {
          if (!navigator.geolocation) return resolve(false);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolved = true;
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              setCenter({ lat, lng });
              analyzeRevenue(lng, lat);
              resolve(true);
            },
            () => resolve(false),
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
          );
        });
      };

      const success = await tryBrowserGoogleLocation();

      // 브라우저 위치 권한 거부 또는 실패 시 백엔드 구글 IP 위치 API 호출
      if (!success && !resolved) {
        try {
          const res = await axios.get('/api/google-location');
          if (res.data && res.data.lat && res.data.lng) {
            const lat = res.data.lat;
            const lng = res.data.lng;
            setCenter({ lat, lng });
            analyzeRevenue(lng, lat);
            resolved = true;
          }
        } catch (e) {
          console.warn("구글 IP 위치 조회 실패:", e);
        }
      }

      // 최후의 기본값: 구글 코리아 (37.5000, 127.0365)
      if (!resolved) {
        setCenter({ lat: 37.5000, lng: 127.0365 });
        analyzeRevenue(127.0365, 37.5000);
      }
    }
  };

  // 초기 시작 시 위치 감지 실행
  useEffect(() => {
    initLocation();
  }, []);

  // 중심 좌표가 바뀔 때마다 카카오 지오코더를 이용해 행정동 코드(divId) 및 상세 도로명/지번 주소 알아내기
  useEffect(() => {
    if (mapLoaded && window.kakao && window.kakao.maps && window.kakao.maps.services) {
      const geocoder = new window.kakao.maps.services.Geocoder();
      // 1. 행정동 코드
      geocoder.coord2RegionCode(center.lng, center.lat, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          const region = result.find((r: any) => r.region_type === 'H') || result[0];
          if (region && region.code) {
            setDivId(region.code);
          }
        }
      });
      // 2. 주소 텍스트 (도로명 또는 지번)
      geocoder.coord2Address(center.lng, center.lat, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK && result[0]) {
          const road = result[0].road_address?.address_name;
          const jibun = result[0].address?.address_name;
          setCurrentAddress(road || jibun || '');
        }
      });
    }
  }, [center, mapLoaded]);

  const handleMapClick = async (_t: any, mouseEvent: any) => {
    const lat = mouseEvent.latLng.getLat();
    const lng = mouseEvent.latLng.getLng();
    setCenter({ lat, lng });
    setLocationSource('📍 지도 직접 선택');
    setSelectedZone(null); // 다른 곳 클릭 시 선택된 상권 초기화
    setSelectedStore(null);
    setMapLevel(4);
    analyzeRevenue(lng, lat);
  };

  const [activeTab, setActiveTab] = useState<'revenue' | 'apiTest'>('revenue');
  const [cameFromApiList, setCameFromApiList] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null); // 클릭한 상권 영역 저장
  const [selectedStore, setSelectedStore] = useState<any>(null); // 클릭한 개별 상가 정보 저장
  const [mapLevel, setMapLevel] = useState(4); // 지도의 줌 레벨
  const [, setIsMenuOpen] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState<string>('');
  const [apiParams, setApiParams] = useState<Record<string, string>>({});
  const [selectedApiIdx, setSelectedApiIdx] = useState<number>(0);

  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<'address' | 'store'>('address');
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    if (searchMode === 'address') {
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(searchQuery, (result: any, status: any) => {
        setIsSearching(false);
        if (status === window.kakao.maps.services.Status.OK) {
          setSearchResults(result);
        } else {
          setSearchResults([]);
          alert("검색 결과가 없습니다.");
        }
      });
    } else {
      const ps = new window.kakao.maps.services.Places();
      const options = mapInstance ? { bounds: mapInstance.getBounds() } : undefined;
      ps.keywordSearch(searchQuery, (result: any, status: any) => {
        setIsSearching(false);
        if (status === window.kakao.maps.services.Status.OK) {
          setSearchResults(result);
        } else {
          setSearchResults([]);
          alert("현재 지도 영역 내에 검색 결과가 없습니다.");
        }
      }, options);
    }
  };

  const handleSelectSearchResult = (item: any) => {
    const lat = parseFloat(item.y);
    const lng = parseFloat(item.x);
    setCenter({ lat, lng });
    setLocationSource(searchMode === 'store' ? '🏬 상호 검색' : '🏠 주소 검색');
    setSelectedZone(null);
    setMapLevel(searchMode === 'store' ? 2 : 4);
    
    if (searchMode === 'store') {
      setSelectedStore({ lat: item.y, lon: item.x, bizesNm: item.place_name });
    } else {
      setSelectedStore(null);
    }
    
    setActiveTab('revenue');
    analyzeRevenue(lng, lat);
    setIsAddressModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleApiIndexChange = React.useCallback((idx: number) => {
    setSelectedApiIdx(idx);
  }, []);

  const handleStateChange = React.useCallback((endpoint: string, params: Record<string, string>) => {
    setApiEndpoint(endpoint);
    setApiParams(params);
  }, []);

  const handleRadiusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRadius = Number(e.target.value);
    setRadius(newRadius);
    if (revenueData) {
      analyzeRevenue(center.lng, center.lat, newRadius);
    }
  };

  const handleZoneClick = (zone: any) => {
    if (zone.coords) {
      const points = parseWKTPolygon(zone.coords);
      if (points.length > 0) {
        let latSum = 0;
        let lngSum = 0;
        points.forEach((p: any) => {
          latSum += p.lat;
          lngSum += p.lng;
        });
        const centerLat = latSum / points.length;
        const centerLng = lngSum / points.length;
        
        setCameFromApiList(true);
        setSelectedZone(zone); // 클릭한 상권 저장
        setSelectedStore(null);
        setMapLevel(4);
        setCenter({ lat: centerLat, lng: centerLng });
        setActiveTab('revenue');
        analyzeRevenue(centerLng, centerLat);
      }
    }
  };

  const handleStoreClick = (store: any) => {
    if (store.lat && store.lon) {
      const lat = parseFloat(store.lat);
      const lng = parseFloat(store.lon);
      setSelectedStore(store);
      setSelectedZone(null);
      setMapLevel(2); // 줌인
      setCenter({ lat, lng });
      // 모바일에서는 지도를 봐야 하므로 메뉴를 닫습니다 (데스크탑은 사이드바 유지)
      if (window.innerWidth < 768) {
        setIsMenuOpen(false);
      }
    }
  };

  const polygonsPaths = React.useMemo(() => {
    if (!revenueData?.polygons) return [];
    return revenueData.polygons.map((polygon: any) => parseWKTPolygon(polygon.coords));
  }, [revenueData?.polygons]);



  const chartData = React.useMemo(() => {
    if (!revenueData?.top_sectors) return null;
    return {
      labels: revenueData.top_sectors.map((s: any) => s.sector),
      datasets: [
        {
          data: revenueData.top_sectors.map((s: any) => s.count),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)', 
            'rgba(16, 185, 129, 0.8)', 
            'rgba(245, 158, 11, 0.8)', 
            'rgba(239, 68, 68, 0.8)', 
            'rgba(139, 92, 246, 0.8)', 
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [revenueData?.top_sectors]);

  const chartOptions = React.useMemo(() => ({
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { position: 'right' as const }
    }
  }), []);

  const circleCenter = React.useMemo(() => ({
    lat: activeTab === 'apiTest' && apiParams.cy ? parseFloat(apiParams.cy) : center.lat,
    lng: activeTab === 'apiTest' && apiParams.cx ? parseFloat(apiParams.cx) : center.lng
  }), [activeTab, apiParams.cx, apiParams.cy, center]);

  const rectBounds = React.useMemo(() => ({
    sw: { lat: parseFloat(apiParams.miny || "0"), lng: parseFloat(apiParams.minx || "0") },
    ne: { lat: parseFloat(apiParams.maxy || "0"), lng: parseFloat(apiParams.maxx || "0") },
  }), [apiParams.miny, apiParams.minx, apiParams.maxy, apiParams.maxx]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-gray-100">
      <AppToolbar />
      {/* Sidebar */}
      <div className="w-full md:w-1/3 h-1/2 md:h-full p-3 md:p-4 bg-white shadow-lg z-10 flex flex-col overflow-hidden">
        
        {/* Tabs / Header */}
        <div className="flex items-center justify-between border-b border-gray-200 mb-3 shrink-0 relative">
          
          {/* Desktop Tabs */}
          <div className="hidden md:flex w-full">
            <div className={`flex-1 flex items-center justify-center border-b-2 transition-colors ${activeTab === 'revenue' ? 'border-blue-600' : 'border-transparent'}`}>
              <button 
                onClick={() => setActiveTab('revenue')}
                className={`py-2 text-sm font-bold transition-colors ${activeTab === 'revenue' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                상권분석
              </button>
              <div className="ml-2 flex items-center">
                <select 
                  value={radius} 
                  onChange={handleRadiusChange}
                  className="border border-blue-200 text-blue-800 bg-blue-50 rounded px-1 py-0.5 text-xs outline-none cursor-pointer focus:ring-1 focus:ring-blue-400 font-normal"
                  title="검색 반경 선택"
                >
                  <option value={3}>반경 3m</option>
                  <option value={10}>반경 10m</option>
                  <option value={20}>반경 20m</option>
                  <option value={50}>반경 50m</option>
                  <option value={100}>반경 100m</option>
                  <option value={300}>반경 300m</option>
                  <option value={500}>반경 500m</option>
                  <option value={1000}>반경 1000m</option>
                  <option value={2000}>반경 2000m</option>
                </select>
                <div className="ml-2 flex items-center space-x-1">
                  <button 
                    onClick={() => { setSearchMode('address'); setIsAddressModalOpen(true); }}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded flex items-center justify-center transition-colors shadow-sm text-xs font-bold"
                    title="주소로 검색"
                  >
                    주소 🔍
                  </button>
                  <button 
                    onClick={() => { setSearchMode('store'); setIsAddressModalOpen(true); }}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded flex items-center justify-center transition-colors shadow-sm text-xs font-bold"
                    title="상호로 검색"
                  >
                    상호 🔍
                  </button>
                  <a 
                    href="/도움말.html" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded flex items-center justify-center transition-colors shadow-sm text-xs font-bold whitespace-nowrap no-underline"
                    title="공공데이터 산출 근거 및 도움말"
                  >
                    도움말 ❓
                  </a>
                </div>
              </div>
            </div>
            <div className={`flex items-center space-x-1 ml-2 border-b-2 transition-colors border-transparent shrink-0 pb-1`}>
              <button 
                onClick={() => { setActiveTab('apiTest'); setSelectedApiIdx(0); }}
                className={`py-1.5 px-3 text-xs font-bold rounded transition-colors ${activeTab === 'apiTest' && selectedApiIdx === 0 ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                title="상권조회"
              >
                상권 🔍
              </button>
              <button 
                onClick={() => { setActiveTab('apiTest'); setSelectedApiIdx(1); }}
                className={`py-1.5 px-3 text-xs font-bold rounded transition-colors ${activeTab === 'apiTest' && selectedApiIdx === 1 ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                title="업종조회"
              >
                업종 🔍
              </button>
            </div>
          </div>

          {/* Mobile Header (햄버거 메뉴) */}
          <div className="flex md:hidden w-full items-center justify-between py-2">
            <div className="flex items-center">
              <button 
                onClick={() => setActiveTab('revenue')}
                className={`text-sm font-bold text-left focus:outline-none flex items-center transition-colors ${activeTab === 'revenue' ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'}`}
                title="상권분석으로 돌아가기"
              >
                {activeTab !== 'revenue' && (
                  <svg className="w-4 h-4 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                  </svg>
                )}
                상권분석
              </button>
              <div className="ml-2 flex items-center">
                <select 
                  value={radius} 
                  onChange={handleRadiusChange}
                  className="border border-blue-200 text-blue-800 bg-blue-50 rounded px-1 py-0.5 text-xs outline-none cursor-pointer focus:ring-1 focus:ring-blue-400 font-normal shrink-0"
                  title="검색 반경 선택"
                >
                  <option value={3}>반경 3m</option>
                  <option value={10}>반경 10m</option>
                  <option value={20}>반경 20m</option>
                  <option value={50}>반경 50m</option>
                  <option value={100}>반경 100m</option>
                  <option value={300}>반경 300m</option>
                  <option value={500}>반경 500m</option>
                  <option value={1000}>반경 1000m</option>
                  <option value={2000}>반경 2000m</option>
                </select>
                <span className="ml-1.5 text-[10px] text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded font-semibold tracking-tighter shrink-0">지도클릭</span>
                <div className="ml-1.5 flex items-center space-x-1">
                  <button 
                    onClick={() => { setSearchMode('address'); setIsAddressModalOpen(true); }}
                    className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center justify-center transition-colors shadow-sm text-[10px] font-bold"
                    title="주소로 검색"
                  >
                    주소 🔍
                  </button>
                  <button 
                    onClick={() => { setSearchMode('store'); setIsAddressModalOpen(true); }}
                    className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center justify-center transition-colors shadow-sm text-[10px] font-bold"
                    title="상호로 검색"
                  >
                    상호 🔍
                  </button>
                  <a 
                    href="/도움말.html" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded flex items-center justify-center transition-colors shadow-sm text-[10px] font-bold whitespace-nowrap no-underline"
                    title="공공데이터 산출 근거 및 도움말"
                  >
                    도움말 ❓
                  </a>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button 
                onClick={() => { setActiveTab('apiTest'); setSelectedApiIdx(0); }}
                className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded flex items-center justify-center transition-colors shadow-sm text-[10px] font-bold"
                title="상권조회"
              >
                상권 🔍
              </button>
              <button 
                onClick={() => { setActiveTab('apiTest'); setSelectedApiIdx(1); }}
                className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded flex items-center justify-center transition-colors shadow-sm text-[10px] font-bold"
                title="업종조회"
              >
                업종 🔍
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className={activeTab === 'revenue' ? 'block' : 'hidden'}>
            {/* 현재 분석 위치 및 주소 표시 카드 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-lg p-2.5 mb-2.5 flex items-center justify-between text-xs shadow-sm">
              <div className="flex items-center min-w-0 pr-2">
                <span className="text-base mr-1.5 shrink-0">📍</span>
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1.5">
                    <span>현재 분석 위치 ({radius}m 반경)</span>
                    {locationSource && (
                      <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${locationSource.includes('GPS') ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {locationSource}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-gray-800 text-xs truncate mt-0.5" title={currentAddress || '위치 확인 중...'}>
                    {currentAddress || '주소 정보를 조회 중입니다...'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => initLocation()}
                className="shrink-0 text-[10px] bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 rounded px-2 py-1 font-semibold transition-colors shadow-2xs cursor-pointer"
                title="내 위치 다시 가져오기"
              >
                재탐색 🔄
              </button>
            </div>

            {cameFromApiList && (
              <button 
                onClick={() => {
                  setActiveTab('apiTest');
                  setCameFromApiList(false);
                  setSelectedZone(null);
                  setSelectedStore(null);
                }}
                className="mb-3 flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded transition-colors w-fit border border-indigo-100 shadow-sm"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
                이전 리스트로 돌아가기
              </button>
            )}

            {isLoading && !revenueData && (
              <div className="flex justify-center my-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            )}

            {revenueData && (
              <div className={`border-t pt-3 transition-opacity duration-300 relative ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100 animate-fade-in'}`}>
                {isLoading && (
                  <div className="absolute inset-0 flex justify-center items-center z-10 bg-white/50 rounded">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100 flex flex-col justify-center">
                    <p className="text-blue-800 text-[10px] font-medium">선택 반경 내 상가 수</p>
                    <p className="text-lg font-extrabold text-blue-900 mt-0.5">
                      {revenueData.total_stores} <span className="text-[10px] font-normal">개</span>
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 p-2.5 rounded-lg flex flex-col justify-center border border-gray-200">
                    <p className="text-gray-600 text-[10px]">추정 상권 규모 (월간)</p>
                    <p className="text-[13px] font-bold text-gray-900 mt-0.5 break-keep">
                      {revenueData.estimated_monthly_revenue ? revenueData.estimated_monthly_revenue.toLocaleString() : 0} 원
                    </p>
                  </div>
                </div>
                <p className="text-[9px] text-gray-400 mb-3 text-right">* 공공데이터 상가 업소 수를 기반으로 한 추정치입니다.</p>
                
                <h3 className="font-semibold text-gray-800 mb-2 text-sm">주요 업종 밀집도 (Top 5)</h3>
                <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100 flex justify-center">
                  {revenueData.top_sectors && revenueData.top_sectors.length > 0 ? (
                    <div className="w-full h-48 relative flex justify-center">
                      {chartData && (
                        <Doughnut 
                          data={chartData}
                          options={chartOptions}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs">표시할 업종 데이터가 없습니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`${activeTab === 'apiTest' ? 'block' : 'hidden'}`}>
            <ApiTestPanel 
              center={center} 
              divId={divId} 
              radius={radius}
              forceApiIdx={selectedApiIdx}
              onApiIndexChange={handleApiIndexChange}
              onStateChange={handleStateChange}
              onZoneClick={handleZoneClick}
              onStoreClick={handleStoreClick}
            />
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="w-full md:flex-1 relative h-1/2 md:h-full border-t md:border-t-0 md:border-l border-gray-300 bg-gray-200 flex items-center justify-center">
        {/* 폰 모드 전용 안내 문구 */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-50 md:hidden pointer-events-none">
          <span className="font-bold bg-white/70 px-1.5 py-0.5 rounded shadow-sm" style={{ fontSize: '10pt', color: '#ec4899' }}>
            휠이나 두손가락으로 지도조절
          </span>
        </div>
        {!mapLoaded && !mapError && (
          <div className="text-gray-500 font-bold animate-pulse text-lg">카카오 지도를 불러오는 중입니다...</div>
        )}
        {mapError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-lg max-w-md text-center">
            <h3 className="font-bold text-xl mb-2">지도 로드 실패</h3>
            <p>{mapError}</p>
            <p className="mt-2 text-sm text-red-600">※ 카카오 개발자 콘솔에서 <strong>JavaScript 키</strong>가 맞는지, <strong>{window.location.origin}</strong> 도메인이 정확히 등록되었는지 확인하세요.</p>
          </div>
        )}
        {mapLoaded && (
        <Map
          center={center}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          level={mapLevel}
          onClick={handleMapClick}
          onCreate={setMapInstance}
        >
          {/* 중심 마커 */}
          <MapMarker position={center} />
          
          {/* 반경 표시기 (주변 상권 분석이거나 API테스트 중 반경 파라미터가 있을 때) */}
          {(activeTab === 'revenue' || (activeTab === 'apiTest' && apiParams.radius !== undefined)) && (
            <Circle
              center={circleCenter}
              radius={activeTab === 'apiTest' && apiParams.radius ? parseInt(apiParams.radius) : radius}
              strokeWeight={2}
              strokeColor={"#3b82f6"}
              strokeOpacity={0.8}
              strokeStyle={"solid"}
              fillColor={"#3b82f6"}
              fillOpacity={0.2} 
            />
          )}

          {/* 사각형 표시기 (API테스트에서 사각형 조회 선택 시) */}
          {activeTab === 'apiTest' && apiEndpoint === 'storeListInRectangle' && (
            <Rectangle
              bounds={rectBounds}
              strokeWeight={2}
              strokeColor={"#10b981"}
              strokeOpacity={0.8}
              strokeStyle={"solid"}
              fillColor={"#10b981"}
              fillOpacity={0.2}
            />
          )}



          {/* 주요상권 다각형 표시 (backend 에서 조회된 것들) */}
          {polygonsPaths.map((path: any, idx: number) => (
            <Polygon
              key={`polygon-${idx}`}
              path={path}
              strokeWeight={3}
              strokeColor={"#FF0000"}
              strokeOpacity={0.8}
              strokeStyle={"solid"}
              fillColor={"#FF0000"}
              fillOpacity={0.2}
            />
          ))}

          {/* 클릭해서 선택된 상권 다각형 표시 (backend 검색 범위 밖이더라도 표시) */}
          {selectedZone && selectedZone.coords && (
            <Polygon
              path={parseWKTPolygon(selectedZone.coords)}
              strokeWeight={4}
              strokeColor={"#8b5cf6"}
              strokeOpacity={1.0}
              strokeStyle={"solid"}
              fillColor={"#8b5cf6"}
              fillOpacity={0.4}
            />
          )}

          {/* 클릭해서 선택된 개별 상가 마커 표시 (깜박이는 빨간 마커) */}
          {selectedStore && selectedStore.lat && selectedStore.lon && (
            <CustomOverlayMap
              position={{ lat: parseFloat(selectedStore.lat), lng: parseFloat(selectedStore.lon) }}
              yAnchor={1} // 마커의 꼬리가 위치에 닿도록 하단 기준
            >
              <div className="relative flex justify-center items-center -mt-2">
                <div className="absolute animate-ping w-8 h-8 rounded-full bg-red-500 opacity-75"></div>
                <div className="relative">
                  <svg className="w-8 h-8 text-red-600 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-6 bg-white px-2 py-0.5 rounded shadow text-xs font-bold text-gray-800 whitespace-nowrap border border-gray-200">
                    {selectedStore.bizesNm}
                  </div>
                </div>
              </div>
            </CustomOverlayMap>
          )}
        </Map>
        )}
      </div>

      {/* Address Search Modal */}
      {isAddressModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsAddressModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-sm text-gray-800">{searchMode === 'address' ? '주소 검색' : '상호 검색'}</h3>
              <button onClick={() => setIsAddressModalOpen(false)} className="text-gray-500 hover:text-gray-800 focus:outline-none">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={searchMode === 'address' ? "예: 강남대로, 역삼동" : "예: 스타벅스 강남역점"}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button 
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-bold disabled:bg-blue-300 transition-colors"
                >
                  {isSearching ? '검색중' : '검색'}
                </button>
              </div>
              
              <div className="max-h-60 overflow-y-auto mt-2 custom-scrollbar space-y-1">
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left p-2 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded transition-colors focus:outline-none focus:bg-blue-50"
                  >
                    {searchMode === 'address' ? (
                      <>
                        <div className="font-bold text-sm text-gray-800">{item.address_name}</div>
                        {item.road_address && (
                          <div className="text-[10px] text-gray-500 mt-0.5">도로명: {item.road_address.address_name}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="font-bold text-sm text-gray-800">{item.place_name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{item.address_name}</div>
                        {item.road_address_name && (
                          <div className="text-[10px] text-gray-400">도로명: {item.road_address_name}</div>
                        )}
                      </>
                    )}
                  </button>
                ))}
                {searchResults.length === 0 && !isSearching && searchQuery && (
                  <div className="text-center text-sm text-gray-500 py-4">검색 결과가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
