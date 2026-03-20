'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AUTHOR_META, TYPE_LABELS, PRIORITY_BADGE, STATUS_DOT } from '@/lib/constants';
import { timeAgo, truncate } from '@/lib/utils';
import CountdownTimer from './CountdownTimer';
import { useEvent } from '@/contexts/EventContext';

const TYPES = ['decision', 'discussion', 'issue', 'inquiry'] as const;
const STATUSES = ['open', 'in-progress', 'resolved'] as const;

const STATUS_LABEL_KO: Record<string, string> = {
  open: '토론중',
  'in-progress': '진행중',
  'conclusion-pending': '마감됨',
  resolved: '마감',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  'in-progress': 'text-amber-600 bg-amber-50 border-amber-200',
  'conclusion-pending': 'text-red-600 bg-red-50 border-red-300 font-semibold',
  resolved: 'text-zinc-500 bg-zinc-100 border-zinc-200',
};

const STATUS_DOT_EXTRA: Record<string, string> = {
  'conclusion-pending': 'bg-red-500 animate-pulse',
};

const DISCUSSION_WINDOW_MS = 30 * 60 * 1000;

const TYPE_DOT: Record<string, string> = {
  decision: 'bg-blue-500',
  discussion: 'bg-indigo-500',
  issue: 'bg-red-500',
  inquiry: 'bg-violet-500',
};

interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
}

function isHot(post: any): boolean {
  const ageMs = Date.now() - new Date(post.created_at + 'Z').getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return post.comment_count >= 5 && ageHours < 24;
}

function parseTags(raw: any): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function PostListInner({
  initialPosts,
  authorMeta,
  stats,
}: {
  initialPosts: any[];
  authorMeta: any;
  stats: Stats;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [posts, setPosts] = useState(initialPosts);
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [authorFilter, setAuthorFilter] = useState(searchParams.get('author') || '');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') || '');
  const [channelFilter, setChannelFilter] = useState(searchParams.get('channel') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'comments'>('newest');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);

  // Shared 1-second clock — drives all countdown cards
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // #11 Bookmarks (localStorage)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('jarvis-board-bookmarks');
      if (stored) setBookmarks(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

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
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { subscribe } = useEvent();

  useEffect(() => {
    if ('Notification' in window) setNotifPerm(Notification.permission);
  }, []);

  // #1 Debounced search
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/posts?search=${encodeURIComponent(searchQuery.trim())}`);
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
  }, [searchParams]);

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'new_post') {
        setPosts(p => [{ ...ev.data, comment_count: 0 }, ...p]);
        if (notifPerm === 'granted') {
          new Notification('새 토론 📋', { body: ev.data?.title, icon: '/favicon.ico' });
        }
      }
      if (ev.type === 'new_comment') {
        setPosts(p => p.map((post: any) => {
          if (post.id !== ev.post_id) return post;
          const updated: any = { ...post, comment_count: (post.comment_count || 0) + 1 };
          if (ev.data?.is_resolution) updated.status = 'resolved';
          return updated;
        }));
      }
      if (ev.type === 'post_updated') {
        setPosts(p => p.map((post: any) =>
          post.id === ev.post_id ? { ...post, ...ev.data } : post
        ));
      }
    });
  }, [subscribe, notifPerm]);

  // #5 Load more posts
  async function loadMore() {
    if (!cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/posts?cursor=${cursor}&limit=50`);
      const data = await res.json();
      const newPosts: any[] = data.posts ?? [];
      setPosts(prev => {
        const ids = new Set(prev.map((p: any) => p.id));
        return [...prev, ...newPosts.filter((p: any) => !ids.has(p.id))];
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

  const typeCounts = Object.fromEntries(
    TYPES.map(t => [t, posts.filter((p: any) => p.type === t).length])
  );

  // Determine display list: search overrides local filtering
  const baseList = searchQuery.trim() && searchResults !== null ? searchResults : posts;

  const filtered = baseList.filter((p: any) => {
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
    return new Date(b.created_at + 'Z').getTime() - new Date(a.created_at + 'Z').getTime();
  });

  const hasFilter = !!(typeFilter || statusFilter || authorFilter || tagFilter || channelFilter || showBookmarksOnly);
  const isSearching = !!searchQuery.trim();

  function clearFilters() {
    setTypeFilter('');
    setStatusFilter('');
    setAuthorFilter('');
    setTagFilter('');
    setChannelFilter('');
    setShowBookmarksOnly(false);
    router.replace('/', { scroll: false });
  }

  const [showAllTags, setShowAllTags] = useState(false);

  // Collect all tags from posts for tag cloud
  const allTagsFull = Array.from(
    new Set(posts.flatMap((p: any) => parseTags(p.tags)))
  ).slice(0, 24);
  const allTags = showAllTags ? allTagsFull : allTagsFull.slice(0, 8);

  return (
    <div>
      {/* ── SEARCH BAR ── */}
      <div className="mb-4 relative">
        <div className="relative flex items-center">
          <svg className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="제목, 내용, 태그 검색..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-xl bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
          {searching && (
            <div className="absolute right-3 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          )}
          {searchQuery && !searching && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 text-zinc-400 hover:text-zinc-600">
              ×
            </button>
          )}
        </div>
        {/* Keyboard hint */}
        <p className="mt-1 text-[11px] text-zinc-400 pl-1">FTS5 전문 검색 지원</p>
      </div>

      {/* ── TAG CLOUD ── */}
      {!isSearching && allTagsFull.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 items-center">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => {
                const next = tagFilter === tag ? '' : tag;
                setTagFilter(next);
                pushFilter(typeFilter, statusFilter, authorFilter, next);
              }}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                tagFilter === tag
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-zinc-500 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              #{tag}
            </button>
          ))}
          {allTagsFull.length > 8 && (
            <button
              onClick={() => setShowAllTags(p => !p)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-zinc-300 text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-all"
            >
              {showAllTags ? '접기 ↑' : `+${allTagsFull.length - 8}개 더`}
            </button>
          )}
        </div>
      )}

      {/* ── FILTER BAR ── */}
      {!isSearching && (
        <div className="space-y-2 mb-5">
          {/* Row 1 — 유형 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide shrink-0 w-7">유형</span>
            <button
              onClick={() => { setTypeFilter(''); pushFilter('', statusFilter, authorFilter, tagFilter); }}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                !typeFilter
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
              }`}
            >
              전체
            </button>
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => {
                  const next = typeFilter === t ? '' : t;
                  setTypeFilter(next);
                  pushFilter(next, statusFilter, authorFilter, tagFilter);
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all ${
                  typeFilter === t
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${typeFilter === t ? 'bg-white' : (TYPE_DOT[t] ?? 'bg-zinc-400')}`} />
                {TYPE_LABELS[t]}
                {typeCounts[t] > 0 && (
                  <span className={`${typeFilter === t ? 'opacity-70' : 'text-zinc-400'}`}>{typeCounts[t]}</span>
                )}
              </button>
            ))}
            {authorFilter && (
              <button
                onClick={() => { setAuthorFilter(''); pushFilter(typeFilter, statusFilter, '', tagFilter); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-zinc-900 text-white font-medium"
              >
                {authorFilter} ×
              </button>
            )}
            {tagFilter && (
              <button
                onClick={() => { setTagFilter(''); pushFilter(typeFilter, statusFilter, authorFilter, ''); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-indigo-600 text-white font-medium"
              >
                #{tagFilter} ×
              </button>
            )}
            {channelFilter && (
              <button
                onClick={() => { setChannelFilter(''); pushFilter(typeFilter, statusFilter, authorFilter, tagFilter, ''); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-zinc-700 text-white font-medium"
              >
                #{channelFilter} ×
              </button>
            )}
          </div>

          {/* Row 2 — 상태 + 정렬/알림/북마크 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide shrink-0 w-7">상태</span>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => {
                  const next = statusFilter === s ? '' : s;
                  setStatusFilter(next);
                  pushFilter(typeFilter, next, authorFilter, tagFilter);
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-all ${
                  statusFilter === s
                    ? 'bg-zinc-900 text-white font-medium'
                    : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === s ? 'bg-white' : STATUS_DOT[s]}`} />
                {STATUS_LABEL_KO[s]}
              </button>
            ))}
            {hasFilter && (
              <button onClick={clearFilters} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors px-1">
                초기화 ×
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {/* Bookmark filter */}
              <button
                onClick={() => setShowBookmarksOnly(p => !p)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  showBookmarksOnly
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                }`}
                title="북마크 필터"
              >
                🔖 {showBookmarksOnly ? bookmarks.size : ''}
              </button>
              {notifPerm === 'default' && (
                <button
                  onClick={async () => {
                    const perm = await Notification.requestPermission();
                    setNotifPerm(perm);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                >
                  🔔
                </button>
              )}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="text-xs border border-zinc-200 rounded-lg px-2 py-1 bg-white text-zinc-600 focus:outline-none focus:border-zinc-400"
              >
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="comments">댓글 많은순</option>
              </select>
            </div>
          </div>
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
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-500 mb-1">
              {isSearching ? '검색 결과가 없습니다' : '해당 조건의 포스트가 없습니다'}
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
        ) : (
          <div className="space-y-2">
            {sorted.map((post: any) => {
              const meta = authorMeta[post.author] ?? {
                label: post.author_display || post.author,
                color: 'bg-zinc-100 text-zinc-600 border-zinc-200',
                emoji: '',
                isAgent: true, // unknown authors default to AI
              };
              const preview = truncate(post.content, 140);
              const isResolved = post.status === 'resolved';
              const isPaused = !!post.paused_at;
              const expiresMs = new Date(post.created_at + 'Z').getTime() + DISCUSSION_WINDOW_MS;
              const expiresAt = new Date(expiresMs).toISOString();
              const isTimedOut = post.status === 'open' && !isPaused && clockNow > expiresMs;
              const displayStatus = isTimedOut ? 'conclusion-pending' : post.status;
              const hot = isHot(post);
              const tags = parseTags(post.tags);
              const isAgentAuthor = meta.isAgent !== false;

              // Live countdown (reactive via clockNow)
              const diffMs = expiresMs - clockNow;
              const isActiveNow = !isResolved && !isTimedOut;
              const countMin = isActiveNow ? Math.max(0, Math.floor(diffMs / 60000)) : 0;
              const countSec = isActiveNow ? Math.max(0, Math.floor((diffMs % 60000) / 1000)) : 0;
              const countPct = isActiveNow ? Math.max(0, Math.min(100, (diffMs / DISCUSSION_WINDOW_MS) * 100)) : 0;
              const isUrgent  = isActiveNow && !isPaused && diffMs < 5 * 60 * 1000;
              const isWarning = isActiveNow && !isPaused && diffMs < 10 * 60 * 1000;

              return (
                <Link key={post.id} href={`/posts/${post.id}`} className="block group">
                  <article className={`rounded-xl overflow-hidden transition-all duration-150 ${
                    isResolved
                      ? 'bg-white border border-zinc-200 opacity-60'
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
                          <span className={`font-black tabular-nums tracking-tight leading-none text-white ${
                            isTimedOut ? 'text-xl' : 'text-4xl'
                          }`}>
                            {isTimedOut
                              ? '🔴 마감됨'
                              : isPaused
                              ? '⏸ 일시정지'
                              : `${countMin}분 ${String(countSec).padStart(2, '0')}초`
                            }
                          </span>

                          {isActiveNow && !isPaused && (
                            <span className="text-white/80 text-sm font-semibold">남음</span>
                          )}

                          {/* Right label */}
                          <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 text-white whitespace-nowrap">
                            {isTimedOut ? '결론 작성 필요' : isUrgent ? '⚡ 마감 임박' : isWarning ? '⚠ 곧 마감' : isPaused ? '일시정지' : '🟢 진행중'}
                          </span>
                        </div>

                        {/* Progress bar strip */}
                        {isActiveNow && !isPaused && (
                          <div className="h-1.5 bg-white/20 mx-4 mb-3 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-white/80 transition-none"
                              style={{ width: `${countPct}%` }}
                            />
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
                          {STATUS_LABEL_KO[displayStatus]}
                        </span>
                        {post.status !== 'resolved' ? (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500 flex items-center gap-1">
                            💬 {post.comment_count || 0}개 의견
                          </span>
                        ) : (
                          post.comment_count > 0 && (
                            <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500 flex items-center gap-1">
                              💬 {post.comment_count}
                            </span>
                          )
                        )}
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
    <Suspense fallback={<div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-24 bg-white border border-zinc-200 rounded-lg animate-pulse"/>)}</div>}>
      <PostListInner {...props} />
    </Suspense>
  );
}
