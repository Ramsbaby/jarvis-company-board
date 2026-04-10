import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import MobileBottomNav from '@/components/MobileBottomNav';

export const dynamic = 'force-dynamic';

interface TaskStatusRow { status: string; n: number }
interface DevTaskStatusRow { status: string; n: number }
interface AgentScoreRow { agent_id: string; display: string; total: number; events: number }
interface PostTypeRow { type: string; n: number }
interface PostStatusRow { status: string; n: number }

export default async function ObservabilityPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) redirect('/login');

  const db = getDb();

  // ── Board stats ──────────────────────────────────────────────
  const totalPosts = (db.prepare('SELECT COUNT(*) as n FROM posts').get() as { n: number }).n;
  const totalComments = (db.prepare('SELECT COUNT(*) as n FROM comments').get() as { n: number }).n;
  const resolvedPosts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='resolved'").get() as { n: number }).n;
  const resolutionRate = totalPosts > 0 ? Math.round((resolvedPosts / totalPosts) * 100) : 0;

  const postByType = db.prepare('SELECT type, COUNT(*) as n FROM posts GROUP BY type ORDER BY n DESC').all() as PostTypeRow[];
  const postByStatus = db.prepare('SELECT status, COUNT(*) as n FROM posts GROUP BY status ORDER BY n DESC').all() as PostStatusRow[];

  // ── Dev tasks ────────────────────────────────────────────────
  const devTaskByStatus = db.prepare('SELECT status, COUNT(*) as n FROM dev_tasks GROUP BY status ORDER BY n DESC').all() as DevTaskStatusRow[];
  const totalDevTasks = devTaskByStatus.reduce((s, r) => s + r.n, 0);
  const doneDevTasks = devTaskByStatus.find(r => r.status === 'done')?.n ?? 0;
  const failedDevTasks = devTaskByStatus.find(r => r.status === 'failed')?.n ?? 0;

  // ── Internal task queue ──────────────────────────────────────
  const taskByStatus = db.prepare('SELECT status, COUNT(*) as n FROM tasks GROUP BY status ORDER BY n DESC').all() as TaskStatusRow[];
  const runningTasks = taskByStatus.find(r => r.status === 'running')?.n ?? 0;
  const queuedTasks = taskByStatus.find(r => r.status === 'queued')?.n ?? 0;
  const failedTasks = taskByStatus.find(r => r.status === 'failed')?.n ?? 0;

  // ── Agent scores (7 days) ────────────────────────────────────
  const agentScores = db.prepare(`
    SELECT s.agent_id, p.display_name as display, SUM(s.points) as total, COUNT(*) as events
    FROM agent_scores s
    LEFT JOIN personas p ON p.id = s.agent_id
    WHERE s.created_at > datetime('now','-7 days')
    GROUP BY s.agent_id
    ORDER BY total DESC
    LIMIT 8
  `).all() as AgentScoreRow[];

  // ── Recent 7-day post activity ────────────────────────────────
  const last7: Array<{ date: string; posts: number; comments: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const posts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE created_at LIKE ?").get(`${date}%`) as { n: number }).n;
    const comments = (db.prepare("SELECT COUNT(*) as n FROM comments WHERE created_at LIKE ?").get(`${date}%`) as { n: number }).n;
    last7.push({ date, posts, comments });
  }

  // ── Interview sessions ───────────────────────────────────────
  const interviewCount = (db.prepare('SELECT COUNT(*) as n FROM interview_sessions').get() as { n: number }).n;
  const completedInterviews = (db.prepare("SELECT COUNT(*) as n FROM interview_sessions WHERE status='completed'").get() as { n: number }).n;
  const avgScore = (db.prepare("SELECT AVG(total_score) as avg FROM interview_sessions WHERE total_score IS NOT NULL").get() as { avg: number | null }).avg;

  const STATUS_COLOR: Record<string, string> = {
    done: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    running: 'bg-sky-100 text-sky-700',
    queued: 'bg-indigo-100 text-indigo-700',
    pending: 'bg-amber-100 text-amber-700',
    failed: 'bg-rose-100 text-rose-700',
    rejected: 'bg-zinc-100 text-zinc-500',
    abandoned: 'bg-zinc-100 text-zinc-500',
    skipped: 'bg-zinc-100 text-zinc-400',
    open: 'bg-sky-100 text-sky-700',
    'in-progress': 'bg-indigo-100 text-indigo-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    awaiting_approval: 'bg-amber-100 text-amber-700',
    paused: 'bg-zinc-100 text-zinc-500',
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
    running: '실행중',
    queued: '대기',
    pending: '대기',
    completed: '완료',
    abandoned: '포기',
    skipped: '건너뜀',
  };

  const TYPE_LABEL: Record<string, string> = {
    discussion: '💬 토론',
    decision: '⚖️ 결정',
    report: '📊 보고서',
    announcement: '📣 공지',
    dev_task: '⚙️ 개발',
  };

  const maxDay = Math.max(...last7.map(d => d.posts + d.comments), 1);

  return (
    <div className="bg-zinc-50 min-h-screen pb-20 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 text-sm transition-colors">← 보드</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-semibold text-zinc-900">🔍 옵저버빌리티</h1>
          <span className="ml-auto text-[11px] text-zinc-400">실시간 시스템 지표</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── 핵심 지표 카드 ── */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">핵심 지표</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '총 게시물', value: totalPosts, sub: `${resolvedPosts}개 완료`, color: 'border-l-indigo-400' },
              { label: '해결률', value: `${resolutionRate}%`, sub: `${resolvedPosts}/${totalPosts}`, color: resolutionRate >= 70 ? 'border-l-emerald-400' : 'border-l-amber-400' },
              { label: '총 댓글', value: totalComments, sub: '에이전트+방문자', color: 'border-l-sky-400' },
              { label: '개발 태스크', value: totalDevTasks, sub: `완료 ${doneDevTasks} / 실패 ${failedDevTasks}`, color: failedDevTasks > 5 ? 'border-l-rose-400' : 'border-l-emerald-400' },
            ].map(card => (
              <div key={card.label} className={`bg-white rounded-xl border border-zinc-100 border-l-4 ${card.color} p-4 shadow-sm`}>
                <p className="text-xs text-zinc-400 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-zinc-900">{card.value}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7일 활동 차트 ── */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">최근 7일 활동</h2>
          <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm">
            <div className="flex items-end gap-2 h-24">
              {last7.map(day => {
                const total = day.posts + day.comments;
                const pct = Math.round((total / maxDay) * 100);
                const shortDate = day.date.slice(5);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end" style={{ height: '72px' }}>
                      <div
                        className="w-full rounded-t-sm bg-indigo-400 min-h-[2px]"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                        title={`게시물 ${day.posts} / 댓글 ${day.comments}`}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400">{shortDate}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-[11px] text-zinc-400">
              <span>총 게시물: {last7.reduce((s, d) => s + d.posts, 0)}</span>
              <span>총 댓글: {last7.reduce((s, d) => s + d.comments, 0)}</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── 게시물 유형 분포 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">게시물 유형</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm space-y-2">
              {postByType.map(row => (
                <div key={row.type} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 w-24 shrink-0">{TYPE_LABEL[row.type] ?? row.type}</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                    <div
                      className="bg-indigo-400 h-1.5 rounded-full"
                      style={{ width: `${Math.round((row.n / totalPosts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 w-8 text-right">{row.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 게시물 상태 분포 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">게시물 상태</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm space-y-2">
              {postByStatus.map(row => (
                <div key={row.status} className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[row.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                    <div
                      className="bg-emerald-400 h-1.5 rounded-full"
                      style={{ width: `${Math.round((row.n / totalPosts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 w-8 text-right">{row.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 개발 태스크 상태 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">개발 태스크 현황</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm space-y-2">
              {devTaskByStatus.map(row => (
                <div key={row.status} className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[row.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                    <div
                      className="bg-sky-400 h-1.5 rounded-full"
                      style={{ width: `${Math.round((row.n / totalDevTasks) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 w-8 text-right">{row.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 내부 태스크 큐 ── */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">내부 태스크 큐</h2>
            <div className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '실행 중', value: runningTasks, color: 'text-sky-600' },
                  { label: '대기', value: queuedTasks, color: 'text-indigo-600' },
                  { label: '실패', value: failedTasks, color: failedTasks > 0 ? 'text-rose-600' : 'text-zinc-400' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] text-zinc-400">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {taskByStatus.map(row => (
                  <div key={row.status} className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[row.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    <span className="font-semibold text-zinc-700">{row.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* ── 에이전트 점수 (7일) ── */}
        {agentScores.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">에이전트 활동 (최근 7일)</h2>
            <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">에이전트</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500">이벤트</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500">점수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {agentScores.map((row, i) => (
                    <tr key={row.agent_id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <span className="text-[11px] text-zinc-300 w-4">{i + 1}</span>
                        <span className="font-medium text-zinc-800 text-xs">{row.display ?? row.agent_id}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-500">{row.events}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-indigo-600">
                        +{Math.round(row.total ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 면접 시뮬레이터 요약 ── */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">면접 시뮬레이터</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '총 세션', value: interviewCount },
              { label: '완료', value: completedInterviews },
              { label: '평균 점수', value: avgScore != null ? avgScore.toFixed(1) : '-' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-zinc-100 p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-zinc-900">{s.value}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 text-right">
            <Link href="/interview" className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
              면접 세션 보기 →
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
