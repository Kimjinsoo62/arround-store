import React, { useState } from 'react';
import axios from 'axios';

interface ApiDef {
  name: string;
  endpoint: string;
  params: { key: string; label: string; default: string; type?: 'text' | 'select'; options?: {value: string; label: string}[] }[];
}

const UPJONG_OPTIONS = [
  { value: 'I2', label: '음식' },
  { value: 'G2', label: '소매' },
  { value: 'S2', label: '수리·개인' },
  { value: 'I1', label: '숙박' },
  { value: 'M1', label: '과학·기술' },
  { value: 'P1', label: '교육' },
  { value: 'Q1', label: '보건의료' },
  { value: 'L1', label: '부동산' },
  { value: 'N1', label: '시설관리·임대' },
  { value: 'R1', label: '예술·스포츠' }
];

export const apiList: ApiDef[] = [
  {
    name: "반경 내 주요상권 구역조회 (storeZone)",
    endpoint: "storeZoneInRadius",
    params: [
      { key: "cx", label: "경도 (cx)", default: "127.0371" },
      { key: "cy", label: "위도 (cy)", default: "37.5009" },
      { key: "radius", label: "반경 (m)", default: "1000" }
    ]
  },
  {
    name: "지도 반경 내 상가업소 및 업종 조회",
    endpoint: "storeListInRadius",
    params: [
      { key: "cx", label: "경도 (cx)", default: "127.0371" },
      { key: "cy", label: "위도 (cy)", default: "37.5009" },
      { key: "radius", label: "반경 (m)", default: "300" },
      { key: "indsLclsCd", label: "업종 대분류 (선택)", default: "", type: "select", options: UPJONG_OPTIONS }
    ]
  }
];

export default function ApiTestPanel({ center, divId, radius, onStateChange, forceApiIdx, onApiIndexChange, onZoneClick, onStoreClick }: { center: { lat: number, lng: number }, divId: string, radius?: number, onStateChange?: (endpoint: string, params: Record<string, string>) => void, forceApiIdx?: number, onApiIndexChange?: (idx: number) => void, onZoneClick?: (zone: any) => void, onStoreClick?: (store: any) => void }) {
  const [selectedApiIdx, setSelectedApiIdx] = useState(0);
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    apiList[0].params.forEach(p => {
      if (p.key === 'cx') init[p.key] = center.lng.toString();
      else if (p.key === 'cy') init[p.key] = center.lat.toString();
      else if (p.key === 'radius' && radius) init[p.key] = radius.toString();
      else if (p.key === 'minx') init[p.key] = (center.lng - 0.005).toFixed(4);
      else if (p.key === 'maxx') init[p.key] = (center.lng + 0.005).toFixed(4);
      else if (p.key === 'miny') init[p.key] = (center.lat - 0.005).toFixed(4);
      else if (p.key === 'maxy') init[p.key] = (center.lat + 0.005).toFixed(4);
      else if (p.key === 'key' && apiList[0].endpoint === 'storeListInDong') init[p.key] = divId.substring(0, 5);
      else init[p.key] = p.default;
    });
    return init;
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 외부에서 API 인덱스가 주입되면 동기화
  React.useEffect(() => {
    if (forceApiIdx !== undefined && forceApiIdx !== selectedApiIdx) {
      handleSelectApi({ target: { value: forceApiIdx.toString() } } as any);
    }
  }, [forceApiIdx]);

  // 지도의 중심이나 반경이 바뀌면 paramValues도 자동 업데이트
  React.useEffect(() => {
    setParamValues(prev => {
      const cx = center.lng.toString();
      const cy = center.lat.toString();
      const minx = (center.lng - 0.005).toFixed(4);
      const maxx = (center.lng + 0.005).toFixed(4);
      const miny = (center.lat - 0.005).toFixed(4);
      const maxy = (center.lat + 0.005).toFixed(4);
      const rStr = radius ? radius.toString() : undefined;

      let changed = false;
      if (prev.cx !== undefined && prev.cx !== cx) changed = true;
      if (prev.cy !== undefined && prev.cy !== cy) changed = true;
      if (prev.minx !== undefined && prev.minx !== minx) changed = true;
      if (prev.maxx !== undefined && prev.maxx !== maxx) changed = true;
      if (prev.miny !== undefined && prev.miny !== miny) changed = true;
      if (prev.maxy !== undefined && prev.maxy !== maxy) changed = true;
      if (rStr !== undefined && prev.radius !== undefined && prev.radius !== rStr) changed = true;

      if (!changed) return prev;

      return {
        ...prev,
        ...(prev.cx !== undefined ? { cx } : {}),
        ...(prev.cy !== undefined ? { cy } : {}),
        ...(prev.minx !== undefined ? { minx } : {}),
        ...(prev.maxx !== undefined ? { maxx } : {}),
        ...(prev.miny !== undefined ? { miny } : {}),
        ...(prev.maxy !== undefined ? { maxy } : {}),
        ...(prev.radius !== undefined && rStr !== undefined ? { radius: rStr } : {})
      };
    });
  }, [center, radius]);

  React.useEffect(() => {
    setParamValues(prev => {
      if (apiList[selectedApiIdx].endpoint === 'storeListInDong' && prev.key !== undefined) {
        // signguCd 기준이므로 앞 5자리(시군구코드)만 사용
        const newKey = divId.substring(0, 5);
        if (prev.key !== newKey) {
          return { ...prev, key: newKey };
        }
      }
      return prev;
    });
  }, [divId, selectedApiIdx]);

  React.useEffect(() => {
    if (onStateChange) {
      onStateChange(apiList[selectedApiIdx].endpoint, paramValues);
    }
    if (onApiIndexChange) {
      onApiIndexChange(selectedApiIdx);
    }
  }, [selectedApiIdx, paramValues, onStateChange, onApiIndexChange]);

  const currentApi = apiList[selectedApiIdx] || apiList[0];

  const handleSelectApi = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value);
    setSelectedApiIdx(idx);
    const newApi = apiList[idx];
    const initialParams: Record<string, string> = {};
    newApi.params.forEach(p => {
      if (p.key === 'cx') initialParams[p.key] = center.lng.toString();
      else if (p.key === 'cy') initialParams[p.key] = center.lat.toString();
      else if (p.key === 'radius' && radius) initialParams[p.key] = radius.toString();
      else if (p.key === 'minx') initialParams[p.key] = (center.lng - 0.005).toFixed(4);
      else if (p.key === 'maxx') initialParams[p.key] = (center.lng + 0.005).toFixed(4);
      else if (p.key === 'miny') initialParams[p.key] = (center.lat - 0.005).toFixed(4);
      else if (p.key === 'maxy') initialParams[p.key] = (center.lat + 0.005).toFixed(4);
      else if (p.key === 'key' && newApi.endpoint === 'storeListInDong') initialParams[p.key] = divId.substring(0, 5);
      else initialParams[p.key] = p.default;
    });
    setParamValues(initialParams);
    setResult(null);
  };

  const handleParamChange = (key: string, val: string) => {
    setParamValues(prev => ({ ...prev, [key]: val }));
  };

  const callApi = async () => {
    setLoading(true);
    setResult(null);
    try {
      const finalParams: Record<string, string> = {};
      currentApi.params.forEach(p => {
        const val = paramValues[p.key] !== undefined ? paramValues[p.key] : p.default;
        if (val !== "") {
          finalParams[p.key] = val;
        }
      });
      const q = new URLSearchParams(finalParams).toString();
      const res = await axios.get(`/api/sdsc2/${currentApi.endpoint}?${q}`);
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpjongClick = async (upjongCd: string) => {
    // "업종별 상가업소 조회"는 전국 단위라 인천부터 나오므로, 현재 위치 기반 "반경 내 상가업소 조회"로 전환하여 업종 코드를 주입함.
    const targetIdx = apiList.findIndex(a => a.endpoint === "storeListInRadius");
    if (targetIdx === -1) return;
    
    setSelectedApiIdx(targetIdx);
    
    // 새 파라미터 값 설정
    const newParams = { 
      ...paramValues, 
      indsLclsCd: upjongCd,
      cx: center.lng.toString(),
      cy: center.lat.toString(),
      radius: "1000" // 업종 검색 시 범위를 1000m로 넉넉하게 잡음
    };
    setParamValues(newParams);
    
    // API 바로 호출
    setLoading(true);
    setResult(null);
    try {
      // 빈 값 제거 후 전송
      const finalParams: Record<string, string> = {};
      apiList[targetIdx].params.forEach(p => {
        const paramsObj = newParams as Record<string, string>;
        const val = paramsObj[p.key] !== undefined ? paramsObj[p.key] : p.default;
        if (val !== "") {
          finalParams[p.key] = val;
        }
      });
      const q = new URLSearchParams(finalParams).toString();
      const res = await axios.get(`/api/sdsc2/storeListInRadius?${q}`);
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 결과값을 예쁘게 렌더링하는 함수
  const renderResult = () => {
    if (result?.error) {
      return (
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          <p className="font-bold">에러 발생:</p>
          <p>{result.error}</p>
        </div>
      );
    }

    const items = result?.body?.items || result?.items || [];
    const totalCount = result?.body?.totalCount || items.length;

    if (!result) return null;

    if (items.length === 0) {
      if (currentApi.endpoint === "storeZoneInRadius") {
        return (
          <div className="bg-red-50 text-red-600 font-bold p-4 rounded-md border border-red-200 text-center shadow-sm">
            등록된상권이 없어요 반경을 넓혀보세요
          </div>
        );
      }
      return (
        <div className="bg-gray-50 text-gray-500 p-4 rounded-md border border-gray-200 text-center">
          조회된 결과가 없습니다.
        </div>
      );
    }

    return (
      <div className="animate-fade-in mt-4">
        <div className="flex justify-between items-end mb-3 px-1">
          <h3 className="font-semibold text-gray-800">조회 결과</h3>
          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
            총 {totalCount}건
          </span>
        </div>
        <div className="space-y-2 pb-6">
          {items.map((item: any, idx: number) => {
            // 상가 정보 (storeList)
            if (item.bizesNm) {
              return (
                <div 
                  key={idx} 
                  className="bg-white p-2 rounded border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:bg-blue-50"
                  onClick={() => onStoreClick && onStoreClick(item)}
                  title="클릭하여 지도에서 위치 확인하기"
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-gray-900 text-sm">{item.bizesNm}</h4>
                    <span className="text-[9px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded">{item.indsLclsNm} {'>'} {item.indsMclsNm}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 break-keep">
                    {item.rdnmAdr || item.lnoAdr}
                  </p>
                  {item.bizesId && (
                    <p className="text-[10px] text-gray-400 mt-0.5">상가번호: {item.bizesId}</p>
                  )}
                </div>
              );
            }
            // 상권 정보 (storeZone)
            if (item.trarNo) {
              return (
                <div 
                  key={idx} 
                  className="bg-white p-2 rounded border border-gray-200 shadow-sm cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => onZoneClick && onZoneClick(item)}
                  title="클릭하여 해당 상권 영역 분석하기"
                >
                  <h4 className="font-bold text-blue-700 text-sm">{item.mainTrarNm || "상권명 없음"}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">상권번호: {item.trarNo}</p>
                </div>
              );
            }
            // 업종 정보 (UpjongList)
            if (item.indsLclsNm) {
              return (
                <div 
                  key={idx} 
                  className="bg-white p-2 rounded border border-gray-200 shadow-sm flex justify-between items-center cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => handleUpjongClick(item.indsLclsCd)}
                  title="클릭하여 해당 업종의 상가업소 바로 조회하기"
                >
                  <span className="font-semibold text-gray-800 text-sm">{item.indsLclsNm}</span>
                  <span className="text-[10px] text-blue-600 font-bold">{item.indsLclsCd}</span>
                </div>
              );
            }
            // 기타/기본 렌더링
            return (
              <div key={idx} className="bg-gray-50 p-1.5 rounded border border-gray-200 text-[10px] text-gray-700 font-mono break-all">
                {JSON.stringify(item)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {currentApi.params.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2 p-2 bg-gray-50 rounded border border-gray-200">
          {currentApi.params.map(p => (
            <div key={p.key}>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">{p.label}</label>
              {p.type === 'select' ? (
                <select
                  className="w-full border border-gray-300 p-1 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs bg-white"
                  value={paramValues[p.key] !== undefined ? paramValues[p.key] : p.default}
                  onChange={(e) => handleParamChange(p.key, e.target.value)}
                >
                  <option value="">전체 (선택 안함)</option>
                  {p.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  className="w-full border border-gray-300 p-1 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs"
                  value={paramValues[p.key] !== undefined ? paramValues[p.key] : p.default}
                  onChange={(e) => handleParamChange(p.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <button 
        onClick={callApi} 
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded shadow-sm disabled:bg-indigo-300 transition-colors text-sm"
      >
        {loading ? "불러오는 중..." : "선택한 API 호출"}
      </button>

      {/* 결과 렌더링 영역 */}
      <div className="flex-1 mt-2 overflow-hidden flex flex-col">
        {renderResult()}
      </div>
    </div>
  );
}
