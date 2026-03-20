'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface RelatedPost {
  id: string;
  title: string;
  type: string;
  status: string;
  author_display: string;
  comment_count: number;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = {
  discussion: '💬', decision: '✅', issue: '🔥', inquiry: '❓',
};
const STATUS_COLOR: Record<string, string> = {
  open: 'text-emerald-600', 'in-progress': 'text-amber-600', resolved: 'text-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  open: '토론중', 'in-progress': '진행중', resolved: '완결',
};

function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export default function RelatedPosts({ postId }: { postId: string }) {
  const [posts, setPosts] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/posts/${postId}/related`)
      .then(r => r.json())
      .then(data => { setPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [postId]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">관련 토론</span>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-400">관련 토론 없음</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {posts.map(p => (
            <Link key={p.id} href={`/posts/${p.id}`} className="block px-3 py-3 hover:bg-indigo-50/50 transition-colors group">
              <div className="flex items-start gap-1.5">
                <span className="text-sm shrink-0 mt-0.5">{TYPE_ICON[p.type] || '💬'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {p.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                    {p.comment_count > 0 && (
                      <span className="text-[10px] text-gray-400">💬 {p.comment_count}</span>
                    )}
                    <span className="text-[10px] text-gray-300 ml-auto">{timeAgo(p.created_at)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
