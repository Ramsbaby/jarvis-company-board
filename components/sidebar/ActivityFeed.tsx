'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';
import { timeAgo } from '@/lib/utils';

interface Activity {
  id: string;
  type: 'new_post' | 'new_comment';
  title: string;
  author: string;
  authorDisplay: string;
  postId: string;
  postTitle?: string;
  ts: number;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { connected, subscribe } = useEvent();

  // Load initial data from DB
  useEffect(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setActivities(data); })
      .catch(() => { setError(true); })
      .finally(() => setLoading(false));
  }, []);

  // Subscribe to live SSE events
  useEffect(() => {
    return subscribe((ev) => {
      const now = Date.now();
      if (ev.type === 'new_post') {
        const pid = ev.post_id || ev.data?.id || '';
        if (!pid) return; // postId 없으면 무시
        const item: Activity = {
          id: pid,
          type: 'new_post',
          title: ev.data?.title || '새 토론',
          author: ev.data?.author || '',
          authorDisplay: ev.data?.author_display || '시스템',
          postId: pid,
          postTitle: ev.data?.title || '',
          ts: now,
        };
        setActivities(prev => [item, ...prev].slice(0, 15));
      }
      if (ev.type === 'new_comment') {
        const pid = ev.post_id || ev.data?.post_id || '';
        if (!pid) return; // postId 없으면 무시
        const item: Activity = {
          id: ev.data?.id || String(now),
          type: 'new_comment',
          title: ev.data?.content?.slice(0, 60) || '새 댓글',
          author: ev.data?.author || '',
          authorDisplay: ev.data?.author_display || '팀원',
          postId: pid,
          postTitle: '',
          ts: now,
        };
        setActivities(prev => [item, ...prev].slice(0, 15));
      }
    });
  }, [subscribe]);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">실시간 활동</h3>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
          connected
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
          {connected ? 'LIVE' : '연결 중'}
        </span>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 bg-zinc-100 rounded animate-pulse w-full" />
                <div className="h-2 bg-zinc-100 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 px-3 py-2">활동 피드를 불러오지 못했습니다</p>
      ) : activities.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-medium text-zinc-500">아직 활동이 없습니다</p>
          <p className="text-[10px] text-zinc-400 mt-1">팀원들의 활동이 여기 표시됩니다</p>
        </div>
      ) : (() => {
        // Latest comment (pinned at top)
        const latest = activities[0];
        const latestEmoji = AUTHOR_META[latest.author]?.emoji || (latest.type === 'new_post' ? '📝' : '💬');
        const latestHref = latest.type === 'new_post'
          ? `/posts/${latest.postId}`
          : `/posts/${latest.postId}#comment-${latest.id}`;
        const rest = activities.slice(1);

        return (
          <div>
            {/* Pinned: always-visible latest activity */}
            <Link
              href={latestHref}
              scroll={latest.type !== 'new_comment'}
              className="block px-4 py-3 bg-indigo-50 border-b border-indigo-100 hover:bg-indigo-100/70 transition-colors group"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 bg-white border border-indigo-200 shadow-sm">
                  {latestEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-indigo-900 group-hover:text-indigo-700 transition-colors truncate">
                      {latest.authorDisplay}
                    </span>
                    <span className="text-[10px] text-indigo-400 shrink-0">{timeAgo(latest.ts)}</span>
                  </div>
                  <p className="text-xs text-indigo-700 leading-snug line-clamp-2">
                    {latest.type === 'new_post'
                      ? `새 토론: ${latest.title}`
                      : latest.title.slice(0, 60) + (latest.title.length > 60 ? '…' : '')}
                  </p>
                  {latest.postTitle && latest.type === 'new_comment' && (
                    <p className="text-[10px] text-indigo-400 truncate mt-0.5">↳ {latest.postTitle}</p>
                  )}
                </div>
              </div>
            </Link>

            {/* Older activities */}
            {rest.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {rest.map((act, i) => {
                  const emoji = AUTHOR_META[act.author]?.emoji || (act.type === 'new_post' ? '📝' : '💬');
                  const href = act.type === 'new_post'
                    ? `/posts/${act.postId}`
                    : `/posts/${act.postId}#comment-${act.id}`;
                  return (
                    <Link
                      key={`${act.id}-${i}`}
                      href={href}
                      scroll={act.type !== 'new_comment'}
                      className="flex items-start gap-2.5 px-4 py-2 hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0 group"
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 bg-zinc-100">
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-600 leading-snug line-clamp-1">
                          <span className="font-semibold text-zinc-800">{act.authorDisplay}</span>
                          {act.type === 'new_post'
                            ? ': 새 토론'
                            : `: ${act.title.slice(0, 30)}${act.title.length > 30 ? '…' : ''}`
                          }
                        </p>
                        <p className="text-[10px] text-zinc-300 mt-0.5">{timeAgo(act.ts)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
