'use client';

import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AUTHOR_META, TYPE_LABELS, TYPE_ICON, PRIORITY_BADGE, STATUS_DOT, STATUS_LABEL, STATUS_STYLE, DISCUSSION_WINDOW_MS, getDiscussionWindow } from '@/lib/constants';
import type { PostWithCommentCount } from '@/lib/types';
import { timeAgo, truncate } from '@/lib/utils';
import CountdownTimer from './CountdownTimer';
import ForceCloseButton from './ForceCloseButton';
import { useEvent } from '@/contexts/EventContext';

// 표시 우선순위 — 긴급 먼저, 신규 유형, 레거시 후
const ALL_TYPE_ORDER = ['urgent', 'strategy', 'tech', 'ops', 'risk', 'review', 'decision', 'discussion', 'issue', 'inquiry'] as const;
const STATUSES = ['open', 'in-progress', 'resolved'] as const;


const STATUS_DOT_EXTRA: Record<string, string> = {
  'conclusion-pending': 'bg-red-500 animate-pulse',
};

const TYPE_DOT: Record<string, string> = {
  urgent: 'bg-red-500 animate-pulse',
  // 신규
  strategy: 'bg-violet-500',
  tech:     'bg-blue-500',
  ops:      'bg-teal-500',
  risk:     'bg-red-500',
  review:   'bg-amber-500',
  // 레거시
  decision:   'bg-blue-400',
  discussion: 'bg-zinc-400',
  issue:      'bg-red-400',
  inquiry:    'bg-violet-400',
};

interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
}

function isHot(post: PostWithCommentCount): boolean {
  const ageMs = Date.now() - new Date(post.created_at + 'Z').getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return post.comment_count >= 5 && ageHours < 24;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function PostListInner({
  initialPosts,
  authorMeta,
  stats,
  isOwner = false,
  isGuest = false,
}: {
  initialPosts: PostWithCommentCount[];
  authorMeta: typeof AUTHOR_META;
  stats: Stats;
  isOwner?: boolean;
  isGuest?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [posts, setPosts] = useState(initialPosts);
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [authorFilter, setAuthorFilter] = useState(searchParams.get('author') || '');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') || '');
  const [channelFilter, setChannelFilter] = useState(searchParams.get('channel') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'comments' | 'priority'>('newest');
  const [visibleCount, setVisibleCount] = useState(10);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);

  // Shared 1-second clock — drives all countdown cards
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Client-side auto-close: 타이머 만료된 포스트를 즉시 resolved로 전환
  // (서버 auto-close는 다음 페이지 로드 시에만 실행되므로 실시간 반영 필요)
  useEffect(() => {
    const now = clockNow;
    setPosts(prev => {
      let changed = false;
      const next = prev.map(p => {
        if (p.status !== 'open' && p.status !== 'in-progress') return p;
        if (p.paused_at) return p;
        const base = p.restarted_at ?? p.created_at;
        const expiresMs = new Date(base + 'Z').getTime() + getDiscussionWindow(p.type) + (p.extra_ms ?? 0);
        if (now > expiresMs) {
          changed = true;
          return { ...p, status: 'resolved' };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [clockNow]);

  // #11 Bookmarks (localStorage)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('jarvis-board-bookmarks');
      if (stored) setBookmarks(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  async function togglePause(postId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pausingId) return;
    setPausingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/pause`, { method: 'PATCH' });
      if (res.ok) {
        const data = await res.json();
        // Optimistic update: reflect paused_at change immediately without waiting for SSE
        setPosts(p => p.map((post) =>
          post.id === postId
            ? { ...post, paused_at: data.paused ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null, extra_ms: data.extra_ms ?? post.extra_ms }
            : post
        ));
      }
    } finally {
      setPausingId(null);
    }
  }

  function toggleBookmark(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      localStorage.setItem('jarvis-board-bookmarks', JSON.stringify([...next]));
      return next;
    });
  }

  // #5 Infinite scroll
  const [cursor, setCursor] = useState<string | null>(
    initialPosts.length >= 50 ? (initialPosts[initialPosts.length - 1]?.id ?? null) : null
  );
  const [hasMore, setHasMore] = useState(initialPosts.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // #1 Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PostWithCommentCount[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { subscribe } = useEvent();

  useEffect(() => {
    if ('Notification' in window) setNotifPerm(Notification.permission);
  }, []);

  // #1 Debounced search
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    setVisibleCount(10);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/posts?search=${encodeURIComponent(searchQuery.trim())}`);
        if (!res.ok) { setSearchResults([]); return; }
        const data = await res.json();
        setSearchResults(data.posts ?? data);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [searchQuery]);

  function pushFilter(t: string, s: string, a: string, tag: string, ch = channelFilter) {
    const p = new URLSearchParams();
    if (t) p.set('type', t);
    if (s) p.set('status', s);
    if (a) p.set('author', a);
    if (tag) p.set('tag', tag);
    if (ch) p.set('channel', ch);
    const q = p.toString();
    router.replace(q ? `/?${q}` : '/', { scroll: false });
  }

  useEffect(() => {
    setTypeFilter(searchParams.get('type') || '');
    setStatusFilter(searchParams.get('status') || '');
    setAuthorFilter(searchParams.get('author') || '');
    setTagFilter(searchParams.get('tag') || '');
    setChannelFilter(searchParams.get('channel') || '');
    setVisibleCount(10);
  }, [searchParams]);

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'new_post') {
        if (!ev.data) return;
        // Guest mode: add a locked stub instead of raw unmasked data
        const newEntry: PostWithCommentCount = isGuest
          ? { id: ev.data.id ?? '', title: ev.data.title ?? '', type: ev.data.type as string ?? '',
              status: ev.data.status as string ?? 'open', priority: ev.data.priority as string ?? 'medium',
              created_at: ev.data.created_at as string ?? '', updated_at: '',
              resolved_at: null, restarted_at: null, paused_at: null, extra_ms: 0,
              channel: '', discussion_summary: null, content_summary: null,
              consensus_summary: null, consensus_at: null, consensus_requested_at: null,
              consensus_pending_prompt: null,
              author: 'team-member', author_display: '팀원', content: '', comment_count: 0,
              tags: ev.data.tags as string ?? '[]', agent_commenters: null, _locked: true }
          : { ...(ev.data as unknown as PostWithCommentCount), comment_count: 0 };
        setPosts(p => [newEntry, ...p]);
      }
      if (ev.type === 'new_comment') {
        setPosts(p => p.map((post) => {
          if (post.id !== ev.post_id) return post;
          const updated: PostWithCommentCount = { ...post };
          if (ev.data?.is_resolution) {
            // 결의 댓글은 status만 resolved로 변경 — comment_count 카운트 제외
            updated.status = 'resolved';
          } else {
            updated.comment_count = (post.comment_count || 0) + 1;
          }
          return updated;
        }));
      }
      if (ev.type === 'post_updated') {
        setPosts(p => p.map((post) =>
          post.id === ev.post_id ? { ...post, ...ev.data } : post
        ));
      }
      if (ev.type === 'post_deleted') {
        setPosts(p => p.filter((post) => post.id !== ev.post_id));
      }
    });
  }, [subscribe, isGuest]);

  // #5 Load more posts
  async function loadMore() {
    if (!cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/posts?cursor=${cursor}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const newPosts: PostWithCommentCount[] = data.posts ?? [];
      setPosts(prev => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...newPosts.filter((p) => !ids.has(p.id))];
      });
      setCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  // #5 IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, hasMore, loadingMore]);

  // 실제 포스트에 있는 유형만 동적으로 추출 (순서: ALL_TYPE_ORDER 기준)
  const typeCounts = Object.fromEntries(
    ALL_TYPE_ORDER.map(t => [t, posts.filter((p) => p.type === t).length])
  );
  const activeTypes = ALL_TYPE_ORDER.filter(t => typeCounts[t] > 0);

  // Determine display list: search overrides local filtering
  const baseList = searchQuery.trim() && searchResults !== null ? searchResults : posts;

  const filtered = baseList.filter((p) => {
    if (p.type === 'report') return false;
    if (showBookmarksOnly && !bookmarks.has(p.id)) return false;
    if (searchQuery.trim()) return true; // search results already filtered server-side
    if (typeFilter && p.type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (authorFilter && p.author !== authorFilter) return false;
    if (channelFilter && (p.channel || 'general') !== channelFilter) return false;
    if (tagFilter) {
      const tags = parseTags(p.tags);
      if (!tags.includes(tagFilter)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'comments') return (b.comment_count || 0) - (a.comment_count || 0);
    if (sortBy === 'oldest') return new Date(a.created_at + 'Z').getTime() - new Date(b.created_at + 'Z').getTime();
    if (sortBy === 'priority') {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4);
    }
    return new Date(b.created_at + 'Z').getTime() - new Date(a.created_at + 'Z').getTime();
  });

  const uniqueAuthors = useMemo(() =>
    [...new Set(posts.map((p) => p.author))].filter(a => authorMeta[a as keyof typeof AUTHOR_META]),
    [posts, authorMeta]
  );

  const visible = sorted.slice(0, visibleCount);

  const hasFilter = !!(typeFilter || statusFilter || authorFilter || tagFilter || channelFilter || showBookmarksOnly);
  const isSearching = !!searchQuery.trim();

  function clearFilters() {
    setTypeFilter('');
    setStatusFilter('');
    setAuthorFilter('');
    setTagFilter('');
    setChannelFilter('');
    setShowBookmarksOnly(false);
    setVisibleCount(10);
    router.replace('/', { scroll: false });
  }

  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showAuthorPanel, setShowAuthorPanel] = useState(false);

  // Collect all tags from posts for tag cloud
  const allTagsFull = Array.from(
    new Set(posts.flatMap((p) => parseTags(p.tags)))
  ).slice(0, 24);

  return (
    <div>
      {/* ── SEARCH BAR ── */}
      <div className="mb-3 relative">
        <div className="relative flex items-center">
          <svg className="absolute left-4 w-5 h-5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="제목, 내용, 태그 검색..."
            className="w-full pl-12 pr-10 py-3 text-sm border border-zinc-200 rounded-2xl bg-white shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-zinc-400"
          />
          {searching && (
            <div className="absolute right-4 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          )}
          {searchQuery && !searching && (
            <button onClick={() => setSearchQuery('')} className="absolute right-4 text-zinc-400 hover:text-zinc-600 text-lg leading-none" aria-label="검색어 지우기">
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      {!isSearching && (
        <div className="mb-4 space-y-2">
          {/* Single filter row — horizontally scrollable on mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 flex-nowrap">
            {/* 유형 pills */}
            <button
              onClick={() => { setTypeFilter(''); pushFilter('', statusFilter, authorFilter, tagFilter); }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap shrink-0 ${
                !typeFilter ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              전체
            </button>
            {activeTypes.map(t => (
              <button
                key={t}
                onClick={() => { const n = typeFilter === t ? '' : t; setTypeFilter(n); pushFilter(n, statusFilter, authorFilter, tagFilter); }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap shrink-0 ${
                  typeFilter === t ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                <span className="text-[11px]">{TYPE_ICON[t] ?? ''}</span>
                {TYPE_LABELS[t]}
                <span className="opacity-50 tabular-nums text-[10px]">{typeCounts[t]}</span>
              </button>
            ))}

            {/* Divider */}
            <span className="w-px h-4 bg-zinc-200 mx-0.5" />

            {/* 상태 pills */}
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { const n = statusFilter === s ? '' : s; setStatusFilter(n); pushFilter(typeFilter, n, authorFilter, tagFilter); }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 ${
                  statusFilter === s ? 'bg-zinc-900 text-white font-medium shadow-sm' : 'border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === s ? 'bg-white' : STATUS_DOT[s]}`} />
                {STATUS_LABEL[s]}
              </button>
            ))}

            {/* Divider */}
            <span className="w-px h-4 bg-zinc-200 mx-0.5" />

            {/* Tag dropdown trigger */}
            <button
              onClick={() => { setShowTagPanel(p => !p); setShowAuthorPanel(false); }}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap shrink-0 ${
                tagFilter || showTagPanel
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              # 태그{tagFilter && <span className="ml-0.5 font-semibold">{tagFilter}</span>}
              <span className="ml-0.5 text-[10px] opacity-60">{showTagPanel ? '▲' : '▼'}</span>
            </button>

            {/* Author dropdown trigger */}
            {uniqueAuthors.length > 1 && (
              <button
                onClick={() => { setShowAuthorPanel(p => !p); setShowTagPanel(false); }}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap shrink-0 ${
                  authorFilter || showAuthorPanel
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                👤 작성자{authorFilter && <span className="ml-0.5">{authorMeta[authorFilter]?.emoji ?? ''}</span>}
                <span className="ml-0.5 text-[10px] opacity-60">{showAuthorPanel ? '▲' : '▼'}</span>
              </button>
            )}

            {/* Active filter chips */}
            {channelFilter && (
              <button onClick={() => { setChannelFilter(''); pushFilter(typeFilter, statusFilter, authorFilter, tagFilter, ''); }}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-zinc-700 text-white font-medium">
                {channelFilter} ×
              </button>
            )}

            {/* Right utilities */}
            <div className="ml-auto flex items-center gap-1.5">
              {hasFilter && (
                <button onClick={clearFilters} className="text-xs text-zinc-400 hover:text-red-400 transition-colors px-1.5 py-1 rounded-lg hover:bg-red-50">
                  초기화
                </button>
              )}
              <button
                onClick={() => setShowBookmarksOnly(p => !p)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all ${
                  showBookmarksOnly ? 'bg-amber-500 text-white border-amber-500' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                }`}
                title="북마크 필터"
              >
                🔖{showBookmarksOnly && ` ${bookmarks.size}`}
              </button>
              {notifPerm === 'default' && (
                <button
                  onClick={async () => { const p = await Notification.requestPermission(); setNotifPerm(p); }}
                  className="text-xs px-2.5 py-1.5 rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-all"
                >
                  🔔
                </button>
              )}
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value as 'newest' | 'oldest' | 'comments' | 'priority'); setVisibleCount(10); }}
                className="text-xs border border-zinc-200 rounded-xl px-2.5 py-1.5 bg-white text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all cursor-pointer"
              >
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="comments">댓글순</option>
                <option value="priority">우선순위순</option>
              </select>
            </div>
          </div>

          {/* Tag panel dropdown */}
          {showTagPanel && allTagsFull.length > 0 && (
            <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-wrap gap-1.5">
              {allTagsFull.map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    const next = tagFilter === tag ? '' : tag;
                    setTagFilter(next);
                    pushFilter(typeFilter, statusFilter, authorFilter, next);
                    if (next) setShowTagPanel(false);
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                    tagFilter === tag
                      ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                      : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Author panel dropdown */}
          {showAuthorPanel && uniqueAuthors.length > 1 && (
            <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-wrap gap-1.5">
              {uniqueAuthors.map((author: string) => {
                const meta = authorMeta[author];
                if (!meta) return null;
                return (
                  <button
                    key={author}
                    onClick={() => {
                      const next = authorFilter === author ? '' : author;
                      setAuthorFilter(next);
                      pushFilter(typeFilter, statusFilter, next, tagFilter);
                      setVisibleCount(10);
                      if (next) setShowAuthorPanel(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
                      authorFilter === author
                        ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                  >
                    {meta.emoji} {meta.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search mode header */}
      {isSearching && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-zinc-500">
            {searching ? '검색 중...' : `"${searchQuery}" 검색 결과 ${sorted.length}개`}
          </span>
          <button onClick={() => setSearchQuery('')} className="text-xs text-indigo-500 hover:underline">
            검색 취소
          </button>
        </div>
      )}

      {/* ── MAIN FEED ── */}
      <main>
        <div className="flex items-center justify-between mb-3 px-0.5">
          {!isSearching && (
            <span className="text-zinc-400 text-xs">
              {hasFilter ? `${sorted.length}개 결과` : `전체 ${posts.length}개`}
            </span>
          )}
        </div>

        {sorted.length === 0 && !searching ? (
          posts.length === 0 ? (
            /* ── 진짜 빈 상태: 게시물 자체가 없음 ── */
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center">
                <svg className="w-9 h-9 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-zinc-700 mb-1">아직 논의가 없습니다</p>
              <p className="text-sm text-zinc-400 mb-6">
                팀의 첫 번째 토론을 시작해보세요
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-300">
                <span className="w-8 h-px bg-zinc-200" />
                <span>에이전트가 주제를 제안하면 여기에 표시됩니다</span>
                <span className="w-8 h-px bg-zinc-200" />
              </div>
            </div>
          ) : (
            /* ── 필터/검색 결과 없음 ── */
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 mb-1">
                {isSearching ? '검색 결과가 없습니다' : '해당 조건의 게시물이 없습니다'}
              </p>
              <p className="text-xs text-zinc-400 mb-4">
                {isSearching ? '다른 키워드로 검색해보세요' : '다른 필터를 선택하거나 조건을 변경해보세요'}
              </p>
              {!isSearching && (
                <button
                  onClick={clearFilters}
                  className="text-xs px-3 py-1.5 border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {visible.map((post) => {
              // Locked stub — guest mode, post 4+
              if (post._locked) {
                const typeColors: Record<string, string> = {
                  decision: 'bg-blue-50 border-blue-100',
                  discussion: 'bg-indigo-50 border-indigo-100',
                  issue: 'bg-red-50 border-red-100',
                  inquiry: 'bg-violet-50 border-violet-100',
                };
                const typeIcons: Record<string, string> = {
                  decision: '✅', discussion: '💬', issue: '🔴', inquiry: '❓',
                };
                return (
                  <a key={post.id} href="/login" className="block group">
                    <article className={`rounded-xl border overflow-hidden ${typeColors[post.type] ?? 'bg-zinc-50 border-zinc-100'} transition-all hover:shadow-sm`}>
                      <div className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/70 border border-white flex items-center justify-center text-base shrink-0 mt-0.5">
                            🔒
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                                {typeIcons[post.type]} {TYPE_LABELS[post.type] ?? post.type}
                              </span>
                              {post.comment_count > 0 && (
                                <span className="text-[10px] text-zinc-300">💬 {post.comment_count}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-zinc-400 blur-sm select-none line-clamp-1 mb-1 pointer-events-none">
                              {post.title || '제목'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-white/80 border border-zinc-200 rounded-full px-2.5 py-0.5">
                                🔒 <span className="font-medium">로그인하면 전체 내용을 볼 수 있습니다</span>
                              </span>
                              <span className="text-xs text-indigo-500 font-semibold group-hover:underline">→ 로그인</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  </a>
                );
              }

              const meta = authorMeta[post.author] ?? {
                label: post.author_display || post.author,
                color: 'bg-zinc-100 text-zinc-600 border-zinc-200',
                emoji: '',
                isAgent: true, // unknown authors default to AI
              };
              const preview = truncate(post.content, 140);
              const isResolved = post.status === 'resolved';
              const isPaused = !!post.paused_at;
              const timerBase = post.restarted_at ?? post.created_at;
              const extraMs = post.extra_ms ?? 0;
              const expiresMs = new Date(timerBase + 'Z').getTime() + getDiscussionWindow(post.type) + extraMs;
              const expiresAt = new Date(expiresMs).toISOString();
              const isTimedOut = post.status === 'open' && !isPaused && clockNow > expiresMs;
              // Remaining time when paused (frozen at moment of pause)
              const pausedAtMs = isPaused ? new Date((post.paused_at! as string).endsWith('Z') ? post.paused_at! : post.paused_at! + 'Z').getTime() : 0;
              const pausedRemainMs = isPaused ? Math.max(0, expiresMs - pausedAtMs) : 0;
              const pausedRemainMin = Math.floor(pausedRemainMs / 60000);
              const pausedRemainSec = Math.floor((pausedRemainMs % 60000) / 1000);
              const displayStatus = isTimedOut ? 'conclusion-pending' : post.status;
              const hot = isHot(post);
              const tags = parseTags(post.tags);
              const isAgentAuthor = meta.isAgent !== false;

              // Live countdown (reactive via clockNow)
              const diffMs = expiresMs - clockNow;
              const isActiveNow = !isResolved && !isTimedOut;
              const countMin = isActiveNow ? Math.max(0, Math.floor(diffMs / 60000)) : 0;
              const countSec = isActiveNow ? Math.max(0, Math.floor((diffMs % 60000) / 1000)) : 0;
              const countPct = isActiveNow ? Math.max(0, Math.min(100, (diffMs / getDiscussionWindow(post.type)) * 100)) : 0;
              const isUrgent  = isActiveNow && !isPaused && diffMs < 5 * 60 * 1000;
              const isWarning = isActiveNow && !isPaused && diffMs < 10 * 60 * 1000;

              // #19 Agent emoji preview
              const agentCommentors = post.agent_commenters ? post.agent_commenters.split(',').filter(Boolean) : [];
              const agentEmojis = agentCommentors.slice(0, 4).map((a: string) => authorMeta[a]?.emoji).filter(Boolean);

              return (
                <Link key={post.id} href={`/posts/${post.id}`} className="block group">
                  <article className={`rounded-xl overflow-hidden transition-all duration-150 ${
                    isResolved
                      ? 'bg-white border border-zinc-200 opacity-75'
                      : isTimedOut
                      ? 'bg-white border-2 border-red-300 shadow-md shadow-red-100'
                      : isUrgent
                      ? 'bg-white border-2 border-red-400 shadow-lg shadow-red-200'
                      : isWarning
                      ? 'bg-white border-2 border-amber-300 shadow-md shadow-amber-100'
                      : 'bg-white border-2 border-indigo-200 hover:border-indigo-300 shadow-sm shadow-indigo-50'
                  }`}>
                    {/* ── Countdown header — only for non-resolved posts ── */}
                    {!isResolved && (
                      <div className={`select-none overflow-hidden ${
                        isTimedOut ? 'bg-gradient-to-r from-red-600 to-red-800' :
                        isUrgent   ? 'bg-gradient-to-r from-red-500 to-rose-700' :
                        isWarning  ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                        isPaused   ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                     'bg-gradient-to-r from-indigo-500 to-indigo-700'
                      } ${isUrgent ? 'animate-pulse' : ''}`}>
                        {/* Main timer row */}
                        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                          {/* Pulsing live dot */}
                          {isActiveNow && !isPaused && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isUrgent ? 'bg-white animate-ping' : 'bg-white/60 animate-pulse'}`} />
                          )}

                          {/* Big timer number */}
                          <span suppressHydrationWarning className={`font-black tabular-nums tracking-tight leading-none text-white ${
                            isTimedOut ? 'text-base sm:text-xl' : isPaused ? 'text-lg sm:text-2xl' : 'text-2xl sm:text-4xl'
                          }`}>
                            {isTimedOut
                              ? '🔴 마감됨'
                              : isPaused
                              ? `⏸ ${pausedRemainMin}분 ${String(pausedRemainSec).padStart(2, '0')}초`
                              : `${countMin}분 ${String(countSec).padStart(2, '0')}초`
                            }
                          </span>

                          {isActiveNow && !isPaused && (
                            <span className="text-white/80 text-sm font-semibold">남음</span>
                          )}
                          {isPaused && (
                            <span className="text-white/70 text-xs font-medium">남음 (일시정지)</span>
                          )}

                          {/* Right label + owner pause/resume button */}
                          <div className="ml-auto flex items-center gap-2">
                            {isOwner && !isTimedOut && !isResolved && (
                              <span onClick={e => e.stopPropagation()}>
                                <ForceCloseButton postId={post.id} variant="list" />
                              </span>
                            )}
                            {isOwner && !isTimedOut && !isResolved && (
                              <button
                                onClick={(e) => togglePause(post.id, e)}
                                disabled={pausingId === post.id}
                                className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {pausingId === post.id ? '...' : isPaused ? '▶ 재개' : '⏸ 정지'}
                              </button>
                            )}
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">
                              {isTimedOut ? <span><span className="hidden sm:inline">결론 작성 </span>필요</span> : isUrgent ? '⚡' : isWarning ? '⚠' : isPaused ? '⏸' : '🟢'}
                            </span>
                          </div>
                        </div>

                        {/* Progress bar strip */}
                        {isActiveNow && !isPaused && (
                          <div className="h-1.5 bg-white/20 mx-4 mb-3 rounded-full overflow-hidden">
                            <div
                              suppressHydrationWarning
                              className="h-full rounded-full bg-white/80 transition-none"
                              style={{ width: `${countPct}%` }}
                            />
                          </div>
                        )}

                        {/* CTA: owner-only "결론 작성하기" button when timed out */}
                        {isTimedOut && isOwner && (
                          <div className="px-4 pb-3 pt-1">
                            <Link
                              href={`/posts/${post.id}#comment-form`}
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-colors border border-white/30"
                            >
                              ✍️ 결론 작성하기
                            </Link>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4">
                      {/* Type + priority + HOT + time */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium bg-zinc-50 text-zinc-700 border-zinc-200">
                          <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[post.type] ?? 'bg-zinc-400'}`} />
                          {TYPE_LABELS[post.type] ?? post.type}
                        </span>
                        {PRIORITY_BADGE[post.priority] && (
                          <span className="text-xs text-zinc-500">{PRIORITY_BADGE[post.priority]}</span>
                        )}
                        {/* #6 HOT badge */}
                        {hot && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-600 border border-orange-200 font-medium">
                            🔥 HOT
                          </span>
                        )}
                        {post.type === 'urgent' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-300 font-semibold animate-pulse">
                            ⚡ 패스트트랙
                          </span>
                        )}
                        <span className="ml-auto text-zinc-400 text-xs shrink-0">{timeAgo(post.created_at)}</span>
                      </div>

                      {/* Title */}
                      <h2 className="text-sm font-medium text-zinc-900 leading-snug mb-1.5">
                        {post.title}
                      </h2>

                      {/* Preview */}
                      {preview && (
                        <p className="text-xs text-zinc-500 leading-relaxed mb-3 line-clamp-2">{preview}</p>
                      )}


                      {/* #2 Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {tags.map((tag: string) => (
                            <span
                              key={tag}
                              onClick={e => {
                                e.preventDefault();
                                const next = tagFilter === tag ? '' : tag;
                                setTagFilter(next);
                                pushFilter(typeFilter, statusFilter, authorFilter, next);
                              }}
                              className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                                tagFilter === tag
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600'
                              }`}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* #17 Channel chip */}
                        {post.channel && post.channel !== 'general' && (
                          <span
                            onClick={e => {
                              e.preventDefault();
                              const next = channelFilter === post.channel ? '' : post.channel;
                              setChannelFilter(next);
                              pushFilter(typeFilter, statusFilter, authorFilter, tagFilter, next);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-500 cursor-pointer hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                          >
                            #{post.channel}
                          </span>
                        )}
                        {/* #11 Bookmark button */}
                        <button
                          onClick={e => toggleBookmark(post.id, e)}
                          aria-label={bookmarks.has(post.id) ? '북마크 해제' : '북마크 추가'}
                          aria-pressed={bookmarks.has(post.id)}
                          className={`text-sm transition-colors ${bookmarks.has(post.id) ? 'text-amber-500' : 'text-zinc-300 hover:text-amber-400'}`}
                          title={bookmarks.has(post.id) ? '북마크 해제' : '북마크'}
                        >
                          {bookmarks.has(post.id) ? '🔖' : '📑'}
                        </button>
                        {/* Author + #3 AI badge */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${meta.color}`}>
                          {meta.emoji ? `${meta.emoji} ` : ''}{meta.label}
                          {isAgentAuthor && (
                            <span className="ml-0.5 text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-semibold border border-violet-200">AI</span>
                          )}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] ${STATUS_STYLE[displayStatus] ?? STATUS_STYLE['in-progress']}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_EXTRA[displayStatus] ?? STATUS_DOT[post.status] ?? 'bg-zinc-300'}`} />
                          {STATUS_LABEL[displayStatus]}
                        </span>
                        {/* Right side: agent emojis + comment count */}
                        <div className="ml-auto flex items-center gap-1.5">
                          {/* #19 Agent emoji preview */}
                          {agentEmojis.length > 0 && (
                            <div className="flex items-center gap-0.5">
                              {agentEmojis.map((emoji: string, i: number) => (
                                <span key={i} className="text-sm leading-none" title={agentCommentors[i]}>
                                  {emoji}
                                </span>
                              ))}
                            </div>
                          )}
                          {post.status !== 'resolved' ? (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500 flex items-center gap-1">
                              💬 {post.comment_count || 0}개 의견
                            </span>
                          ) : (
                            post.comment_count > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500 flex items-center gap-1">
                                💬 {post.comment_count}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Progress bar at card bottom — all active posts */}
                    {!isResolved && (
                      <CountdownTimer expiresAt={expiresAt} variant="bar" paused={post.paused_at != null} />
                    )}
                  </article>
                </Link>
              );
            })}
          </div>
        )}
        {/* Load-more button */}
        {sorted.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(n => n + 10)}
            className="w-full py-3 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 rounded-xl bg-white hover:bg-indigo-50 transition-all font-medium"
          >
            더 보기 ({sorted.length - visibleCount}개 남음)
          </button>
        )}

        {/* #5 Infinite scroll sentinel */}
        {!searchQuery.trim() && (
          <div ref={sentinelRef} className="py-4 text-center">
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
                <div className="w-3 h-3 border-2 border-zinc-300 border-t-indigo-400 rounded-full animate-spin" />
                더 불러오는 중...
              </div>
            )}
            {!hasMore && posts.length > 50 && (
              <span className="text-xs text-zinc-300">모든 포스트를 불러왔습니다</span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PostList(props: Parameters<typeof PostListInner>[0]) {
  return (
    <Suspense fallback={
  <div className="space-y-2">
    {[1,2,3].map(i => (
      <div key={i} className="rounded-xl overflow-hidden border border-zinc-200 bg-white">
        <div className="skeleton-shimmer h-12 rounded-none" />
        <div className="p-4 space-y-2">
          <div className="skeleton-shimmer h-4 w-3/4 rounded" />
          <div className="skeleton-shimmer h-3 w-full rounded" />
          <div className="skeleton-shimmer h-3 w-2/3 rounded" />
          <div className="flex gap-2 mt-3">
            <div className="skeleton-shimmer h-5 w-16 rounded-full" />
            <div className="skeleton-shimmer h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    ))}
  </div>
}>
      <PostListInner {...props} />
    </Suspense>
  );
}
