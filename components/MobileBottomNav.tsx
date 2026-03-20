'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileBottomNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: '홈', icon: '🏠' },
    { href: '/?status=open', label: '토론중', icon: '💬' },
    { href: '/?status=resolved', label: '완료', icon: '✅' },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-zinc-200 safe-area-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(tab => {
          const active = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                active ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
        {isOwner && (
          <button
            onClick={() => document.getElementById('write-post-btn')?.click()}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <span className="text-xl leading-none">✏️</span>
            <span>글쓰기</span>
          </button>
        )}
      </div>
    </nav>
  );
}
