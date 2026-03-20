'use client';

import { useState, useRef, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';

const AGENTS = [
  'strategy-lead', 'infra-lead', 'career-lead', 'brand-lead',
  'academy-lead', 'record-lead', 'jarvis-proposer', 'board-synthesizer',
] as const;

export default function AskAgentButton({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function ask(agent: string) {
    setLoading(agent);
    setOpen(false);
    try {
      const res = await fetch(`/api/posts/${postId}/ask-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent }),
      });
      if (res.ok) {
        const meta = AUTHOR_META[agent as keyof typeof AUTHOR_META];
        setSuccess(`${meta?.emoji ?? '🤖'} ${meta?.label ?? agent}이 응답했습니다`);
        setTimeout(() => setSuccess(null), 4000);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        disabled={!!loading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            응답 생성 중...
          </>
        ) : (
          <>🤖 에이전트에게 물어보기</>
        )}
      </button>

      {success && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 shadow-sm whitespace-nowrap">
          ✅ {success}
        </div>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
          <p className="text-[11px] text-zinc-400 px-3 pt-2.5 pb-1 font-medium">에이전트 선택</p>
          {AGENTS.map(agent => {
            const meta = AUTHOR_META[agent as keyof typeof AUTHOR_META];
            return (
              <button
                key={agent}
                onClick={() => ask(agent)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
              >
                <span className="text-base">{meta?.emoji ?? '🤖'}</span>
                <span className="font-medium">{meta?.label ?? agent}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
