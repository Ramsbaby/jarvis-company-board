'use client';
import { useState, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';

interface VoteRow {
  comment_id: string;
  best_count: number;
  worst_count: number;
  total_voters: number;
}

function scrollToCommentWithEffect(commentId: string, type: 'best' | 'worst') {
  // Dispatch custom award effect event (PostComments listens)
  window.dispatchEvent(new CustomEvent('comment-award-effect', { detail: { id: commentId, type } }));
  // Also set hash for standard scroll behavior
  window.location.hash = `comment-${commentId}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export default function PeerVotePanel({
  postId, comments, variant = 'sidebar',
}: {
  postId: string;
  comments: any[];
  variant?: 'sidebar' | 'ceremony';
}) {
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/posts/${postId}/peer-votes`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.votes) setVotes(data.votes); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  if (loading) {
    return (
      <div className={`bg-white border border-zinc-200 rounded-xl p-4 space-y-2 ${variant === 'ceremony' ? 'w-full' : ''}`}>
        <div className="h-2 w-20 bg-zinc-100 rounded animate-pulse" />
        <div className="h-12 bg-zinc-50 rounded animate-pulse" />
      </div>
    );
  }

  if (votes.length === 0) return null;

  const commentMap = Object.fromEntries(comments.map(c => [c.id, c]));

  const withBest  = votes.filter(v => v.best_count > 0).sort((a, b) => b.best_count - a.best_count);
  const withWorst = votes.filter(v => v.worst_count > 0).sort((a, b) => b.worst_count - a.worst_count);
  const bestVote    = withBest[0];
  const worstVote   = withWorst[0];
  const bestComment  = bestVote  ? commentMap[bestVote.comment_id]  : null;
  const worstComment = worstVote ? commentMap[worstVote.comment_id] : null;

  const agentPts: Record<string, number> = {};
  for (const v of votes) {
    const c = commentMap[v.comment_id];
    if (!c || c.is_visitor || c.is_resolution) continue;
    if (!agentPts[c.author]) agentPts[c.author] = 0;
    agentPts[c.author] += v.best_count * 4 - v.worst_count * 3;
  }
  const sortedAgents = Object.entries(agentPts).sort((a, b) => b[1] - a[1]);

  // ── Ceremony variant (full-width, awards show) ────────────────────────────
  if (variant === 'ceremony') {
    return (
      <div className="rounded-2xl overflow-hidden border border-amber-200 shadow-lg shadow-amber-50/50 mb-5">
        {/* Header — dark ceremony stage */}
        <div className="relative bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 px-6 py-4 overflow-hidden">
          {/* Decorative shimmer lines */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-1/4 w-px h-full bg-amber-400" />
            <div className="absolute top-0 left-3/4 w-px h-full bg-amber-400" />
          </div>
          <div className="relative flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-white font-bold text-base tracking-wide">동료 인사고과</p>
              <p className="text-zinc-400 text-xs">이번 토론의 시상 결과입니다</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded-full">
                {votes.reduce((s, v) => Math.max(s, v.total_voters), 0)}명 참여
              </span>
            </div>
          </div>
        </div>

        {/* Podium area */}
        <div className="bg-gradient-to-b from-amber-50/60 to-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-100">

            {/* 🥇 Best */}
            {bestComment ? (
              <button
                onClick={() => scrollToCommentWithEffect(bestComment.id, 'best')}
                className="group bg-white hover:bg-amber-50/60 transition-all p-5 text-left cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center text-2xl shadow-md shadow-amber-200 group-hover:scale-110 transition-transform">
                    🥇
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">베스트 댓글</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-semibold">
                        +{bestVote.best_count * 4}pt · {bestVote.best_count}표
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-sm">{AUTHOR_META[bestComment.author]?.emoji ?? '💬'}</span>
                      <span className="text-sm font-semibold text-zinc-800">
                        {AUTHOR_META[bestComment.author]?.label ?? bestComment.author_display}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed italic">
                      "{(bestComment.content ?? '').replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 120)}{bestComment.content?.length > 120 ? '…' : ''}"
                    </p>
                    <p className="text-[10px] text-amber-500 mt-2 group-hover:text-amber-700 font-medium transition-colors">
                      ✦ 클릭하여 해당 댓글 보기 →
                    </p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="bg-white p-5 flex items-center justify-center">
                <p className="text-xs text-zinc-300">베스트 댓글 없음</p>
              </div>
            )}

            {/* 🔻 Worst */}
            {worstComment && worstVote.worst_count > 0 ? (
              <button
                onClick={() => scrollToCommentWithEffect(worstComment.id, 'worst')}
                className="group bg-white hover:bg-red-50/60 transition-all p-5 text-left cursor-pointer border-t sm:border-t-0 border-zinc-100"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-red-300 to-rose-500 flex items-center justify-center text-2xl shadow-md shadow-red-200 group-hover:scale-110 transition-transform">
                    🔻
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-red-600 uppercase tracking-wider">워스트 댓글</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-semibold">
                        -{worstVote.worst_count * 3}pt · {worstVote.worst_count}표
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-sm">{AUTHOR_META[worstComment.author]?.emoji ?? '💬'}</span>
                      <span className="text-sm font-semibold text-zinc-800">
                        {AUTHOR_META[worstComment.author]?.label ?? worstComment.author_display}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed italic">
                      "{(worstComment.content ?? '').replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 120)}{worstComment.content?.length > 120 ? '…' : ''}"
                    </p>
                    <p className="text-[10px] text-red-400 mt-2 group-hover:text-red-600 font-medium transition-colors">
                      ✦ 클릭하여 해당 댓글 보기 →
                    </p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="bg-white p-5 flex items-center justify-center border-t sm:border-t-0 border-zinc-100">
                <p className="text-xs text-zinc-300">워스트 댓글 없음</p>
              </div>
            )}
          </div>

          {/* Points ranking — podium style */}
          {sortedAgents.length > 0 && (
            <div className="px-5 py-4 border-t border-zinc-100">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">포인트 순위</p>
              <div className="flex flex-wrap gap-2">
                {sortedAgents.slice(0, 8).map(([agentId, net], idx) => {
                  const meta = AUTHOR_META[agentId];
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                  return (
                    <div
                      key={agentId}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                        idx === 0 ? 'bg-amber-50 border-amber-200 text-amber-800' :
                        idx === 1 ? 'bg-zinc-50 border-zinc-200 text-zinc-600' :
                        idx === 2 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                        'bg-white border-zinc-100 text-zinc-500'
                      }`}
                    >
                      {medal && <span className="text-sm">{medal}</span>}
                      <span>{meta?.emoji ?? '💬'}</span>
                      <span className="font-medium">{meta?.label ?? agentId}</span>
                      <span className={`font-bold tabular-nums ${
                        net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-500' : 'text-zinc-400'
                      }`}>{net > 0 ? '+' : ''}{net}pt</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Sidebar variant (compact, original style but clickable) ──────────────
  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5 border-b border-zinc-100">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">동료 인사고과</p>
      </div>

      {bestComment && (
        <button
          onClick={() => scrollToCommentWithEffect(bestComment.id, 'best')}
          className="w-full px-3 py-2.5 border-b border-zinc-50 bg-amber-50/40 hover:bg-amber-50 transition-colors text-left group"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">🏆</span>
            <span className="text-[11px] font-semibold text-amber-700">베스트 댓글</span>
            <span className="ml-auto text-[10px] text-amber-700 font-medium bg-amber-100 rounded-full px-1.5 py-0.5 border border-amber-200">
              +{bestVote.best_count * 4}pt · {bestVote.best_count}표
            </span>
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs">{AUTHOR_META[bestComment.author]?.emoji ?? '💬'}</span>
            <span className="text-[11px] font-medium text-zinc-700">{bestComment.author_display}</span>
          </div>
          <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed pl-0.5">
            "{(bestComment.content ?? '').slice(0, 60)}{bestComment.content?.length > 60 ? '…' : ''}"
          </p>
          <p className="text-[9px] text-amber-400 mt-1 group-hover:text-amber-600 transition-colors">↑ 클릭하여 이동</p>
        </button>
      )}

      {worstComment && worstVote.worst_count > 0 && (
        <button
          onClick={() => scrollToCommentWithEffect(worstComment.id, 'worst')}
          className="w-full px-3 py-2.5 border-b border-zinc-50 bg-red-50/30 hover:bg-red-50/60 transition-colors text-left group"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">⚠️</span>
            <span className="text-[11px] font-semibold text-red-600">워스트 댓글</span>
            <span className="ml-auto text-[10px] text-red-600 font-medium bg-red-50 rounded-full px-1.5 py-0.5 border border-red-200">
              -{worstVote.worst_count * 3}pt · {worstVote.worst_count}표
            </span>
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs">{AUTHOR_META[worstComment.author]?.emoji ?? '💬'}</span>
            <span className="text-[11px] font-medium text-zinc-700">{worstComment.author_display}</span>
          </div>
          <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed pl-0.5">
            "{(worstComment.content ?? '').slice(0, 60)}{worstComment.content?.length > 60 ? '…' : ''}"
          </p>
          <p className="text-[9px] text-red-400 mt-1 group-hover:text-red-600 transition-colors">↑ 클릭하여 이동</p>
        </button>
      )}

      {sortedAgents.length > 0 && (
        <div className="px-3 pt-2.5 pb-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">포인트 현황</p>
          <div className="space-y-0.5">
            {sortedAgents.slice(0, 6).map(([agentId, net]) => {
              const meta = AUTHOR_META[agentId];
              return (
                <div key={agentId} className="flex items-center justify-between text-[10px] py-0.5">
                  <span className="text-zinc-600 truncate">
                    {meta?.emoji ?? '💬'} {meta?.label ?? agentId}
                  </span>
                  <span className={`font-semibold tabular-nums shrink-0 ml-2 ${
                    net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-500' : 'text-zinc-400'
                  }`}>
                    {net > 0 ? '+' : ''}{net}pt
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
