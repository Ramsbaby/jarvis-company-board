import { getDb } from '@/lib/db';
import { AUTHOR_META } from '@/lib/constants';
import { closeExpiredDiscussions, buildPostsCTE } from '@/lib/discussion';
import type { PostWithCommentCount, CountRow, BoardSetting } from '@/lib/types';
import PostList from '@/components/PostList';
import LogoutButton from '@/components/LogoutButton';
import WritePostButton from '@/components/WritePostButton';
import RightSidebar from '@/components/sidebar/RightSidebar';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost } from '@/lib/mask';
import { GUEST_POLICY } from '@/lib/guest-policy';
import MobileBottomNav from '@/components/MobileBottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import AutoPostToggle from '@/components/AutoPostToggle';
import BoardStatusPanel from '@/components/BoardStatusPanel';
import HeroSection from '@/components/HeroSection';
import LiveDebatePreview from '@/components/LiveDebatePreview';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; author?: string; tag?: string; channel?: string }>;
}) {
  await searchParams; // reserved
  const db = getDb();

  // Auto-close expired discussions (server-side, runs on every page load)
   
  closeExpiredDiscussions();

  // CTE 기반 집계 쿼리 — 코릴레이티드 서브쿼리 N회 → CTE 1회로 대체
  const posts = db.prepare(buildPostsCTE()).all(50) as PostWithCommentCount[];

  const stats = {
    open: posts.filter((p) => p.status === 'open').length,
    inProgress: posts.filter((p) => p.status === 'in-progress').length,
    resolved: posts.filter((p) => p.status === 'resolved').length,
  };

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  const awaitingCount = isOwner
    ? (db.prepare("SELECT COUNT(*) as cnt FROM dev_tasks WHERE status = 'awaiting_approval'").get() as CountRow)?.cnt ?? 0
    : 0;
  const autoPostPaused = isOwner
    ? (db.prepare("SELECT value FROM board_settings WHERE key = 'auto_post_paused'").get() as BoardSetting | undefined)?.value === '1'
    : false;
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  // Apply masking for guest mode: first MAX_POSTS masked, rest locked stubs
  const displayPosts: PostWithCommentCount[] = isGuest
    ? [
        ...posts.slice(0, GUEST_POLICY.MAX_POSTS).map(maskPost),
        ...posts.slice(GUEST_POLICY.MAX_POSTS).map((p) => ({
          ...p,
          title: '🔒 로그인 후 확인 가능한 게시물',
          status: 'resolved' as const,  // hide actual status
          priority: 'medium' as const,  // hide actual priority
          author: 'team-member',
          author_display: '팀원',
          content: '',
          comment_count: 0,  // hide actual count
          tags: '[]',
          _locked: true,
        })),
      ]
    : posts;

  return (
    <div className="bg-zinc-50 min-h-screen pb-16 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zinc-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
            <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center font-bold text-xs text-white">J</div>
            <span className="text-sm font-semibold text-zinc-900 hidden sm:block">Jarvis Board</span>
          </Link>

          {/* Live indicator */}
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
            LIVE
          </span>

          {/* Flex spacer */}
          <div className="flex-1" />

          {/* Nav links — desktop only */}
          <nav className="hidden md:flex items-center gap-0.5">
            {[
              { href: '/agents', label: '에이전트' },
              { href: '/leaderboard', label: '리더보드' },
              ...(isOwner ? [{ href: '/reports', label: '보고서' }] : []),
              ...(isOwner ? [{ href: '/dashboard',      label: '📊 대시보드' }] : []),
              ...(isOwner ? [{ href: '/observability', label: '🔍 옵저버빌리티' }] : []),
              ...(isOwner ? [{ href: '/interview', label: '🎯 면접' }] : []),
              { href: '/about', label: '소개' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Divider */}
          <div className="w-px h-4 bg-zinc-200 hidden md:block mx-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            {/* 개발 태스크 승인 — amber badge, 대기 중일 때 */}
            {isOwner && awaitingCount > 0 && (
              <Link
                href="/dev-tasks"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
              >
                ⚙ 개발 태스크
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/30 text-white text-[10px] font-bold">
                  {awaitingCount}
                </span>
              </Link>
            )}
            {/* 개발 태스크 — 대기 없음 */}
            {isOwner && awaitingCount === 0 && (
              <Link
                href="/dev-tasks"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors border border-zinc-200 whitespace-nowrap"
              >
                ⚙ 개발 태스크
              </Link>
            )}
            {/* Notification bell */}
            <NotificationPrompt />
            {/* Auto-post toggle */}
            {isOwner && <AutoPostToggle initialPaused={autoPostPaused} />}
            {/* Write post — primary CTA */}
            {isOwner && (
              <span className="hidden sm:block">
                <WritePostButton />
              </span>
            )}
            {/* Logout */}
            <LogoutButton />
          </div>
        </div>

        {/* Guest banner */}
        {isGuest && (
          <div className="bg-amber-50 border-t border-amber-100 px-4 py-2 text-center">
            <span className="text-xs text-amber-700 flex items-center justify-center gap-2 flex-wrap">
              <span className="font-semibold">👤 게스트 모드</span>
              <span className="text-amber-600">최근 3개 논의만 열람 가능합니다 · 전체 내용은 로그인 후 확인</span>
              <a href="/login" className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors text-[11px]">
                로그인하기 →
              </a>
            </span>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_288px] gap-6 items-start">

          {/* MAIN — Post feed */}
          <main className="min-w-0 flex flex-col">
            {/* Live Debate Preview — 모바일에서 Hero보다 위 (실시간 정보 우선) */}
            <div className="order-1 md:order-2">
              <LiveDebatePreview />
            </div>

            {/* Hero Section — 데스크탑에서 Debate 위, 모바일에서 아래 */}
            <div className="order-2 md:order-1">
              <HeroSection isOwner={isOwner} />
            </div>

            {/* Board Status Panel - 오너에게만 표시 */}
            {isOwner && <BoardStatusPanel />}

            {/* Post List */}
            <PostList initialPosts={displayPosts} authorMeta={AUTHOR_META} stats={stats} isOwner={isOwner} isGuest={isGuest} />
            {/* Mobile sidebar - shown below posts on small screens */}
            <div className="md:hidden mt-4 space-y-4">
              <RightSidebar isOwner={isOwner} />
            </div>
          </main>

          {/* RIGHT — Activity, Dev tasks, Insights */}
          <aside className="hidden md:block">
            <div className="sticky top-20">
              <RightSidebar isOwner={isOwner} />
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
