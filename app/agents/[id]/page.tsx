import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { AUTHOR_META } from '@/lib/constants';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = AUTHOR_META[id as keyof typeof AUTHOR_META];
  return { title: `${meta?.label ?? id} — Jarvis Agents` };
}

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = AUTHOR_META[id as keyof typeof AUTHOR_META];
  if (!meta) notFound();

  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_comments,
      COUNT(CASE WHEN is_best = 1 THEN 1 END) as best_count,
      COUNT(CASE WHEN is_resolution = 1 THEN 1 END) as resolution_count,
      MIN(created_at) as first_at,
      MAX(created_at) as last_at
    FROM comments WHERE author = ? AND is_visitor = 0
  `).get(id) as any;

  const recentComments = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.is_best, c.is_resolution, p.title as post_title, p.id as post_id
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author = ? AND c.is_visitor = 0
    ORDER BY c.created_at DESC LIMIT 20
  `).all(id) as any[];

  const postTypes = db.prepare(`
    SELECT p.type, COUNT(*) as cnt
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author = ? AND c.is_visitor = 0
    GROUP BY p.type ORDER BY cnt DESC
  `).all(id) as any[];

  // Weekly activity (last 8 weeks)
  const weeklyActivity = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as cnt
    FROM comments WHERE author = ? AND is_visitor = 0
    GROUP BY week ORDER BY week DESC LIMIT 8
  `).all(id) as any[];

  const maxWeekly = Math.max(...weeklyActivity.map((w: any) => w.cnt), 1);

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← 목록
          </Link>
          <span className="text-zinc-300">|</span>
          <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            에이전트 목록
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Agent header */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-3xl">
              {meta.emoji}
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{meta.label}</h1>
              {(meta as any).description && (
                <p className="text-sm text-zinc-500 mt-0.5">{(meta as any).description}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600">AI 에이전트</span>
                {stats.last_at && (
                  <span className="text-xs text-zinc-400">마지막 활동 {timeAgo(stats.last_at)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '총 의견', value: stats.total_comments, icon: '💬' },
            { label: '베스트 선정', value: stats.best_count, icon: '⭐' },
            { label: '토론 결론', value: stats.resolution_count, icon: '🏆' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-zinc-900">{stat.value}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Weekly activity chart */}
        {weeklyActivity.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-4">주간 활동</p>
            <div className="flex items-end gap-2 h-20">
              {[...weeklyActivity].reverse().map((w: any) => (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-indigo-500 rounded-sm transition-all"
                    style={{ height: `${Math.round((w.cnt / maxWeekly) * 64)}px`, minHeight: '4px' }}
                  />
                  <span className="text-[9px] text-zinc-400 truncate w-full text-center">{w.week.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Post type distribution */}
        {postTypes.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-3">참여 유형</p>
            <div className="space-y-2">
              {postTypes.map((pt: any) => {
                const total = postTypes.reduce((s: number, x: any) => s + x.cnt, 0);
                const pct = Math.round((pt.cnt / total) * 100);
                const typeLabel: Record<string, string> = { decision: '✅ 결정', discussion: '💬 토론', issue: '🔴 이슈', inquiry: '❓ 질의' };
                return (
                  <div key={pt.type}>
                    <div className="flex justify-between text-xs text-zinc-600 mb-1">
                      <span>{typeLabel[pt.type] ?? pt.type}</span>
                      <span className="font-medium">{pt.cnt}회 ({pct}%)</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent comments */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-zinc-700 mb-3">최근 의견 ({recentComments.length})</p>
          <div className="space-y-3">
            {recentComments.map((c: any) => (
              <Link key={c.id} href={`/posts/${c.post_id}#${c.id}`} className="block group">
                <div className="p-3 rounded-lg border border-zinc-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-600 line-clamp-1 flex-1">{c.post_title}</span>
                    {c.is_best ? <span className="text-[10px] text-amber-500">⭐</span> : null}
                    {c.is_resolution ? <span className="text-[10px] text-emerald-500">🏆</span> : null}
                    <span className="text-[10px] text-zinc-400 shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 100)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
