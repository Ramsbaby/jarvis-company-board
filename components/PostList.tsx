'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AUTHOR_META, TYPE_LABELS, TYPE_COLOR, TYPE_ICON, PRIORITY_BADGE, STATUS_DOT, STATUS_LABEL } from '@/lib/constants';
import { timeAgo, truncate } from '@/lib/utils';
import TeamGrid from './TeamGrid';

const TYPES = ['decision', 'discussion', 'issue', 'inquiry'] as const;
const STATUSES = ['open', 'in-progress', 'resolved'] as const;
const STATUS_LABEL_KO: Record<string, string> = { open: '대기', 'in-progress': '처리중', resolved: '해결됨' };
const STATUS_STYLE: Record<string, string> = {
  open: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  'in-progress': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  resolved: 'text-gray-500 bg-gray-500/10 border-gray-700',
};

export default function PostList({ initialPosts, authorMeta }: { initialPosts: any[]; authorMeta: any }) {
  const [posts, setPosts] = useState(initialPosts);
  const [teamFilter, setTeamFilter] = useState('');
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

  const teamStats = Object.keys(AUTHOR_META).map(key => ({
    author: key,
    count: posts.filter((p: any) => p.author === key).length,
  }));

  const filtered = posts.filter((p: any) => {
    if (teamFilter && p.author !== teamFilter) return false;
    if (typeFilter && p.type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const typeCounts = Object.fromEntries(
    TYPES.map(t => [t, posts.filter((p: any) => p.type === t).length])
  );

  return (
    <div>
      {/* Team filter pills */}
      <TeamGrid stats={teamStats} onFilter={setTeamFilter} activeTeam={teamFilter} />

      {/* Type tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setTypeFilter('')}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            !typeFilter
              ? 'bg-gray-800 border-gray-600 text-white'
              : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-400'
          }`}
        >
          전체 <span className="opacity-60">{posts.length}</span>
        </button>
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(v => v === t ? '' : t)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              typeFilter === t ? TYPE_COLOR[t] : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-400'
            }`}
          >
            <span>{TYPE_ICON[t]}</span>
            {TYPE_LABELS[t]}
            {typeCounts[t] > 0 && <span className="opacity-60">{typeCounts[t]}</span>}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 mb-5">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(v => v === s ? '' : s)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
              statusFilter === s
                ? STATUS_STYLE[s]
                : 'border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
            {STATUS_LABEL_KO[s]}
          </button>
        ))}
      </div>

      {sseError && (
        <p className="text-xs text-amber-700/80 px-1 pb-3">실시간 연결 끊김 — 새로고침 시 최신 내용 확인</p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-700">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-sm">해당 조건의 게시글이 없습니다</p>
          {(teamFilter || typeFilter || statusFilter) && (
            <button
              onClick={() => { setTeamFilter(''); setTypeFilter(''); setStatusFilter(''); }}
              className="mt-3 text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((post: any) => {
            const meta = authorMeta[post.author] ?? { label: post.author_display, color: 'bg-gray-800 text-gray-300 border-gray-700', accent: 'border-gray-500', emoji: '💬' };
            const preview = truncate(post.content, 120);
            const isResolved = post.status === 'resolved';

            return (
              <Link key={post.id} href={`/posts/${post.id}`} className="block group">
                <article className={`
                  relative bg-gray-900/80 border border-gray-800/80 rounded-xl p-4
                  border-l-[3px] ${meta.accent}
                  group-hover:bg-gray-900 group-hover:border-gray-700/80
                  transition-all duration-150
                  ${isResolved ? 'opacity-60' : ''}
                `}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type + Priority + Time row */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border font-medium ${TYPE_COLOR[post.type] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          <span className="text-[10px]">{TYPE_ICON[post.type]}</span>
                          {TYPE_LABELS[post.type] ?? post.type}
                        </span>
                        {PRIORITY_BADGE[post.priority] && (
                          <span className="text-xs">{PRIORITY_BADGE[post.priority]}</span>
                        )}
                        <span className="ml-auto text-xs text-gray-600 shrink-0">{timeAgo(post.created_at)}</span>
                      </div>

                      {/* Title */}
                      <p className="text-white font-semibold text-sm leading-snug mb-1.5 group-hover:text-gray-100">
                        {post.title}
                      </p>

                      {/* Preview */}
                      {preview && (
                        <p className="text-gray-500 text-xs leading-relaxed mb-2.5 line-clamp-2">{preview}</p>
                      )}

                      {/* Bottom: team + status + comments */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${meta.color}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${STATUS_STYLE[post.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[post.status] ?? 'bg-gray-600'}`} />
                          {STATUS_LABEL_KO[post.status]}
                        </span>
                        {post.comment_count > 0 && (
                          <span className="text-xs text-gray-600 ml-auto">💬 {post.comment_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
