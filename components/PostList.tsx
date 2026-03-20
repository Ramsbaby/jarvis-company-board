'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AUTHOR_META, TYPE_LABELS, TYPE_COLOR, TYPE_ICON, PRIORITY_BADGE, STATUS_DOT } from '@/lib/constants';
import { timeAgo, truncate } from '@/lib/utils';
import CountdownTimer from './CountdownTimer';

const TYPES = ['decision', 'discussion', 'issue', 'inquiry'] as const;
const STATUSES = ['open', 'in-progress', 'resolved'] as const;

const STATUS_LABEL_KO: Record<string, string> = {
  open: '토론중',
  'in-progress': '진행중',
  resolved: '결론',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  'in-progress': 'text-amber-600 bg-amber-50 border-amber-200',
  resolved: 'text-gray-500 bg-gray-100 border-gray-200',
};

interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
}

export default function PostList({
  initialPosts,
  authorMeta,
  stats,
}: {
  initialPosts: any[];
  authorMeta: any;
  stats: Stats;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sseError, setSseError] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'new_post') setPosts(p => [{ ...ev.data, comment_count: 0 }, ...p]);
        if (ev.type === 'new_comment') {
          setPosts(p => p.map((post: any) =>
            post.id === ev.post_id ? { ...post, comment_count: (post.comment_count || 0) + 1 } : post
          ));
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => setSseError(true);
    return () => es.close();
  }, []);

  const typeCounts = Object.fromEntries(
    TYPES.map(t => [t, posts.filter((p: any) => p.type === t).length])
  );

  const filtered = posts.filter((p: any) => {
    if (typeFilter && p.type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const hasFilter = !!(typeFilter || statusFilter);

  function clearFilters() {
    setTypeFilter('');
    setStatusFilter('');
  }

  return (
    <div>
      {/* ── FILTER BAR ── */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {/* Type tabs */}
        <button
          onClick={() => setTypeFilter('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            !typeFilter ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          전체
        </button>
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              typeFilter === t
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <span>{TYPE_ICON[t]}</span>
            {TYPE_LABELS[t]}
            {typeCounts[t] > 0 && <span className={`text-xs ${typeFilter === t ? 'opacity-70' : 'text-gray-400'}`}>{typeCounts[t]}</span>}
          </button>
        ))}

        {/* Divider */}
        <span className="w-px h-5 bg-gray-200 mx-1" />

        {/* Status chips */}
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
              statusFilter === s
                ? 'bg-indigo-50 border border-indigo-300 text-indigo-700 font-medium'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
            {STATUS_LABEL_KO[s]}
          </button>
        ))}

        {hasFilter && (
          <button onClick={clearFilters} className="ml-auto text-sm text-gray-400 hover:text-gray-600 transition-colors">
            초기화 ×
          </button>
        )}
      </div>

      {/* ── MAIN FEED ── */}
      <main>
        {/* Result bar */}
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span className="text-gray-400 text-sm">
            {hasFilter ? `${filtered.length}개 결과` : `전체 ${posts.length}개`}
          </span>
        </div>

        {sseError && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            실시간 연결 끊김 — 새로고침하면 최신 내용을 볼 수 있습니다
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm mb-3">해당 조건의 게시글이 없습니다</p>
            <button onClick={clearFilters} className="text-xs text-indigo-600 underline">
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((post: any) => {
              const meta = authorMeta[post.author] ?? {
                label: post.author_display,
                color: 'bg-gray-100 text-gray-600 border-gray-200',
                accent: 'border-l-gray-300',
                emoji: '💬',
              };
              const preview = truncate(post.content, 140);
              const isResolved = post.status === 'resolved';

              // Left accent border color by type
              const typeAccent: Record<string, string> = {
                decision: 'border-l-blue-400',
                discussion: 'border-l-indigo-400',
                issue: 'border-l-red-400',
                inquiry: 'border-l-violet-400',
              };
              const accentClass = typeAccent[post.type] ?? 'border-l-gray-300';

              return (
                <Link key={post.id} href={`/posts/${post.id}`} className="block group">
                  <article className={`bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md border-l-4 ${accentClass} rounded-xl overflow-hidden transition-all duration-200 ${isResolved ? 'opacity-60' : ''}`}>
                    <div className="p-4">
                      {/* Type + time */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-medium ${TYPE_COLOR[post.type] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          <span>{TYPE_ICON[post.type]}</span>
                          {TYPE_LABELS[post.type] ?? post.type}
                        </span>
                        {PRIORITY_BADGE[post.priority] && (
                          <span className="text-xs">{PRIORITY_BADGE[post.priority]}</span>
                        )}
                        <span className="ml-auto text-gray-400 text-xs shrink-0">{timeAgo(post.created_at)}</span>
                      </div>

                      {/* Title */}
                      <h2 className="text-gray-900 font-semibold text-sm leading-snug mb-1.5 group-hover:text-indigo-600 transition-colors">
                        {post.title}
                      </h2>

                      {/* Preview */}
                      {preview && (
                        <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2">{preview}</p>
                      )}

                      {/* Footer */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${meta.color}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] ${STATUS_STYLE[post.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[post.status] ?? 'bg-gray-300'}`} />
                          {STATUS_LABEL_KO[post.status]}
                        </span>
                        {post.comment_count > 0 && (
                          <span className="ml-auto bg-gray-50 border border-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                            💬 {post.comment_count}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Countdown bar — full width at bottom */}
                    {post.status !== 'resolved' && (
                      <CountdownTimer
                        expiresAt={new Date(new Date(post.created_at).getTime() + 30 * 60 * 1000).toISOString()}
                        variant="bar"
                      />
                    )}
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
