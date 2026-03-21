'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AUTHOR_META, DISCUSSION_WINDOW_MS, MIN_COMMENT_LENGTH } from '@/lib/constants';
import { timeAgo, fmtDateShort } from '@/lib/utils';
import MarkdownContent from '@/components/MarkdownContent';
import VisitorCommentForm from './VisitorCommentForm';
import { useEvent } from '@/contexts/EventContext';

function DiscussionSummary({ postId, commentCount }: { postId: string; commentCount: number }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (commentCount < 2) return;
    setLoading(true);
    fetch(`/api/posts/${postId}/summarize`)
      .then(r => r.json())
      .then(d => { if (d.summary) setSummary(d.summary); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, commentCount]);

  if (commentCount < 2) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-500 animate-pulse mb-4">
        <span>✨</span> 토론 요약 생성 중...
      </div>
    );
  }

  if (!summary) return null;

  const lines = summary.split('\n').filter(l => l.trim()).slice(0, 3);

  return (
    <div className="mb-5 rounded-xl border-2 border-violet-200 overflow-hidden">
      <div className="bg-violet-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-white text-sm">✨</span>
        <span className="text-white font-semibold text-sm">AI 토론 요약</span>
        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-violet-500 text-violet-100 text-[10px] font-medium tracking-wide">실시간</span>
        <span className="ml-auto text-violet-200 text-xs">{lines.length}개 핵심 포인트</span>
      </div>
      <div className="bg-white px-4 py-3 space-y-2.5">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-zinc-700 leading-relaxed">
              {line.replace(/^[•\-]\s*/, '')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const PERSONA_BADGE: Record<string, string> = {
  'infra-lead':       'bg-slate-100 text-slate-700 border-slate-300',
  'career-lead':      'bg-emerald-50 text-emerald-700 border-emerald-200',
  'brand-lead':       'bg-pink-50 text-pink-700 border-pink-200',
  'finance-lead':     'bg-green-50 text-green-700 border-green-200',
  'record-lead':      'bg-cyan-50 text-cyan-700 border-cyan-200',
  'llm-critic':       'bg-indigo-50 text-indigo-700 border-indigo-200',
  'academy-team':     'bg-pink-50 text-pink-700 border-pink-200',
  'jarvis-proposer':  'bg-violet-50 text-violet-700 border-violet-200',
  'board-synthesizer':'bg-yellow-50 text-yellow-800 border-yellow-200',
  'council-team':     'bg-yellow-50 text-yellow-800 border-yellow-200',
};

const PERSONA_ACCENT: Record<string, string> = {
  'infra-lead':       'border-l-slate-400',
  'career-lead':      'border-l-emerald-400',
  'brand-lead':       'border-l-pink-400',
  'finance-lead':     'border-l-green-400',
  'record-lead':      'border-l-cyan-400',
  'llm-critic':       'border-l-indigo-400',
  'academy-team':     'border-l-pink-400',
  'jarvis-proposer':  'border-l-violet-400',
  'board-synthesizer':'border-l-yellow-400',
  'council-team':     'border-l-yellow-400',
};

const C_SUITE_AGENTS = new Set(['kim-seonhwi', 'jung-mingi', 'lee-jihwan']);

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😂', '🤔'];

type ReactionMap = Record<string, Record<string, { count: number; authors: string[] }>>;

function getVisitorId(isOwner: boolean): string {
  if (isOwner) return 'owner';
  if (typeof window === 'undefined') return 'anon';
  const stored = localStorage.getItem('jarvis-board-visitor');
  if (stored) return stored;
  const id = 'v-' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('jarvis-board-visitor', id);
  return id;
}

// #4 Reactions bar component
function CommentReactions({
  commentId,
  reactions,
  myId,
  onToggle,
}: {
  commentId: string;
  reactions: Record<string, { count: number; authors: string[] }>;
  myId: string;
  onToggle: (commentId: string, emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const existing = Object.entries(reactions);

  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {existing.map(([emoji, { count, authors }]) => {
        const mine = authors.includes(myId);
        return (
          <button
            key={emoji}
            onClick={() => onToggle(commentId, emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all ${
              mine
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50'
            }`}
          >
            {emoji} <span className="font-medium">{count}</span>
          </button>
        );
      })}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(p => !p)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-all"
        >
          + 😊
        </button>
        {showPicker && (
          <div className="absolute left-0 bottom-full mb-1 z-10 flex gap-1 p-1.5 bg-white border border-gray-200 rounded-xl shadow-lg">
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => { onToggle(commentId, e); setShowPicker(false); }}
                className="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-gray-100 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function CommentSummary({
  commentId,
  initialSummary,
  content,
}: {
  commentId: string;
  initialSummary: string | null;
  content: string;
}) {
  const [summary, setSummary] = useState<string | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(!initialSummary && content.length >= 100);
  const isLong = content.length > 200;

  useEffect(() => {
    if (initialSummary || content.length < 100) return;
    fetch(`/api/comments/${commentId}/summarize`)
      .then(r => r.json())
      .then(d => { if (d.summary) setSummary(d.summary); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [commentId, initialSummary, content.length]);

  if (content.length < 100) return null;

  if (loading) {
    return (
      <div className="mt-2 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-lg animate-pulse">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-violet-300">✨</span>
          <span className="text-[11px] text-violet-300">요약 생성 중...</span>
        </div>
        <div className="space-y-1">
          <div className="h-2.5 bg-violet-100 rounded w-full" />
          {isLong && <div className="h-2.5 bg-violet-100 rounded w-3/4" />}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-2 px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-start gap-1.5">
      <span className="text-[10px] text-zinc-400 mt-0.5 shrink-0">💡</span>
      <p className={`text-xs text-zinc-600 leading-relaxed font-medium ${isLong ? 'line-clamp-3' : 'line-clamp-1'}`}>{summary}</p>
    </div>
  );
}

export default function PostComments({
  postId,
  initialComments,
  isOwner,
  postCreatedAt,
  postStatus,
  pausedAt,
  restartedAt = null,
  hideResolutionCard = false,
}: {
  postId: string;
  initialComments: any[];
  isOwner: boolean;
  postCreatedAt: string;
  postStatus: string;
  pausedAt: string | null;
  restartedAt?: string | null;
  hideResolutionCard?: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [toast, setToast] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNewCommentIdRef = useRef<string | null>(null);
  const router = useRouter();
  const [localStatus, setLocalStatus] = useState(postStatus);
  const [paused, setPaused] = useState(!!pausedAt);
  const [pauseLoading, setPauseLoading] = useState(false);

  // #4 Reactions state
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [myId, setMyId] = useState('anon');

  // #21 Typing indicators
  const [typingAgents, setTypingAgents] = useState<Array<{ agent: string; label: string }>>([]);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // #8 Thread reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  // Comment edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const { subscribe } = useEvent();

  // #4 Get visitor ID on mount
  useEffect(() => {
    setMyId(getVisitorId(isOwner));
  }, [isOwner]);

  // #4 Fetch reactions for this post
  useEffect(() => {
    fetch(`/api/reactions?post_id=${postId}`)
      .then(r => r.json())
      .then(data => setReactions(data))
      .catch(() => {});
  }, [postId]);

  // Task #14: compute if discussion time has expired
  const timerBase = restartedAt ?? postCreatedAt;
  const isExpired = localStatus !== 'resolved' &&
    new Date(timerBase.includes('Z') ? timerBase : timerBase + 'Z').getTime() + DISCUSSION_WINDOW_MS < Date.now();

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'new_comment' && ev.post_id === postId) {
        setComments(prev =>
          prev.find(c => c.id === ev.data.id) ? prev : [...prev, ev.data]
        );
        if (ev.data?.is_resolution) setLocalStatus('resolved');
        setNewIds(prev => new Set(prev).add(ev.data.id));
        lastNewCommentIdRef.current = ev.data.id;
        // Clear typing indicator for this agent
        if (ev.data?.author) {
          setTypingAgents(prev => prev.filter(a => a.agent !== ev.data.author));
          clearTimeout(typingTimers.current[ev.data.author]);
        }
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(`💬 ${ev.data?.author_display || '팀원'}이 댓글을 달았습니다`);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }
      if (ev.type === 'comment_deleted' && ev.post_id === postId) {
        setComments(prev => prev.filter(c => c.id !== ev.data?.id));
      }
      if (ev.type === 'comment_updated' && ev.post_id === postId) {
        setComments(prev => prev.map(c =>
          c.id === ev.data?.id ? { ...c, content: ev.data.content } : c
        ));
      }
      // #21 Typing indicator
      if (ev.type === 'agent_typing' && ev.post_id === postId) {
        setTypingAgents(prev => {
          const next = prev.filter(a => a.agent !== ev.data?.agent);
          return [...next, { agent: ev.data?.agent, label: ev.data?.label ?? ev.data?.agent }];
        });
        clearTimeout(typingTimers.current[ev.data?.agent]);
        typingTimers.current[ev.data?.agent] = setTimeout(() => {
          setTypingAgents(prev => prev.filter(a => a.agent !== ev.data?.agent));
        }, 10000);
      }
      if (ev.type === 'post_updated' && ev.post_id === postId && ev.data?.restarted_at) {
        // 재개 시: 이사회 결론 댓글만 제거, AI 토론 댓글은 유지
        setComments(prev => prev.filter((c: any) => !c.is_resolution));
        setLocalStatus('open');
        setPaused(false);
      }
    });
  }, [subscribe, postId]);

  // #4 Toggle reaction handler
  async function handleReaction(commentId: string, emoji: string) {
    // Deep-clone for reliable rollback (nested objects need fresh copies)
    const prev: ReactionMap = JSON.parse(JSON.stringify(reactions));
    // Optimistic update
    setReactions(r => {
      const updated = { ...r };
      if (!updated[commentId]) updated[commentId] = {};
      const slot = updated[commentId][emoji] ?? { count: 0, authors: [] };
      const mine = slot.authors.includes(myId);
      if (mine) {
        updated[commentId][emoji] = {
          count: slot.count - 1,
          authors: slot.authors.filter(a => a !== myId),
        };
        if (updated[commentId][emoji].count === 0) delete updated[commentId][emoji];
      } else {
        updated[commentId][emoji] = {
          count: slot.count + 1,
          authors: [...slot.authors, myId],
        };
      }
      return { ...updated };
    });

    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: commentId, emoji, author: myId }),
      });
      if (!res.ok) throw new Error('reaction failed');
    } catch {
      setReactions(prev); // rollback
    }
  }

  // #8 Submit reply
  async function handleReply(parentId: string) {
    const trimmed = replyContent.trim();
    if (trimmed.length < MIN_COMMENT_LENGTH) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, parent_id: parentId }),
      });
      if (res.ok) {
        const comment = await res.json();
        // SSE may have already added this comment — dedup by id
        setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment]);
        setReplyContent('');
        setReplyingTo(null);
      }
    } finally {
      setReplyLoading(false);
    }
  }

  // Scroll-to-comment from URL hash (e.g. #comment-abc123)
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [awardEffect, setAwardEffect] = useState<{ id: string; type: 'best' | 'worst' } | null>(null);

  function activateHashHighlight() {
    const hash = window.location.hash;
    if (!hash.startsWith('#comment-')) return;
    const targetId = hash.slice('#comment-'.length);
    setHighlightedId(targetId);
    let attempt = 0;
    const tryScroll = () => {
      const el = document.getElementById(`comment-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setHighlightedId(null), 3000);
        return;
      }
      if (attempt < 10) { attempt++; setTimeout(tryScroll, 100); }
    };
    setTimeout(tryScroll, 100);
  }

  useEffect(() => {
    activateHashHighlight();
    window.addEventListener('hashchange', activateHashHighlight);
    function handleAwardEffect(e: Event) {
      const { id, type } = (e as CustomEvent<{ id: string; type: 'best' | 'worst' }>).detail;
      setAwardEffect({ id, type });
      setTimeout(() => setAwardEffect(null), 2800);
    }
    window.addEventListener('comment-award-effect', handleAwardEffect);
    return () => {
      window.removeEventListener('hashchange', activateHashHighlight);
      window.removeEventListener('comment-award-effect', handleAwardEffect);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // #8 Build reply map
  const replyMap: Record<string, any[]> = {};
  for (const c of comments) {
    if (c.parent_id) {
      if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
      replyMap[c.parent_id].push(c);
    }
  }

  // Reaction rankings — top 3 non-resolution root comments by total reaction count
  const reactionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [cid, emojiMap] of Object.entries(reactions)) {
      totals[cid] = Object.values(emojiMap).reduce((s, { count }) => s + count, 0);
    }
    return totals;
  }, [reactions]);

  const rankMap = useMemo(() => {
    const map: Record<string, 1 | 2 | 3> = {};
    comments
      .filter(c => !c.parent_id && !c.is_resolution && (reactionTotals[c.id] ?? 0) > 0)
      .sort((a, b) => (reactionTotals[b.id] ?? 0) - (reactionTotals[a.id] ?? 0))
      .slice(0, 3)
      .forEach((c, i) => { map[c.id] = (i + 1) as 1 | 2 | 3; });
    return map;
  }, [comments, reactionTotals]);

  const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const RANK_STYLE: Record<number, string> = {
    1: 'border-yellow-300 bg-yellow-50/60',
    2: 'border-slate-300 bg-slate-50/60',
    3: 'border-amber-300 bg-amber-50/40',
  };

  // #18 AI vs 인간 탭
  const [viewTab, setViewTab] = useState<'all' | 'ai' | 'human'>('all');

  // Keep chronological order — ranked leaderboard shown separately at top
  const rootComments = useMemo(() => {
    return comments.filter(c => {
      if (c.parent_id) return false;
      if (viewTab === 'ai') return !c.is_visitor;
      if (viewTab === 'human') return !!c.is_visitor;
      return true;
    });
  }, [comments, viewTab]);

  const agentComments = comments.filter(c => !c.is_visitor && !c.is_resolution);
  const humanComments = comments.filter(c => c.is_visitor);

  function renderComment(c: any, isReply = false) {
    const isVisitor = Boolean(c.is_visitor);
    const isAgentComment = !isVisitor && c.author !== 'owner';
    const isResolution = Boolean(c.is_resolution);
    const isNew = newIds.has(c.id);
    const meta = !isVisitor
      ? (AUTHOR_META[c.author as keyof typeof AUTHOR_META] ?? {
          label: c.author_display,
          color: 'bg-gray-100 text-gray-700 border-gray-200',
          emoji: '💬',
        })
      : null;

    // Resolution hero card — hide for owner (ConsensusPanel supersedes it)
    if (isResolution) {
      if (hideResolutionCard) return null;
      return (
        <div key={c.id} className={isNew ? 'animate-slide-in' : ''}>
          <div className="flex items-center gap-3 my-6 text-xs text-gray-400">
            <div className="flex-1 border-t border-gray-200" />
            <span>── 토론 종료 ──</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <div className="resolution-hero p-5 my-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏆</span>
              <span className="text-emerald-700 font-bold text-base">최종 토론 결론</span>
              <div className="flex-1 h-px bg-emerald-200 ml-2" />
            </div>
            <div className="flex gap-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${meta?.color?.includes('from-') ? meta.color : 'from-emerald-500 to-teal-600'} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                {meta?.emoji || c.author_display?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {isVisitor ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 border border-gray-200 text-gray-600 text-sm">
                      👤 {c.author_display}
                    </span>
                  ) : meta ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-sm bg-emerald-50 text-emerald-700 border-emerald-200">
                      {meta.emoji} {meta.label}
                    </span>
                  ) : null}
                  <span className="text-gray-400 text-xs">{fmtDateShort(c.created_at)} · {timeAgo(c.created_at)}</span>
                </div>
                <MarkdownContent content={c.content} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isBest = Boolean(c.is_best);
    const rank = rankMap[c.id];
    const isOwnerComment = c.author === 'owner';
    const isCLevel = !isVisitor && !isOwnerComment && C_SUITE_AGENTS.has(c.author);
    const badgeClass = isOwnerComment
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : (PERSONA_BADGE[c.author] ?? (meta?.color?.includes('from-') ? 'bg-gray-100 text-gray-700 border-gray-200' : (meta?.color ?? 'bg-gray-100 text-gray-700 border-gray-200')));

    const accentBorder = !isVisitor && !isOwnerComment && !isReply
      ? (PERSONA_ACCENT[c.author] ?? 'border-l-zinc-300')
      : '';

    const commentReactions = reactions[c.id] ?? {};

    const isHighlighted = highlightedId === c.id;
    const awardType = awardEffect && awardEffect.id === c.id ? awardEffect.type : null;
    return (
      <div
        id={`comment-${c.id}`}
        key={c.id}
        className={`scroll-mt-20 flex gap-3 p-4 rounded-xl bg-white hover:shadow-sm transition-shadow ${isNew ? 'animate-slide-in' : ''} ${isCLevel ? 'shadow-sm' : ''} ${
          awardType === 'best'  ? 'comment-award-best ring-2 ring-amber-400 ring-offset-2' :
          awardType === 'worst' ? 'comment-award-worst ring-2 ring-red-400 ring-offset-2' :
          isHighlighted ? 'ring-2 ring-indigo-400 ring-offset-1 bg-indigo-50/40' :
          isReply
            ? 'mt-1 border border-l-2 border-l-indigo-200 border-gray-100'
            : rank
            ? `border border-l-4 ${RANK_STYLE[rank]} ${rank === 1 ? 'border-l-yellow-400' : rank === 2 ? 'border-l-slate-400' : 'border-l-amber-500'}`
            : isBest
            ? 'border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50/30'
            : `border border-gray-100 border-l-4 ${accentBorder} hover:border-gray-200`
        }`}
      >
        {/* Avatar */}
        {isVisitor ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {c.author_display?.charAt(0) || '?'}
          </div>
        ) : isOwnerComment ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {meta?.emoji || '👑'}
          </div>
        ) : isCLevel ? (
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
            meta?.color?.includes('from-') ? meta.color : 'from-gray-400 to-gray-500'
          } flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ring-2 ring-offset-1 ring-orange-300`}>
            {meta?.emoji || c.author_display?.charAt(0) || '?'}
          </div>
        ) : (
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${
            meta?.color?.includes('from-') ? meta.color : 'from-gray-400 to-gray-500'
          } flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
            {meta?.emoji || c.author_display?.charAt(0) || '?'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {isVisitor ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-gray-600 text-xs">
                👤 {c.author_display}
              </span>
            ) : meta ? (
              <>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${badgeClass}`}>
                  {meta.emoji} {meta.label ?? c.author_display}
                </span>
                {isCLevel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200 text-orange-600 font-semibold">
                    임원
                  </span>
                )}
                {meta.description && meta.isAgent !== false && (
                  <span className="text-[11px] text-zinc-400">{meta.description}</span>
                )}
              </>
            ) : null}
            {rank && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold border ${
                rank === 1 ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
                rank === 2 ? 'bg-slate-50 border-slate-300 text-slate-600' :
                'bg-amber-50 border-amber-300 text-amber-700'
              }`}>
                {RANK_MEDAL[rank]} {rank === 1 ? '금' : rank === 2 ? '은' : '동'}
              </span>
            )}
            {isBest && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-semibold">
                ⭐ 베스트
              </span>
            )}
            <span className="text-gray-400 text-xs">{timeAgo(c.created_at)}</span>
          </div>

          {/* Full comment content */}
          <MarkdownContent content={c.content} />

          {/* AI 요약 — 댓글 하단 표시 (길면 3줄, 짧으면 1줄) */}
          {!isVisitor && !isOwnerComment && (
            <CommentSummary commentId={c.id} initialSummary={c.ai_summary} content={c.content} />
          )}

          {/* #4 Reactions */}
          <CommentReactions
            commentId={c.id}
            reactions={commentReactions}
            myId={myId}
            onToggle={handleReaction}
          />

          {/* Owner actions: reply + best toggle + edit + delete */}
          {!isReply && isOwner && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                className={`text-[11px] transition-colors ${
                  replyingTo === c.id
                    ? 'text-indigo-400 hover:text-gray-400'
                    : isAgentComment
                    ? 'text-indigo-400 hover:text-indigo-600 font-medium'
                    : 'text-gray-400 hover:text-indigo-500'
                }`}
                title={isAgentComment ? `${c.author_display}가 자동으로 답변합니다` : undefined}
              >
                {replyingTo === c.id ? '취소' : isAgentComment ? '↩ 답글 🤖' : '↩ 답글'}
              </button>
              {/* #12 Best comment toggle */}
              <button
                onClick={async () => {
                  const res = await fetch(`/api/comments/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                  if (res.ok) {
                    const data = await res.json();
                    setComments(prev => prev.map(cm => cm.id === c.id ? { ...cm, is_best: data.is_best } : cm));
                  }
                }}
                className={`text-[11px] transition-colors ${c.is_best ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-amber-400'}`}
              >
                {c.is_best ? '⭐ 베스트' : '☆ 베스트 선정'}
              </button>
              {/* Comment edit button */}
              <button
                onClick={() => {
                  if (editingId === c.id) {
                    setEditingId(null);
                  } else {
                    setEditingId(c.id);
                    setEditContent(c.content);
                  }
                }}
                className="text-[11px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                {editingId === c.id ? '취소' : '✏ 수정'}
              </button>
              {/* #16 Delete comment */}
              <button
                disabled={deletingIds.has(c.id)}
                onClick={async () => {
                  if (deletingIds.has(c.id)) return;
                  if (!confirm('댓글을 삭제하시겠습니까?')) return;
                  setDeletingIds(prev => new Set(prev).add(c.id));
                  try {
                    const res = await fetch(`/api/comments/${c.id}`, { method: 'DELETE' });
                    if (res.ok) setComments(prev => prev.filter(cm => cm.id !== c.id));
                  } finally {
                    setDeletingIds(prev => { const s = new Set(prev); s.delete(c.id); return s; });
                  }
                }}
                className="ml-auto text-[11px] text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                title="댓글 삭제"
              >
                × 삭제
              </button>
            </div>
          )}
          {/* Inline edit form */}
          {editingId === c.id && isOwner && (
            <div className="mt-2 flex gap-2">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={3}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none bg-blue-50/40"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={async () => {
                    if (editContent.trim().length < 5) return;
                    setEditLoading(true);
                    try {
                      const res = await fetch(`/api/comments/${c.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: editContent.trim() }),
                      });
                      if (res.ok) {
                        setComments(prev => prev.map(cm =>
                          cm.id === c.id ? { ...cm, content: editContent.trim() } : cm
                        ));
                        setEditingId(null);
                      }
                    } finally {
                      setEditLoading(false);
                    }
                  }}
                  disabled={editLoading || editContent.trim().length < 5}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {editLoading ? '...' : '저장'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {/* Reply-only delete for owner */}
          {isReply && isOwner && (
            <div className="mt-1.5 flex justify-end">
              <button
                disabled={deletingIds.has(c.id)}
                onClick={async () => {
                  if (deletingIds.has(c.id)) return;
                  if (!confirm('댓글을 삭제하시겠습니까?')) return;
                  setDeletingIds(prev => new Set(prev).add(c.id));
                  try {
                    const res = await fetch(`/api/comments/${c.id}`, { method: 'DELETE' });
                    if (res.ok) setComments(prev => prev.filter(cm => cm.id !== c.id));
                  } finally {
                    setDeletingIds(prev => { const s = new Set(prev); s.delete(c.id); return s; });
                  }
                }}
                className="text-[11px] text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                title="댓글 삭제"
              >
                × 삭제
              </button>
            </div>
          )}

          {/* Inline reply form */}
          {replyingTo === c.id && (
            <div className="mt-2 space-y-1.5">
              {isAgentComment && (
                <p className="text-[11px] text-indigo-400 flex items-center gap-1">
                  🤖 <span>{c.author_display}가 대화를 이어갑니다</span>
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                  placeholder={isAgentComment ? `${c.author_display}에게 의견을 전달하세요...` : '답글 작성...'}
                  rows={2}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none bg-gray-50"
                />
                <button
                  onClick={() => handleReply(c.id)}
                  disabled={replyLoading || replyContent.trim().length < MIN_COMMENT_LENGTH}
                  className="self-end px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {replyLoading ? '...' : '게시'}
                </button>
              </div>
              {isAgentComment && (
                <div className="flex gap-1.5 flex-wrap">
                  {['동의합니다', '재검토가 필요합니다', '구체적인 근거가 있나요?'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setReplyContent(chip)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-200 text-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3 relative">
      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 text-sm animate-slide-in-up min-w-[240px] max-w-sm cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => {
            if (lastNewCommentIdRef.current) {
              document.getElementById(`comment-${lastNewCommentIdRef.current}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setToast(null);
          }}
        >
          <span className="text-lg shrink-0">💬</span>
          <span className="flex-1 text-gray-700 text-xs leading-snug">{toast} <span className="text-indigo-400 font-medium">→ 이동</span></span>
          <button
            onClick={(e) => { e.stopPropagation(); setToast(null); }}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-base leading-none"
            aria-label="알림 닫기"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Comment section header ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-800">댓글</span>
            <span className="text-sm text-zinc-400 tabular-nums">{comments.length}개</span>
          </div>
          {/* Pause/Resume control — owner only */}
          {isOwner && localStatus !== 'resolved' && (
            <button
              onClick={async () => {
                setPauseLoading(true);
                try {
                  const res = await fetch(`/api/posts/${postId}/pause`, { method: 'PATCH' });
                  const data = await res.json();
                  setPaused(data.paused);
                  // Refresh server component so StickyCountdownBar/CountdownTimer get new expiresAt
                  router.refresh();
                } catch { /* ignore */ }
                finally { setPauseLoading(false); }
              }}
              disabled={pauseLoading}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                paused
                  ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300'
              } disabled:opacity-50`}
            >
              {pauseLoading
                ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                : paused ? '▶' : '⏸'
              }
              {paused ? '토론 재개' : '일시정지'}
            </button>
          )}
        </div>
        {/* View tabs */}
        <div className="flex items-center gap-0.5 bg-zinc-100 rounded-xl p-1 w-fit">
          {([
            ['all', `전체 ${comments.length}`],
            ['ai', `🤖 AI ${agentComments.length}`],
            ['human', `👤 팀원 ${humanComments.length}`],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setViewTab(tab)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewTab === tab
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Paused banner */}
      {paused && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl mb-2">
          <span className="text-xl">⏸</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">토론 일시정지</p>
            <p className="text-amber-600 text-xs mt-0.5">에이전트 댓글이 차단됩니다. 대표님이 재개하면 토론이 계속됩니다.</p>
          </div>
        </div>
      )}

      {/* Best comment leaderboard — shown when discussion has reaction votes */}
      {Object.keys(rankMap).length > 0 && localStatus !== 'resolved' && (
        <div className="mb-4 rounded-xl border border-zinc-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900">
            <span className="text-sm">🏆</span>
            <span className="text-white font-semibold text-sm">반응 TOP {Object.keys(rankMap).length}</span>
            <span className="ml-auto text-zinc-400 text-xs">리액션 기준 자동 집계</span>
          </div>
          <div className="divide-y divide-zinc-100 bg-white">
            {Object.entries(rankMap)
              .sort(([, a], [, b]) => a - b)
              .map(([cid, r]) => {
                const c = comments.find(x => x.id === cid);
                if (!c) return null;
                const total = reactionTotals[cid] ?? 0;
                return (
                  <div key={cid} className={`flex items-start gap-3 px-4 py-3 ${r === 1 ? 'bg-yellow-50/60' : r === 2 ? 'bg-slate-50/60' : 'bg-amber-50/40'}`}>
                    <span className="text-xl mt-0.5 flex-shrink-0">{RANK_MEDAL[r]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 font-medium mb-0.5">{c.author_display}</p>
                      <p className="text-sm text-zinc-800 line-clamp-2">{c.content?.replace(/[#*`]/g, '').slice(0, 120)}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full">
                      👍 {total}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Expired CTA for owner */}
      {isExpired && !paused && isOwner && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-2 text-sm">
          <span>⏰</span>
          <div className="flex-1">
            <p className="font-medium text-amber-800 text-xs">토론 시간이 종료되었습니다</p>
            <p className="text-amber-600 text-xs">결론 댓글을 작성해 주세요</p>
          </div>
          <button
            onClick={() => document.getElementById('comment-form')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-xs px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            결론 작성 →
          </button>
        </div>
      )}

      {/* Discussion summary — prominent 3-line summary for quick reading */}
      <DiscussionSummary postId={postId} commentCount={comments.length} />

      {/* #8 Threaded comment list */}
      {rootComments.length === 0 && viewTab === 'all' && (
        <div className="flex flex-col items-center justify-center py-10 text-center bg-white border border-dashed border-zinc-200 rounded-xl">
          <div className="text-3xl mb-3 opacity-40">💬</div>
          <p className="text-sm font-medium text-zinc-500">아직 의견이 없습니다</p>
          <p className="text-xs text-zinc-400 mt-1">
            {localStatus === 'resolved' ? '이 토론은 의견 없이 종료되었습니다.' : 'AI 팀원들이 곧 의견을 작성합니다.'}
          </p>
        </div>
      )}
      {rootComments.length === 0 && viewTab !== 'all' && (
        <div className="py-6 text-center text-xs text-zinc-400">
          {viewTab === 'ai' ? '🤖 AI 의견이 없습니다' : '👤 팀원 의견이 없습니다'}
        </div>
      )}
      {rootComments.map((c: any) => (
        <div key={c.id}>
          {renderComment(c, false)}
          {/* Replies — visually nested 1 level deep */}
          {(replyMap[c.id] ?? []).length > 0 && (
            <div className="ml-6 border-l-2 border-zinc-100 pl-3 space-y-2 mt-1">
              {(replyMap[c.id] ?? []).map((reply: any) => renderComment(reply, true))}
            </div>
          )}
        </div>
      ))}

      {/* #21 Typing indicators */}
      {typingAgents.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <span className="text-xs text-indigo-600">
            {typingAgents.map(a => a.label).join(', ')}이 응답 작성 중...
          </span>
        </div>
      )}

      {/* Comment submission form */}
      <div id="comment-form">
        <VisitorCommentForm
          postId={postId}
          isOwner={isOwner}
          onSubmitted={comment => setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment])}
        />
      </div>
    </section>
  );
}
