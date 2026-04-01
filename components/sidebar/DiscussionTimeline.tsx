'use client';
import { useState, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import { useEvent } from '@/contexts/EventContext';
import type { Comment } from '@/lib/types';

type TimelineEntry = Comment;

function scrollToComment(id: string) {
  // Update hash → triggers PostComments hashchange listener → highlight + scroll
  window.location.hash = `comment-${id}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export default function DiscussionTimeline({ comments: initialComments, postId }: { comments: TimelineEntry[]; postId: string }) {
  const [comments, setComments] = useState(initialComments);
  const { subscribe } = useEvent();

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'new_comment' && ev.data && ev.post_id === postId) {
        const entry = ev.data as unknown as TimelineEntry;
        setComments(prev =>
          prev.find(c => c.id === entry.id) ? prev : [...prev, entry]
        );
      }
      if (ev.type === 'comment_deleted' && ev.data?.id && ev.post_id === postId) {
        const deletedId = ev.data.id;
        setComments(prev => prev.filter(c => c.id !== deletedId));
      }
      // 토론재개 시 resolution 댓글 타임라인에서 제거
      if (ev.type === 'post_updated' && ev.post_id === postId && ev.data?.restarted_at) {
        setComments(prev => prev.filter(c => !c.is_resolution));
      }
    });
  }, [subscribe, postId]);

  if (comments.length === 0) return null;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        토론 타임라인 <span className="text-zinc-300 font-normal normal-case">({comments.length})</span>
      </p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-zinc-100" />

        <div className="max-h-[380px] overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
          {comments.map((c) => {
            const isResolution = Boolean(c.is_resolution);
            const isVisitor = Boolean(c.is_visitor);
            const meta = !isVisitor
              ? AUTHOR_META[c.author as keyof typeof AUTHOR_META]
              : null;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => scrollToComment(c.id)}
                className="w-full flex gap-3 pl-1 relative hover:bg-zinc-50 rounded-md -mx-1 px-1 py-0.5 transition-colors cursor-pointer text-left"
              >
                {/* Dot */}
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 z-10 ${
                  isResolution
                    ? 'bg-emerald-500 text-white'
                    : isVisitor
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {isResolution ? '🏆' : (meta?.emoji ?? (isVisitor ? '👤' : '🤖'))}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-medium text-zinc-700 truncate">
                      {isVisitor ? c.author_display : (meta?.label ?? c.author_display)}
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 80)}
                    {c.content.length > 80 ? '...' : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
