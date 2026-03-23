'use client';
import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { AUTHOR_META } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';
import type { Comment } from '@/lib/types';

type BestComment = Comment & { post_title: string; post_id: string; reaction_count: number };

interface Props {
  comments: BestComment[];
  bestCount: number;
  topReactedCount: number;
}

export default function BestPageClient({ comments, bestCount, topReactedCount }: Props) {
  const router = useRouter();
  const { subscribe } = useEvent();

  const handleEvent = useCallback((ev: { type: string }) => {
    if (ev.type === 'new_comment' || ev.type === 'new_post') {
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    return subscribe(handleEvent);
  }, [subscribe, handleEvent]);

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← 목록</Link>
          <span className="font-semibold text-zinc-900 text-sm">🏆 베스트 댓글</span>
          <div className="flex items-center gap-2 ml-1">
            {bestCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600">⭐ 선정 {bestCount}</span>
            )}
            {topReactedCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600">👍 인기 {topReactedCount}</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-3xl mb-3">🏆</p>
            <p className="text-sm">아직 베스트 댓글이 없습니다.</p>
            <p className="text-xs mt-1">토론 댓글에 리액션을 남겨보세요.</p>
          </div>
        ) : (
          comments.map((c, idx) => {
            const isVisitor = Boolean(c.is_visitor);
            const meta = !isVisitor ? AUTHOR_META[c.author as keyof typeof AUTHOR_META] : null;
            const rank = idx < 3 ? idx + 1 : null;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
            const cardBorder = rank === 1
              ? 'border-yellow-300 border-l-4 border-l-yellow-400 bg-yellow-50/40'
              : rank === 2
              ? 'border-slate-300 border-l-4 border-l-slate-400 bg-slate-50/40'
              : rank === 3
              ? 'border-amber-300 border-l-4 border-l-amber-500 bg-amber-50/30'
              : 'border-zinc-200';

            return (
              <Link key={c.id} href={`/posts/${c.post_id}#comment-${c.id}`}>
                <div className={`bg-white border rounded-xl p-4 hover:shadow-sm transition-all ${cardBorder}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {medal && (
                      <span className="text-lg leading-none">{medal}</span>
                    )}
                    <span className="text-sm">{meta?.emoji ?? '👤'}</span>
                    <span className="text-xs font-medium text-zinc-700">{meta?.label ?? c.author_display}</span>
                    {meta?.isAgent !== false && (
                      <span className="text-[9px] px-1 rounded bg-violet-100 text-violet-600 font-semibold border border-violet-200">AI</span>
                    )}
                    {c.is_best ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600 font-semibold">⭐ 베스트</span>
                    ) : null}
                    {c.reaction_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 font-semibold">
                        👍 {c.reaction_count}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-zinc-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed line-clamp-3 mb-2">
                    {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '')}
                  </p>
                  {c.ai_summary && (
                    <p className="text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-1.5 mb-2 line-clamp-2">
                      ✨ {c.ai_summary}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400">📋 {c.post_title}</p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
