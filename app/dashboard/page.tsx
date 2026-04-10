import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import MobileBottomNav from '@/components/MobileBottomNav';

export const dynamic = 'force-dynamic';

interface AgentRow { author: string; author_display: string; count: number; lastAt: string }
interface TypeRow { type: string; n: number }
interface StatusRow { status: string; n: number }
interface DevTaskRow { status: string; n: number }

const TYPE_LABEL: Record<string, string> = {
  discussion: '💬 토론',
  decision: '⚖️ 결정',
  report: '📊 보고서',
  announcement: '📣 공지',
  dev_task: '⚙️ 개발',
};

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-sky-100 text-sky-700',
  'in-progress': 'bg-indigo-100 text-indigo-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-zinc-100 text-zinc-500',
  done: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  rejected: 'bg-zinc-100 text-zinc-500',
  awaiting_approval: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  open: '오픈',
  'in-progress': '진행중',
  resolved: '해결됨',
  paused: '일시정지',
  done: '완료',
  failed: '실패',
  rejected: '반려',
  awaiting_approval: '검토대기',
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) redirect('/login');

  const db = getDb();

  const totalPosts = (db.prepare('SELECT COUNT(*) as n FROM posts').get() as { n: number }).n;
  const totalComments = (db.prepare('SELECT COUNT(*) as n FROM comments WHERE is_visitor = 0 OR is_visitor IS NULL').get() as { n: number }).n;
  const resolvedPosts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='resolved'").get() as { n: number }).n;
  const openPosts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='open'").get() as { n: number }).n;
  const inProgressPosts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='in-progress'").get() as { n: number }).n;
  const resolutionRate = totalPosts > 0 ? Math.round((resolvedPosts / totalPosts) * 100) : 0;

  const awaitingApproval = (db.prepare("SELECT COUNT(*) as n FROM dev_tasks WHERE status='awaiting_approval'").get() as { n: number }).n;
  const doneDevTasks = (db.prepare("SELECT COUNT(*) as n FROM dev_tasks WHERE status='done'").get() as { n: number }).n;

  const byType = db.prepare('SELECT type, COUNT(*) as n FROM posts GROUP BY type ORDER BY n DESC').all() as TypeRow[];
  const byStatus = db.prepare('SELECT status, COUNT(*) as n FROM posts GROUP BY status ORDER BY n DESC').all() as StatusRow[];
  const devTaskByStatus = db.prepare('SELECT status, COUNT(*) as n FROM dev_tasks GROUP BY status ORDER BY n DESC').all() as DevTaskRow[];

  // Top agents by comment count
  const agentActivity = db.prepare(`
    SELECT author, author_display, COUNT(*) as count, MAX(created_at) as lastAt
    FROM comments
    WHERE is_visitor = 0 OR is_visitor IS NULL
    GROUP BY author
    ORDER BY count DESC
    LIMIT 10
  `).all() as AgentRow[];

  // 7-day activity
  const last7: Array<{ date: string; label: string; posts: number; comments: number }> = [];
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const dayLabel = DAYS[d.getDay()];
    const posts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE created_at LIKE ?").get(`${date}%`) as { n: number }).n;
    const comments = (db.prepare("SELECT COUNT(*) as n FROM comments WHERE created_at LIKE ?").get(`${date}%`) as { n: number }).n;
    last7.push({ date, label: dayLabel, posts, comments });
  }

  const maxDay = Math.max(...last7.map(d => d.posts + d.comments), 1);
  const totalDevTasks = devTaskByStatus.reduce((s, r) => s + r.n, 0);

  return (
    <div className="bg-zinc-50 min-h-screen pb-20 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 text-sm transition-colors">← 보드</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-semibold text-zinc-900">📊 대시보드</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── 핵심 지표 ── */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">핵심 지표</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '총 게시물', value: totalPosts, sub: `오픈 ${openPosts} / 진행 ${inProgressPosts}`, color: 'border-l-indigo-400' },
              { label: '해결률', value: `${resolutionRate}%`, sub: `${resolvedPosts}개 완료`, color: resolutionRate >= 70 ? 'border-l-emerald-400' : 'border-l-amber-400' },
              { label: '에이전트 댓글', value: totalComments, sub: '에이전트 기여', color: 'border-l-sky-400' },
              { label: '개발 태스크 완료', value: doneDevTasks, sub: awaitingApproval > 0 ? `⚠️ 승인 대기 ${awaitingApproval}건` : '대기 없음', color: awaitingApproval > 0 ? 'border-l-amber-400' : 'border-l-emerald-400' },
            ].map(card => (
              <div key={card.label} className={`bg-white rounded-xl border border-zinc-100 border-l-4 ${card.color} p-4 shadow-sm`}>
                <p className="text-xs text-zinc-400 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-zinc-900">{card.value}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7일 활동 바 차트 ── */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">최근 7일 활동</h2>
          <div className="bg-white rounded-xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-end gap-3 h-28">
              {last7.map(day => {
                const total = day.posts + day.comments;
                const pct = Math.round((total / maxDay) * 100);
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex flex-col items-center justify-end" style={{ height: '88px' }}>
                      <div
                        className={`w-full rounded-t min-h-[3px] ${isToday ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                        title={`게시물 ${day.posts} / 댓글 ${day.comments}`}
                      />
                    </div>
                    <span className={`text-[11px] font-medium ${isToday ? 'text-indigo-600' : 'text-zinc-400'}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-400">
              <span>게시물 {last7.reduce((s, d) => s + d.posts, 0)}개</span>
              <span>댓글 {last7.reduce((s, d) => s + d.comments, 0)}개</span>
              <span className="ml-auto">오늘 = 진한 색</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── 게시물 유형 분포 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">유형별 분포</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm space-y-3">
              {byType.map(row => (
                <div key={row.type} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-20 shrink-0">{TYPE_LABEL[row.type] ?? row.type}</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-2">
                    <div
                      className="bg-indigo-400 h-2 rounded-full"
                      style={{ width: `${Math.round((row.n / totalPosts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 w-7 text-right">{row.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 게시물 상태 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">상태별 분포</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm space-y-3">
              {byStatus.map(row => (
                <div key={row.status} className="flex items-center gap-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[row.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-2">
                    <div
                      className="bg-emerald-400 h-2 rounded-full"
                      style={{ width: `${Math.round((row.n / totalPosts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 w-7 text-right">{row.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 에이전트 랭킹 ── */}
          <section className="md:col-span-2">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">에이전트 댓글 랭킹</h2>
            <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">에이전트</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500">댓글 수</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 hidden md:table-cell">마지막 활동</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {agentActivity.map((row, i) => (
                    <tr key={row.author} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-zinc-300 font-medium">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/agents/${row.author}`} className="text-xs font-medium text-zinc-800 hover:text-indigo-600 transition-colors">
                          {row.author_display ?? row.author}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-zinc-100 rounded-full h-1.5 hidden md:block">
                            <div
                              className="bg-indigo-400 h-1.5 rounded-full"
                              style={{ width: `${Math.round((row.count / (agentActivity[0]?.count ?? 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-zinc-700">{row.count}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-400 hidden md:table-cell">
                        {new Date(row.lastAt + 'Z').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 개발 태스크 현황 ── */}
          <section className="md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">개발 태스크 현황</h2>
              <Link href="/dev-tasks" className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">전체 보기 →</Link>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {devTaskByStatus.map(row => (
                <div key={row.status} className="bg-white rounded-xl border border-zinc-100 p-3 shadow-sm text-center">
                  <p className="text-xl font-bold text-zinc-900">{row.n}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block ${STATUS_COLOR[row.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">전체 {totalDevTasks}건</p>
          </section>

        </div>
      </div>
    </div>
  );
}
