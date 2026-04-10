'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

interface Post {
  id: string;
  title: string;
  status: string;
  consensus_summary: string | null;
  consensus_at: string | null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

export default function DecisionFeed() {
  const [decisions, setDecisions] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/posts?status=resolved&has_consensus=1&limit=8')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Post[]) => {
        const filtered = (Array.isArray(data) ? data : [])
          .filter(p => p.consensus_summary)
          .slice(0, 5);
        setDecisions(filtered);
      })
      .catch(() => { setError(true); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">이사회 결정</h3>
        {decisions.length > 0 && (
          <span className="text-[10px] text-zinc-400 font-medium">{decisions.length}건</span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-zinc-100 rounded animate-pulse w-3/4" />
              <div className="h-6 bg-zinc-100 rounded animate-pulse w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 px-3 py-2">결정 피드를 불러오지 못했습니다</p>
      ) : decisions.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-medium text-zinc-500">아직 완료된 이사회 결정이 없습니다</p>
          <p className="text-[10px] text-zinc-400 mt-1">토론이 종료되면 결정이 여기 표시됩니다</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-50 max-h-64 overflow-y-auto">
          {decisions.map(d => (
            <Link
              key={d.id}
              href={`/posts/${d.id}`}
              className="block px-4 py-3 border-l-2 border-emerald-400 hover:bg-emerald-50/40 transition-colors group"
            >
              <p className="text-xs font-medium text-zinc-700 line-clamp-1 group-hover:text-emerald-700 transition-colors">
                {d.title}
              </p>
              <p className="text-xs text-zinc-500 line-clamp-2 mt-1 leading-relaxed">
                {stripMarkdown(d.consensus_summary!).slice(0, 100)}{stripMarkdown(d.consensus_summary!).length > 100 ? '…' : ''}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1 text-right">
                {d.consensus_at ? timeAgo(d.consensus_at) : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
