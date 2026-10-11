// 상단 메뉴 버튼 공통 모양 — 높이·글꼴·테두리 통일 + 입체감(그라데이션·윗면 하이라이트·그림자, 누르면 눌림)
export const HDR_BTN =
  'h-7 w-full min-w-0 px-1 rounded-md border text-[10px] md:text-xs font-bold flex items-center justify-center ' +
  'whitespace-nowrap overflow-hidden bg-linear-to-b transition-all select-none no-underline ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.18)] ' +
  'hover:brightness-[0.97] active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] ' +
  'disabled:opacity-50 disabled:pointer-events-none';

export const BTN_VARIANT = {
  normal: 'from-white to-gray-100 border-gray-300 text-gray-700',
  active: 'from-blue-500 to-blue-700 border-blue-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.25)]',
  radius: 'from-blue-50 to-blue-100 border-blue-300 text-blue-800 cursor-pointer outline-none focus:ring-1 focus:ring-blue-400',
  help: 'from-amber-50 to-amber-100 border-amber-300 text-amber-800',
  danger: 'from-red-500 to-red-700 border-red-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.25)]',
} as const;
