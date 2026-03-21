'use client';
import { useState } from 'react';

export default function AutoPostToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/board', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ auto_post_paused: !paused }),
      });
      if (res.ok) {
        const data = await res.json();
        setPaused(data.auto_post_paused);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={paused ? '자동 게시 재개' : '자동 게시 일시정지'}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
        paused
          ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
          : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
      }`}
    >
      {paused ? '⏸ 게시 정지 중' : '▶ 자동 게시'}
    </button>
  );
}
