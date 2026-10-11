import { useState } from 'react';
import axios from 'axios';
import { HDR_BTN, BTN_VARIANT } from './ui';

// 상단 메뉴 2행의 [업데이트] [설명서] [종료] — 서버 API 는 backend/app_control.py
// 버튼 3개를 그대로 내보내 부모 grid 의 칸에 들어간다 (팝업은 fixed 라 칸을 차지하지 않음)
type Popup =
  | { kind: 'msg'; title: string; body: string }
  | { kind: 'confirm'; commits: string[]; localChanges: boolean }
  | { kind: 'progress'; title: string; log: string[]; done: boolean; ok?: boolean; notes?: string[] };

const btn = 'px-2 py-0.5 rounded text-[10px] font-bold shadow-sm border transition-colors disabled:opacity-50';

async function clearClientCaches() {
  try { sessionStorage.clear(); } catch { /* 무시 */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* 무시 */ }
}

export default function AppToolbar() {
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [closed, setClosed] = useState<string[] | null>(null);

  const checkUpdate = async () => {
    setBusy(true);
    setPopup({ kind: 'progress', title: '업데이트 확인 중', log: ['$ git fetch'], done: false });
    try {
      const { data } = await axios.get('/api/update/check');
      if (!data.ok) setPopup({ kind: 'msg', title: '업데이트 확인 실패', body: data.message });
      else if (data.count === 0) setPopup({ kind: 'msg', title: '최신 버전', body: '이미 최신 버전입니다.' });
      else setPopup({ kind: 'confirm', commits: data.commits, localChanges: data.localChanges });
    } catch (e: any) {
      setPopup({ kind: 'msg', title: '업데이트 확인 실패', body: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = async () => {
    setBusy(true);
    setPopup({ kind: 'progress', title: '업데이트 적용 중', log: ['$ git pull --ff-only'], done: false });
    try {
      const { data } = await axios.post('/api/update/apply');
      setPopup({
        kind: 'progress', done: true, ok: data.ok, log: data.log ?? [],
        title: data.ok ? '업데이트 완료, 앱을 재시작하세요' : '업데이트 실패',
        notes: data.ok ? data.notes : [data.message],
      });
    } catch (e: any) {
      setPopup({ kind: 'progress', title: '업데이트 실패', log: [e?.message ?? String(e)], done: true, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const shutdown = async () => {
    if (!confirm('앱을 종료할까요?\n\n• 캐시 삭제\n• 서버 종료 · 포트 정리\n• 명령 창 닫기\n• 브라우저 닫기')) return;
    setBusy(true);
    await clearClientCaches();
    let steps: string[] = ['서버 응답 없음 (이미 종료되었을 수 있음)'];
    try {
      const { data } = await axios.post('/api/shutdown');
      steps = data.steps ?? steps;
    } catch { /* 서버가 바로 내려가도 정상 */ }
    setTimeout(() => {
      try { window.open('', '_self'); window.close(); } catch { /* 무시 */ }
      setClosed(steps); // 스크립트로 연 창이 아니면 닫히지 않으므로 안내 화면을 띄운다
    }, 400);
  };

  if (closed) {
    return (
      <div className="fixed inset-0 z-[100] bg-gray-100 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded shadow p-4 text-xs text-gray-700 min-w-[260px]">
          <div className="font-bold text-sm mb-2">상권분석을 종료했습니다</div>
          <ul className="list-disc pl-4 mb-2">{closed.map(s => <li key={s}>{s}</li>)}</ul>
          <div className="text-gray-500">이 탭(브라우저)을 닫아 주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button onClick={checkUpdate} disabled={busy} title="GitHub 에서 새 버전 확인" className={`${HDR_BTN} ${BTN_VARIANT.normal}`}>업데이트</button>
      <a href="/사용설명서.html" target="_blank" rel="noopener noreferrer" title="사용설명서 (새 탭)" className={`${HDR_BTN} ${BTN_VARIANT.normal}`}>설명서</a>
      <button onClick={shutdown} disabled={busy} title="앱 종료" className={`${HDR_BTN} ${BTN_VARIANT.danger}`}>종료</button>

      {popup && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-lg w-full max-w-md text-xs text-gray-800">
            <div className="px-3 py-2 border-b font-bold text-sm">
              {popup.kind === 'confirm' ? `새 업데이트 ${popup.commits.length}건` : popup.title}
            </div>
            <div className="p-3 space-y-2">
              {popup.kind === 'msg' && <pre className="whitespace-pre-wrap font-sans">{popup.body}</pre>}

              {popup.kind === 'confirm' && (
                <>
                  <ul className="max-h-48 overflow-auto bg-gray-50 border rounded p-2 font-mono text-[10px] space-y-0.5">
                    {popup.commits.map(c => <li key={c}>{c}</li>)}
                  </ul>
                  {popup.localChanges && (
                    <div className="text-amber-700">※ 이 PC에서 고친 파일이 있습니다. 원격 변경과 겹치면 업데이트가 중단됩니다.</div>
                  )}
                  <div>업데이트를 적용할까요?</div>
                </>
              )}

              {popup.kind === 'progress' && (
                <>
                  <div className="h-1.5 bg-gray-200 rounded overflow-hidden">
                    <div className={`h-full ${popup.done ? (popup.ok === false ? 'bg-red-500' : 'bg-green-500') + ' w-full' : 'bg-blue-500 w-1/3 animate-pulse'}`} />
                  </div>
                  <pre className="max-h-48 overflow-auto bg-gray-900 text-gray-100 rounded p-2 text-[10px] whitespace-pre-wrap">{popup.log.join('\n')}</pre>
                  {popup.notes?.map(n => <div key={n} className="text-amber-700">{n}</div>)}
                </>
              )}
            </div>
            <div className="px-3 py-2 border-t flex justify-end gap-1">
              {popup.kind === 'confirm' && (
                <button onClick={applyUpdate} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white border-blue-700`}>승인 · 업데이트</button>
              )}
              {(popup.kind !== 'progress' || popup.done) && (
                <button onClick={() => setPopup(null)} className={`${btn} bg-white hover:bg-gray-100 text-gray-700 border-gray-300`}>
                  {popup.kind === 'confirm' ? '취소' : '닫기'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
