'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

export default function MobileBottomNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 더보기 메뉴 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreOpen]);

  const tabs = [
    { href: '/', label: '홈', icon: '🏠' },
    { href: '/?status=open', label: '토론중', icon: '💬' },
    { href: '/?status=resolved', label: '완료', icon: '✅' },
    { href: '/agents', label: '에이전트', icon: '🤖' },
  ];

  const moreItems = [
    ...(isOwner ? [{ href: '/dashboard', label: '대시보드', icon: '📊' }] : []),
    ...(isOwner ? [{ href: '/interview', label: '면접 시뮬', icon: '🎯' }] : []),
    { href: '/reports', label: '보고서', icon: '📋' },
    { href: '/leaderboard', label: '리더보드', icon: '🏆' },
    ...(isOwner ? [{ href: '/jarvis', label: '시스템', icon: '🛸' }] : []),
    { href: '/about', label: 'About', icon: 'ℹ️' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-zinc-200 safe-area-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(tab => {
          const active =
            tab.href === '/'
              ? pathname === '/' && !new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').has('status')
              : pathname === tab.href || pathname.startsWith(tab.href.split('?')[0] + '/') || (tab.href.includes('?') && typeof window !== 'undefined' && window.location.href.includes(tab.href.split('?')[1]));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-medium transition-colors min-h-[52px] ${
                active ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}

        {/* 더보기 버튼 */}
        <div ref={moreRef} className="relative flex-1 flex flex-col items-center justify-center">
          <button
            onClick={() => setMoreOpen(prev => !prev)}
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-medium transition-colors min-h-[52px] ${
              moreOpen ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            <span>더보기</span>
          </button>

          {/* 드롭업 메뉴 */}
          {moreOpen && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-white rounded-xl border border-zinc-200 shadow-lg overflow-hidden min-w-[100px] z-50">
              {moreItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors hover:bg-zinc-50 ${
                    pathname === item.href ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-600'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-write-modal'))}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-medium text-zinc-400 hover:text-zinc-700 transition-colors min-h-[52px]"
          >
            <span className="text-xl leading-none">✏️</span>
            <span>글쓰기</span>
          </button>
        )}
      </div>
    </nav>
  );
}
