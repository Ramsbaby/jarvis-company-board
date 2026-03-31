'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect, Suspense } from 'react';

// active 감지: pathname + searchParams 기반 순수 함수 (hooks 규칙 준수)
function isActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [base, qs] = href.split('?');
  if (base === '/') {
    return pathname === '/' && !searchParams.has('status');
  }
  if (qs) {
    const [key, val] = qs.split('=');
    return pathname === base && searchParams.get(key) === val;
  }
  return pathname === base || pathname.startsWith(base + '/');
}

function MobileBottomNavInner({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  // URLSearchParams 인터페이스 통일 (isActive 순수 함수에 전달)
  const sp = rawSearchParams as unknown as URLSearchParams;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreOpen]);

  // 탭 구성: 오너/게스트 공통 4개 + 더보기
  const tabs = [
    { href: '/',              label: '홈',     icon: '🏠' },
    { href: '/?status=open',  label: '토론중', icon: '💬' },
    { href: '/dev-tasks',     label: '태스크', icon: '⚙' },
    { href: '/leaderboard',   label: '순위',   icon: '🏆' },
  ];

  const moreItems = [
    ...(isOwner ? [{ href: '/dashboard',  label: '대시보드', icon: '📊' }] : []),
    ...(isOwner ? [{ href: '/interview',  label: '면접',     icon: '🎯' }] : []),
    ...(isOwner ? [{ href: '/reports',    label: '보고서',   icon: '📋' }] : []),
    { href: '/agents',  label: '에이전트', icon: '🤖' },
    { href: '/about',   label: '소개',     icon: 'ℹ️' },
  ];

  // 더보기 항목 중 하나가 active인지 (더보기 버튼 강조용)
  const moreActive = moreItems.some(item => isActive(item.href, pathname, sp));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-zinc-200 safe-area-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(tab => {
          const active = isActive(tab.href, pathname, sp);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors min-h-[52px] relative ${
                active ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {/* 활성 탭 인디케이터 */}
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-indigo-500" />}
              <span className="text-[18px] leading-none mt-0.5">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}

        {/* 더보기 드롭업 */}
        <div ref={moreRef} className="relative flex-1 flex flex-col items-center justify-center">
          <button
            onClick={() => setMoreOpen(prev => !prev)}
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors min-h-[52px] relative ${
              moreOpen || moreActive ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {(moreOpen || moreActive) && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-indigo-500" />}
            <span className="text-[18px] leading-none mt-0.5">⋯</span>
            <span>더보기</span>
          </button>

          {moreOpen && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden min-w-[130px] z-50">
              {/* 드롭업 헤더 */}
              <div className="px-3 py-1.5 border-b border-zinc-100 text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">메뉴</div>
              {moreItems.map(item => {
                const itemActive = isActive(item.href, pathname, sp);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                      itemActive ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 오너 글쓰기 버튼 */}
        {isOwner && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-write-modal'))}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-zinc-400 hover:text-indigo-600 transition-colors min-h-[52px]"
          >
            <span className="text-[18px] leading-none mt-0.5">✏️</span>
            <span>글쓰기</span>
          </button>
        )}
      </div>
    </nav>
  );
}

// useSearchParams는 Suspense 경계 필요
export default function MobileBottomNav({ isOwner }: { isOwner: boolean }) {
  return (
    <Suspense fallback={null}>
      <MobileBottomNavInner isOwner={isOwner} />
    </Suspense>
  );
}
