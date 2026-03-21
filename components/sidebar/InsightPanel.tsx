'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { AUTHOR_META } from '@/lib/constants';

interface MvpAgent {
  agent_id: string;
  display_30d: number;
}

interface Insight {
  id: string;
  content: string;
  author: string;
  author_display: string;
  created_at: string;
  post_title: string;
  post_id: string;
  post_type: string;
  _locked?: boolean;
}

const TYPE_ICON: Record<string, string> = {
  discussion: '💬', decision: '✅', issue: '🔴', inquiry: '❓',
};

export default function InsightPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mvp, setMvp] = useState<MvpAgent | null>(null);

  useEffect(() => {
    fetch('/api/insights')
      .then(r => r.json())
      .then(data => { setInsights(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });

    fetch('/api/agents/scores?window=7')
      .then(r => r.json())
      .then(data => {
        const agents: MvpAgent[] = Array.isArray(data?.agents) ? data.agents : [];
        const top = agents[0];
        if (top && top.display_30d > 0) setMvp(top);
      })
      .catch(() => { /* silently ignore */ });
  }, []);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">최근 결론</h3>
        {insights.length > 0 && (
          <span className="text-[10px] text-zinc-400 font-medium">{insights.length}건</span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="space-y-2">
              <div className="skeleton-shimmer h-3 w-3/4" />
              <div className="skeleton-shimmer h-8 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-center text-xs text-zinc-400">
          데이터를 불러오지 못했습니다
        </div>
      ) : insights.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center text-xl">
            🔍
          </div>
          <p className="text-xs font-medium text-zinc-500">아직 결론이 없습니다</p>
          <p className="text-[10px] text-zinc-400 mt-1">토론이 종료되면 인사이트가 쌓입니다</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-50 max-h-72 overflow-y-auto scroll-smooth">
          {insights.map(ins => {
            if (ins._locked) {
              return (
                <a
                  key={ins.id}
                  href="/login"
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-zinc-50 transition-colors group"
                >
                  <span className="text-base opacity-30 shrink-0">{TYPE_ICON[ins.post_type] ?? '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-zinc-300 truncate blur-[3px] select-none">
                      {ins.post_title}
                    </p>
                    <span className="text-[10px] text-zinc-400">🔒 로그인 후 열람</span>
                  </div>
                </a>
              );
            }
            return (
              <Link
                key={ins.id}
                href={`/posts/${ins.post_id}`}
                className="block px-4 py-3 hover:bg-indigo-50/40 transition-colors group"
              >
                {/* Post title row */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm shrink-0">{TYPE_ICON[ins.post_type] ?? '📋'}</span>
                  <p className="text-[11px] font-semibold text-zinc-700 truncate group-hover:text-indigo-600 transition-colors flex-1">
                    {ins.post_title}
                  </p>
                  <span className="text-[10px] text-zinc-300 shrink-0">{timeAgo(ins.created_at)}</span>
                </div>
                {/* Insight preview */}
                <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed bg-zinc-50 rounded-md px-2.5 py-1.5 ml-5">
                  {ins.content.replace(/#{1,6}\s/g, '').replace(/[*`_>]/g, '').slice(0, 100)}{ins.content.length > 100 ? '…' : ''}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── 이번 주 MVP ─────────────────────────────────────────────────── */}
      {mvp && (
        <div className="border-t border-zinc-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">이번 주 MVP</span>
            <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">⭐ 7일</span>
          </div>
          <Link
            href="/leaderboard"
            className="flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 hover:bg-amber-100/70 transition-colors group"
          >
            <span className="text-2xl shrink-0">
              {AUTHOR_META[mvp.agent_id]?.emoji ?? '🤖'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 truncate group-hover:text-amber-900">
                {AUTHOR_META[mvp.agent_id]?.name ?? AUTHOR_META[mvp.agent_id]?.label ?? mvp.agent_id}
              </p>
              <p className="text-[10px] text-amber-600 font-medium">{mvp.display_30d}점</p>
            </div>
            <span className="text-[10px] text-amber-400 group-hover:text-amber-600 transition-colors shrink-0">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
