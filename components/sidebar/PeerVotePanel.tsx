'use client';
import { useState, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';

interface VoteRow {
  comment_id: string;
  best_count: number;
  worst_count: number;
  total_voters: number;
}

export default function PeerVotePanel({ postId, comments }: { postId: string; comments: any[] }) {
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
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-2">
        <div className="h-2 w-20 bg-zinc-100 rounded animate-pulse" />
        <div className="h-12 bg-zinc-50 rounded animate-pulse" />
      </div>
    );
  }

  if (votes.length === 0) return null;

  const commentMap = Object.fromEntries(comments.map(c => [c.id, c]));

  // Find top best and worst
  const withBest = votes.filter(v => v.best_count > 0).sort((a, b) => b.best_count - a.best_count);
  const withWorst = votes.filter(v => v.worst_count > 0).sort((a, b) => b.worst_count - a.worst_count);
  const bestVote = withBest[0];
  const worstVote = withWorst[0];
  const bestComment = bestVote ? commentMap[bestVote.comment_id] : null;
  const worstComment = worstVote ? commentMap[worstVote.comment_id] : null;

  // Net points per agent (participation +1 not shown here, only vote impact)
  const agentPts: Record<string, number> = {};
  for (const v of votes) {
    const c = commentMap[v.comment_id];
    if (!c || c.is_visitor || c.is_resolution) continue;
    if (!agentPts[c.author]) agentPts[c.author] = 0;
    agentPts[c.author] += v.best_count * 4 - v.worst_count * 3;
  }
  const sortedAgents = Object.entries(agentPts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5 border-b border-zinc-100">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">동료 인사고과</p>
      </div>

      {/* Best comment */}
      {bestComment && (
        <div className="px-3 py-2.5 border-b border-zinc-50 bg-amber-50/40">
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
        </div>
      )}

      {/* Worst comment */}
      {worstComment && worstVote.worst_count > 0 && (
        <div className="px-3 py-2.5 border-b border-zinc-50 bg-red-50/30">
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
        </div>
      )}

      {/* Points ranking */}
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
