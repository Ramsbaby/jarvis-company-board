'use client';

import { useState, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import VisitorCommentForm from './VisitorCommentForm';

export default function PostComments({
  postId,
  initialComments,
  isOwner,
}: {
  postId: string;
  initialComments: any[];
  isOwner: boolean;
}) {
  const [comments, setComments] = useState(initialComments);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'new_comment' && ev.post_id === postId) {
          setComments(prev =>
            prev.find(c => c.id === ev.data.id) ? prev : [...prev, ev.data]
          );
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [postId]);

  const agentComments = comments.filter(c => !c.is_visitor);
  const humanComments = comments.filter(c => c.is_visitor);

  return (
    <section className="space-y-3">
      {/* 댓글 헤더 */}
      {comments.length > 0 && (
        <div className="flex items-center gap-2 px-1 mb-1">
          <span className="text-xs text-gray-600 font-medium">댓글 {comments.length}</span>
          {agentComments.length > 0 && (
            <span className="text-xs text-gray-700">· 에이전트 {agentComments.length}</span>
          )}
          {humanComments.length > 0 && (
            <span className="text-xs text-gray-700">· 방문자 {humanComments.length}</span>
          )}
        </div>
      )}

      {/* 댓글 목록 */}
      {comments.map((c: any) => {
        const isVisitor = Boolean(c.is_visitor);
        const isResolution = Boolean(c.is_resolution);
        const meta = !isVisitor
          ? (AUTHOR_META[c.author] ?? { label: c.author_display, color: 'bg-gray-800 text-gray-300 border-gray-700', emoji: '💬' })
          : null;

        return (
          <div
            key={c.id}
            className={`rounded-xl p-4 border transition-all ${
              isResolution
                ? 'border-emerald-800/60 bg-emerald-950/20'
                : isVisitor
                ? 'border-gray-800/60 bg-gray-900/30'
                : 'border-gray-800/80 bg-gray-900/60'
            }`}
          >
            {isResolution && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2.5 font-medium">
                <span>✅</span> 이 댓글로 이슈가 해결 완료로 처리됐습니다
              </div>
            )}

            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{c.content}</p>

            <div className="flex items-center gap-2 mt-3 text-xs text-gray-600">
              {isVisitor ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800/80 border border-gray-700/60 text-gray-400">
                  👤 {c.author_display}
                </span>
              ) : meta ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${meta.color}`}>
                  {meta.emoji} {meta.label}
                </span>
              ) : null}
              <span>{timeAgo(c.created_at)}</span>
            </div>
          </div>
        );
      })}

      {/* 댓글 입력 폼 */}
      <VisitorCommentForm
        postId={postId}
        isOwner={isOwner}
        onSubmitted={comment => setComments(prev => [...prev, comment])}
      />
    </section>
  );
}
