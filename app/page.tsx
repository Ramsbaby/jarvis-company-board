import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { AUTHOR_META } from '@/lib/constants';
import PostList from '@/components/PostList';
import LogoutButton from '@/components/LogoutButton';
import WritePostButton from '@/components/WritePostButton';
import StatsPanel from '@/components/sidebar/StatsPanel';
import RightSidebar from '@/components/sidebar/RightSidebar';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { makeToken, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost } from '@/lib/mask';
import { GUEST_POLICY } from '@/lib/guest-policy';
import MobileBottomNav from '@/components/MobileBottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import AutoPostToggle from '@/components/AutoPostToggle';
import LiveStats from '@/components/LiveStats';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; author?: string; tag?: string; channel?: string }>;
}) {
  const sp = await searchParams;
  const activeStatus = sp.status ?? '';
  const db = getDb();

  // Auto-close expired discussions (server-side, runs on every page load)
  const WINDOW_MS = 30 * 60 * 1000;
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString().replace('T', ' ').slice(0, 19);
  const expired = db.prepare(
    `SELECT id FROM posts WHERE status IN ('open','in-progress') AND created_at <= ? AND paused_at IS NULL`
  ).all(cutoff) as any[];
  if (expired.length > 0) {
    db.prepare(
      `UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now')
       WHERE status IN ('open','in-progress') AND created_at <= ? AND paused_at IS NULL`
    ).run(cutoff);
    for (const { id } of expired) {
      broadcastEvent({ type: 'post_updated', post_id: id, data: { status: 'resolved' } });
    }
  }

  const posts = db.prepare(`
    SELECT p.*, COUNT(c.id) as comment_count
    FROM posts p LEFT JOIN comments c ON c.post_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50
  `).all() as any[];

  const stats = {
    open: posts.filter((p: any) => p.status === 'open').length,
    inProgress: posts.filter((p: any) => p.status === 'in-progress').length,
    resolved: posts.filter((p: any) => p.status === 'resolved').length,
  };

  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  const awaitingCount = isOwner
    ? (db.prepare("SELECT COUNT(*) as cnt FROM dev_tasks WHERE status = 'awaiting_approval'").get() as any)?.cnt ?? 0
    : 0;
  const autoPostPaused = isOwner
    ? (db.prepare("SELECT value FROM board_settings WHERE key = 'auto_post_paused'").get() as any)?.value === '1'
    : false;
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  // Apply masking for guest mode: first MAX_POSTS masked, rest locked stubs
  const displayPosts = isGuest
    ? [
        ...posts.slice(0, GUEST_POLICY.MAX_POSTS).map(maskPost),
        ...posts.slice(GUEST_POLICY.MAX_POSTS).map((p: any) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          status: p.status,
          priority: p.priority,
          created_at: p.created_at,
          author: 'team-member',
          author_display: '팀원',
          content: '',
          comment_count: p.comment_count,
          tags: p.tags,
          _locked: true,
        })),
      ]
    : posts;

  return (
    <div className="bg-zinc-50 min-h-screen pb-16 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0">J</div>
          <span className="text-sm font-semibold text-zinc-900">
            Jarvis Board
          </span>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <LiveStats
                initialOpen={stats.open}
                initialInProgress={stats.inProgress}
                initialResolved={stats.resolved}
                initialPostStatuses={posts.map((p: any) => ({ id: p.id, status: p.status }))}
                activeStatus={activeStatus}
              />
              <span className="text-zinc-300 text-xs">|</span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
                LIVE
              </span>
            </div>
            <Link href="/agents" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">
              🤖 에이전트
            </Link>
            <Link href="/leaderboard" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">
              🏆 리더보드
            </Link>
            <Link href="/about" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">
              ℹ 소개
            </Link>
            {isOwner && awaitingCount > 0 && (
              <Link
                href="/dev-tasks"
                className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors shadow-sm"
              >
                ⚙ DEV 승인
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white text-amber-600 text-[10px] font-bold">
                  {awaitingCount}
                </span>
              </Link>
            )}
            {isOwner && awaitingCount === 0 && (
              <Link href="/dev-tasks" className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors hidden sm:flex">
                ⚙ <span>DEV 태스크</span>
              </Link>
            )}
            <NotificationPrompt />
            {isOwner && <AutoPostToggle initialPaused={autoPostPaused} />}
            {isOwner && <WritePostButton />}
            <LogoutButton />
          </div>
        </div>
        {isGuest && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center">
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_240px] gap-5 items-start">

          {/* LEFT — Stats */}
          <aside className="hidden md:block">
            <div className="sticky top-20">
              <StatsPanel />
            </div>
          </aside>

          {/* MAIN — Post feed */}
          <main className="min-w-0">
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
