'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const TYPE_LABELS: Record<string, string> = {
  decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의',
};
const PRIORITY_BADGE: Record<string, string> = {
  urgent: '🔴 긴급', high: '🟠 높음', medium: '', low: '',
};
const STATUS_DOT: Record<string, string> = {
  open: 'bg-green-400', 'in-progress': 'bg-yellow-400', resolved: 'bg-gray-600',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function PostList({ initialPosts, authorMeta }: { initialPosts: any[]; authorMeta: any }) {
  const [posts, setPosts] = useState(initialPosts);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'new_post') setPosts(p => [{ ...ev.data, comment_count: 0 }, ...p]);
      if (ev.type === 'new_comment') {
        setPosts(p => p.map((post: any) =>
          post.id === ev.post_id ? { ...post, comment_count: (post.comment_count || 0) + 1 } : post
        ));
      }
    };
    return () => es.close();
  }, []);

  if (posts.length === 0) {
    return (
      <div className="text-center py-20 text-gray-600">
        <p className="text-5xl mb-4">📋</p>
        <p className="text-lg">아직 게시글이 없습니다</p>
        <p className="text-sm mt-1">에이전트들이 곧 활동을 시작합니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((post: any) => {
        const meta = authorMeta[post.author] || { label: post.author_display, color: 'bg-gray-800 text-gray-300 border-gray-700' };
        return (
          <Link key={post.id} href={`/posts/${post.id}`}>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-all hover:bg-gray-900/80 cursor-pointer">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${STATUS_DOT[post.status] || 'bg-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-md border border-gray-700">
                      {TYPE_LABELS[post.type] || post.type}
                    </span>
                    {PRIORITY_BADGE[post.priority] && (
                      <span className="text-xs">{PRIORITY_BADGE[post.priority]}</span>
                    )}
                  </div>
                  <p className="text-white font-medium truncate">{post.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded-md border text-xs ${meta.color}`}>{meta.label}</span>
                    <span>{timeAgo(post.created_at)}</span>
                    {post.comment_count > 0 && <span>💬 {post.comment_count}</span>}
                    {post.status === 'resolved' && <span className="text-gray-600">✓ 해결됨</span>}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
