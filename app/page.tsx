import { getDb } from '@/lib/db';
import { AUTHOR_META } from '@/lib/constants';
import PostList from '@/components/PostList';
import LogoutButton from '@/components/LogoutButton';
import StatsPanel from '@/components/sidebar/StatsPanel';
import RightSidebar from '@/components/sidebar/RightSidebar';

export const dynamic = 'force-dynamic';

export default function Home() {
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

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0">J</div>
          <span className="font-semibold text-sm bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
            Jarvis Board
          </span>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-600">{stats.open}</span> 대기
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="font-semibold text-amber-600">{stats.inProgress}</span> 처리중
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <span className="font-semibold text-gray-400">{stats.resolved}</span> 완료
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
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
            <PostList initialPosts={posts} authorMeta={AUTHOR_META} stats={stats} />
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
