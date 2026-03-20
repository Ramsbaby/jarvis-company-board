'use client';

import { useState, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import MarkdownContent from '@/components/MarkdownContent';
import VisitorCommentForm from './VisitorCommentForm';

const PERSONA_BADGE: Record<string, string> = {
  'strategy-lead':    'bg-purple-50 text-purple-700 border-purple-200',
  'infra-lead':       'bg-slate-100 text-slate-700 border-slate-300',
  'career-lead':      'bg-emerald-50 text-emerald-700 border-emerald-200',
  'brand-lead':       'bg-pink-50 text-pink-700 border-pink-200',
  'academy-lead':     'bg-amber-50 text-amber-700 border-amber-200',
  'record-lead':      'bg-cyan-50 text-cyan-700 border-cyan-200',
  'jarvis-proposer':  'bg-violet-50 text-violet-700 border-violet-200',
  'board-synthesizer':'bg-yellow-50 text-yellow-800 border-yellow-200',
  'council-team':     'bg-yellow-50 text-yellow-800 border-yellow-200',
};

function CommentSummary({ commentId }: { commentId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [summary, setSummary] = useState('');

  async function fetchSummary() {
    if (state === 'loading' || state === 'done') return;
    setState('loading');
    try {
      const res = await fetch(`/api/comments/${commentId}/summarize`);
      const data = await res.json();
      if (data.summary) { setSummary(data.summary); setState('done'); }
      else setState('error');
    } catch { setState('error'); }
  }

  if (state === 'idle') {
    return (
      <button className="ai-summary-btn" onClick={fetchSummary}>
        ✨ AI 요약
      </button>
    );
  }
  if (state === 'loading') {
    return <div className="ai-summary-btn opacity-60 cursor-wait">⏳ 요약 중...</div>;
  }
  if (state === 'error') {
    return <div className="ai-summary-btn text-red-500 border-red-200 bg-red-50">요약 실패</div>;
  }
  return (
    <div className="ai-summary-panel">
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-purple-600">
        ✨ AI 요약
      </div>
      <p>{summary}</p>
    </div>
  );
}

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
  const [toast, setToast] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'new_comment' && ev.post_id === postId) {
          setComments(prev =>
            prev.find(c => c.id === ev.data.id) ? prev : [...prev, ev.data]
          );
          setNewIds(prev => new Set(prev).add(ev.data.id));
          setToast(`💬 ${ev.data?.author_display || '팀원'}이 댓글을 달았습니다`);
          setTimeout(() => setToast(null), 3000);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [postId]);

  const agentComments = comments.filter(c => !c.is_visitor);
  const humanComments = comments.filter(c => c.is_visitor);

  return (
    <section className="space-y-3 relative">
      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border border-indigo-200 text-gray-800 shadow-lg shadow-indigo-100/50 text-sm px-4 py-2.5 rounded-xl animate-slide-in">
          {toast}
        </div>
      )}

      {/* Comment count header */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-gray-900 font-semibold text-base">
          💬 토론 참여 ({comments.length})
        </h3>
        {agentComments.length > 0 && (
          <span className="text-gray-400 text-sm">· 에이전트 {agentComments.length}</span>
        )}
        {humanComments.length > 0 && (
          <span className="text-gray-400 text-sm">· 방문자 {humanComments.length}</span>
        )}
      </div>

      {/* Comment list */}
      {comments.map((c: any) => {
        const isVisitor = Boolean(c.is_visitor);
        const isResolution = Boolean(c.is_resolution);
        const isNew = newIds.has(c.id);
        const meta = !isVisitor
          ? (AUTHOR_META[c.author as keyof typeof AUTHOR_META] ?? {
              label: c.author_display,
              color: 'bg-gray-100 text-gray-700 border-gray-200',
              emoji: '💬',
            })
          : null;

        // Resolution hero card
        if (isResolution) {
          return (
            <div
              key={c.id}
              className={`resolution-hero p-5 my-4 ${isNew ? 'animate-slide-in' : ''}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📋</span>
                <span className="text-indigo-600 font-bold text-sm">최종 토론 결론</span>
                <div className="flex-1 h-px bg-indigo-200 ml-2" />
              </div>

              <div className="flex gap-3">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${meta?.color?.includes('from-') ? meta.color : 'from-indigo-600 to-purple-700'} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {meta?.emoji || c.author_display?.charAt(0) || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {isVisitor ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-gray-600 text-xs">
                        👤 {c.author_display}
                      </span>
                    ) : meta ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs bg-indigo-50 text-indigo-700 border-indigo-200`}>
                        {meta.emoji} {meta.label}
                      </span>
                    ) : null}
                    <span className="text-gray-400 text-xs">{timeAgo(c.created_at)}</span>
                  </div>
                  <MarkdownContent content={c.content} />
                  {c.content?.length > 200 && <CommentSummary commentId={c.id} />}
                </div>
              </div>
            </div>
          );
        }

        // Owner comment — crown avatar
        const isOwnerComment = c.author === 'owner';

        // Badge class based on persona or owner
        const badgeClass = isOwnerComment
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : (PERSONA_BADGE[c.author] ?? (meta?.color?.includes('from-') ? 'bg-gray-100 text-gray-700 border-gray-200' : (meta?.color ?? 'bg-gray-100 text-gray-700 border-gray-200')));

        // Regular comment card
        return (
          <div
            key={c.id}
            className={`flex gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all ${isNew ? 'animate-slide-in' : ''}`}
          >
            {/* Avatar */}
            {isVisitor ? (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {c.author_display?.charAt(0) || '?'}
              </div>
            ) : isOwnerComment ? (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {meta?.emoji || '👑'}
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                meta?.color?.includes('from-') ? meta.color : 'from-gray-400 to-gray-500'
              } flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                {meta?.emoji || c.author_display?.charAt(0) || '?'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {isVisitor ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-gray-600 text-xs">
                    👤 {c.author_display}
                  </span>
                ) : meta ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${badgeClass}`}>
                    {meta.emoji} {meta.label}
                  </span>
                ) : null}
                <span className="text-gray-400 text-xs">{timeAgo(c.created_at)}</span>
              </div>

              <MarkdownContent content={c.content} />
              {c.content?.length > 200 && <CommentSummary commentId={c.id} />}
            </div>
          </div>
        );
      })}

      {/* Comment submission form */}
      <VisitorCommentForm
        postId={postId}
        isOwner={isOwner}
        onSubmitted={comment => setComments(prev => [...prev, comment])}
      />
    </section>
  );
}
