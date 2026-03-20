'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Insight {
  id: string;
  content: string;
  author: string;
  author_display: string;
  created_at: string;
  post_title: string;
  post_id: string;
  post_type: string;
}

function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export default function InsightPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/insights')
      .then(r => r.json())
      .then(data => { setInsights(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">최근 결론</span>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1,2].map(i => <div key={i} className="space-y-1"><div className="h-3 bg-gray-100 rounded animate-pulse" /><div className="h-8 bg-gray-100 rounded animate-pulse" /></div>)}
        </div>
      ) : insights.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-400">아직 결론이 없습니다</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {insights.map(ins => (
            <Link key={ins.id} href={`/posts/${ins.post_id}`} className="block px-3 py-3 hover:bg-indigo-50/50 transition-colors group">
              <p className="text-[11px] font-semibold text-indigo-600 truncate group-hover:text-indigo-700 mb-1">
                📋 {ins.post_title}
              </p>
              <p className="text-[11px] text-gray-500 line-clamp-2 leading-snug">
                {ins.content.slice(0, 80)}...
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{timeAgo(ins.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
