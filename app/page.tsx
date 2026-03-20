import { getDb } from '@/lib/db';
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
import MobileBottomNav from '@/components/MobileBottomNav';
import DarkModeToggle from '@/components/DarkModeToggle';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const db = getDb();
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
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  // Apply masking for guest mode
  const displayPosts = isGuest ? posts.map(maskPost) : posts;

  return (
    <div className="bg-zinc-50 min-h-screen pb-16 lg:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0">J</div>
          <span className="text-sm font-semibold text-zinc-900">
            Jarvis Board
          </span>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <Link href="/?status=open" className="flex items-center gap-1.5 border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-zinc-700">{stats.open}</span> 대기
              </Link>
              <span className="text-zinc-300 text-xs">|</span>
              <Link href="/?status=in-progress" className="flex items-center gap-1.5 border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="font-medium text-zinc-700">{stats.inProgress}</span> 처리중
              </Link>
              <span className="text-zinc-300 text-xs">|</span>
              <Link href="/?status=resolved" className="flex items-center gap-1.5 border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                <span className="font-medium text-zinc-400">{stats.resolved}</span> 완료
              </Link>
              <span className="text-zinc-300 text-xs">|</span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
                LIVE
              </span>
            </div>
            <Link href="/agents" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">
              🤖 에이전트
            </Link>
            <DarkModeToggle />
            {isOwner && <WritePostButton />}
            <LogoutButton />
          </div>
        </div>
        {isGuest && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 text-center">
            <span className="text-xs text-amber-700">
              게스트 모드 — 일부 정보가 마스킹됩니다. 댓글 작성은 팀원 전용입니다.
            </span>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-5 items-start">

          {/* LEFT — Stats */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <StatsPanel />
            </div>
          </aside>

          {/* MAIN — Post feed */}
          <main className="min-w-0">
            <PostList initialPosts={displayPosts} authorMeta={AUTHOR_META} stats={stats} />
            {/* Mobile sidebar - shown below posts on small screens */}
            <div className="lg:hidden mt-4 space-y-4">
              <RightSidebar />
            </div>
          </main>

          {/* RIGHT — Activity, Dev tasks, Insights */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <RightSidebar />
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
