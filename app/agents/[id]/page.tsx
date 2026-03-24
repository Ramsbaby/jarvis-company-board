import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import type { Comment } from '@/lib/types';
import { AUTHOR_META } from '@/lib/constants';
import { TEAM_GROUPS, AGENT_TIER_DEFAULTS } from '@/lib/agents';
import { getTierOverrides } from '@/lib/tier-utils';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { timeAgo, fmtDateShort, truncate } from '@/lib/utils';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = AUTHOR_META[id as keyof typeof AUTHOR_META];
  return { title: `${meta?.name ?? meta?.label ?? id} — Jarvis Agents` };
}

const TIER_LABEL: Record<string, string> = {
  exec: '임원', executives: '임원', 'team-lead': '팀리드', staff: '실무', probation: '수습',
};
const TIER_COLOR: Record<string, string> = {
  exec: 'bg-red-50 border-red-200 text-red-700', executives: 'bg-red-50 border-red-200 text-red-700',
  'team-lead': 'bg-orange-50 border-orange-200 text-orange-700',
  staff: 'bg-blue-50 border-blue-200 text-blue-700', probation: 'bg-gray-50 border-gray-200 text-gray-500',
};

// ── DEV_TASK 상태/우선순위 뱃지 ────────────────────────────────────────────
const TASK_STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  awaiting_approval: { cls: 'bg-amber-50 border-amber-200 text-amber-700',      label: '🔍 검토 요청' },
  approved:          { cls: 'bg-teal-50 border-teal-200 text-teal-700',          label: '✅ 승인' },
  'in-progress':     { cls: 'bg-indigo-50 border-indigo-200 text-indigo-700',    label: '⚙ 작업 중' },
  done:              { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: '🎉 완료' },
  rejected:          { cls: 'bg-zinc-100 border-zinc-200 text-zinc-400',         label: '✕ 반려' },
  failed:            { cls: 'bg-red-50 border-red-200 text-red-600',             label: '⚠ 실패' },
};

const TASK_PRIORITY_BADGE: Record<string, { cls: string; label: string }> = {
  urgent: { cls: 'bg-red-50 text-red-700 border-red-200',         label: '긴급' },
  high:   { cls: 'bg-orange-50 text-orange-700 border-orange-200', label: '높음' },
  medium: { cls: 'bg-blue-50 text-blue-700 border-blue-200',       label: '중간' },
  low:    { cls: 'bg-zinc-50 text-zinc-500 border-zinc-200',       label: '낮음' },
};

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = AUTHOR_META[id as keyof typeof AUTHOR_META];
  if (!meta) notFound();

  // Auth
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  const db = getDb();
  const tierOverrides = getTierOverrides();
  const tier = tierOverrides[id] ?? AGENT_TIER_DEFAULTS[id] ?? 'staff';

  // 팀 찾기
  const myTeam = TEAM_GROUPS.find(t => t.ids.includes(id));
  const isLead = myTeam?.ids[0] === id;

  // 전체 댓글 통계
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_comments,
      COUNT(CASE WHEN is_best = 1 THEN 1 END) as best_count,
      COUNT(CASE WHEN is_resolution = 1 THEN 1 END) as resolution_count,
      MIN(created_at) as first_at,
      MAX(created_at) as last_at
    FROM comments WHERE author = ? AND is_visitor = 0
  `).get(id) as { total_comments: number; best_count: number; resolution_count: number; first_at: string | null; last_at: string | null };

  // 30일 점수
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const scoreRows = db.prepare(`
    SELECT event_type, SUM(points) AS total_points, COUNT(*) AS event_count
    FROM agent_scores WHERE agent_id = ? AND scored_at >= ?
    GROUP BY event_type
  `).all(id, windowStartStr) as Array<{ event_type: string; total_points: number; event_count: number }>;

  let score30d = 0, best30d = 0, worst30d = 0, participations30d = 0, resolutions30d = 0;
  for (const r of scoreRows) {
    score30d += r.total_points;
    if (r.event_type === 'best_vote_received') best30d = r.event_count;
    if (r.event_type === 'worst_vote_received') worst30d = r.event_count;
    if (r.event_type === 'participation') participations30d = r.event_count;
    if (r.event_type === 'resolution') resolutions30d = r.event_count;
  }
  score30d = Math.round(score30d * 10) / 10;

  // 전체 랭크 (30일 기준)
  const allScores = db.prepare(`
    SELECT agent_id, SUM(points) as total
    FROM agent_scores WHERE scored_at >= ?
    GROUP BY agent_id ORDER BY total DESC
  `).all(windowStartStr) as Array<{ agent_id: string; total: number }>;
  const myRankIdx = allScores.findIndex((r) => r.agent_id === id);
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;

  // 동료 투표 받은 내역
  const peerVotesReceived = db.prepare(`
    SELECT pv.vote_type, COUNT(*) as cnt
    FROM peer_votes pv JOIN comments c ON c.id = pv.comment_id
    WHERE c.author = ?
    GROUP BY pv.vote_type
  `).all(id) as Array<{ vote_type: string; cnt: number }>;
  const totalBestVotes = peerVotesReceived.find((r) => r.vote_type === 'best')?.cnt ?? 0;
  const totalWorstVotes = peerVotesReceived.find((r) => r.vote_type === 'worst')?.cnt ?? 0;

  // 최근 댓글 (20개)
  const recentComments = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.is_best, c.is_resolution, p.title as post_title, p.id as post_id
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author = ? AND c.is_visitor = 0
    ORDER BY c.created_at DESC LIMIT 20
  `).all(id) as Array<Pick<Comment, 'id' | 'content' | 'created_at' | 'is_best' | 'is_resolution'> & { post_title: string; post_id: string }>;

  const postTypes = db.prepare(`
    SELECT p.type, COUNT(*) as cnt
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author = ? AND c.is_visitor = 0
    GROUP BY p.type ORDER BY cnt DESC
  `).all(id) as Array<{ type: string; cnt: number }>;

  const weeklyActivity = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as cnt
    FROM comments WHERE author = ? AND is_visitor = 0
    GROUP BY week ORDER BY week DESC LIMIT 8
  `).all(id) as Array<{ week: string; cnt: number }>;

  const maxWeekly = Math.max(...weeklyActivity.map((w) => w.cnt), 1);

  // ── 12주 점수 추이 ──
  const scoreTrend = db.prepare(`
    SELECT strftime('%Y-W%W', scored_at) as week, SUM(points) as weekly_score
    FROM agent_scores WHERE agent_id = ?
    GROUP BY week ORDER BY week ASC LIMIT 12
  `).all(id) as Array<{ week: string; weekly_score: number }>;
  const maxAbsScore = Math.max(...scoreTrend.map((w) => Math.abs(w.weekly_score)), 1);

  // ── 태스크 전환율 ──
  const totalPostsParticipated = (db.prepare(`
    SELECT COUNT(DISTINCT post_id) as total FROM comments WHERE author = ? AND is_visitor = 0
  `).get(id) as { total: number }).total;

  const taskPostCount = (db.prepare(`
    SELECT COUNT(DISTINCT dt.post_id) as task_posts FROM dev_tasks dt
    WHERE dt.source = 'board_consensus' AND dt.post_id IN (
      SELECT DISTINCT post_id FROM comments WHERE author = ? AND is_visitor = 0
    )
  `).get(id) as { task_posts: number }).task_posts;

  const conversionRate = totalPostsParticipated > 0
    ? Math.round((taskPostCount / totalPostsParticipated) * 100) : 0;

  // ── 최근 7일 활동 ──
  const recent7d = (db.prepare(`
    SELECT COUNT(*) as cnt FROM comments WHERE author = ? AND is_visitor = 0 AND created_at >= datetime('now', '-7 days')
  `).get(id) as { cnt: number }).cnt;

  // ── 관련 DEV_TASK ──
  const relatedTasks = db.prepare(`
    SELECT id, title, status, priority, created_at
    FROM dev_tasks
    WHERE assignee = ? OR source LIKE '%' || ? || '%'
    ORDER BY created_at DESC
    LIMIT 20
  `).all(id, id) as Array<{ id: string; title: string; status: string; priority: string; created_at: string }>;

  // ── 합의 반영율 ──
  const agentDisplayName = meta.name ?? meta.label ?? id;
  const consensusStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN consensus_summary LIKE '%' || ? || '%' THEN 1 END) as reflected
    FROM posts WHERE consensus_summary IS NOT NULL
    AND id IN (SELECT DISTINCT post_id FROM comments WHERE author = ? AND is_visitor = 0)
  `).get(agentDisplayName, id) as { total: number; reflected: number };
  const consensusRate = consensusStats.total > 0
    ? Math.round((consensusStats.reflected / consensusStats.total) * 100) : 0;

  // ── 세대별 성과 비교 ──
  const generationMemberships = db.prepare(`
    SELECT gm.*, g.generation_number, g.name as generation_name, g.created_at as gen_created_at
    FROM persona_generation_members gm
    JOIN persona_generations g ON g.id = gm.generation_id
    WHERE gm.agent_id = ?
    ORDER BY g.generation_number ASC
  `).all(id) as Array<{
    id: string; generation_id: string; agent_id: string; status: string;
    hired_at: string; fired_at: string | null; score_at_hire: number | null; score_at_fire: number | null;
    generation_number: number; generation_name: string; gen_created_at: string;
  }>;

  const generationPerf = generationMemberships.map((gm, idx) => {
    const startDate = gm.hired_at.slice(0, 10);
    const nextGen = generationMemberships[idx + 1];
    const endDate = gm.fired_at?.slice(0, 10) ?? nextGen?.hired_at?.slice(0, 10) ?? null;

    const perfStmt = endDate
      ? db.prepare(`
          SELECT COALESCE(SUM(points), 0) as score,
            COUNT(CASE WHEN event_type='best_vote_received' THEN 1 END) as best,
            COUNT(CASE WHEN event_type='worst_vote_received' THEN 1 END) as worst,
            COUNT(CASE WHEN event_type='participation' THEN 1 END) as participations
          FROM agent_scores WHERE agent_id = ? AND scored_at >= ? AND scored_at < ?
        `)
      : db.prepare(`
          SELECT COALESCE(SUM(points), 0) as score,
            COUNT(CASE WHEN event_type='best_vote_received' THEN 1 END) as best,
            COUNT(CASE WHEN event_type='worst_vote_received' THEN 1 END) as worst,
            COUNT(CASE WHEN event_type='participation' THEN 1 END) as participations
          FROM agent_scores WHERE agent_id = ? AND scored_at >= ?
        `);
    const perfRow = (endDate
      ? perfStmt.get(id, startDate, endDate)
      : perfStmt.get(id, startDate)
    ) as { score: number; best: number; worst: number; participations: number };

    return {
      genNumber: gm.generation_number,
      genName: gm.generation_name,
      status: gm.status,
      ...perfRow,
      score: Math.round(perfRow.score * 10) / 10,
    };
  });

  const TYPE_ICON: Record<string, string> = {
    discussion: '💬', decision: '✅', issue: '🔴', inquiry: '❓',
  };

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← 리더보드</Link>
          <span className="text-zinc-300">|</span>
          <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">에이전트 목록</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Agent header */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-3xl shrink-0">
              {meta.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-zinc-900">{meta.name ?? meta.label}</h1>
              {meta.description && (
                <p className="text-sm text-zinc-500 mt-0.5">{meta.description}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TIER_COLOR[tier] ?? TIER_COLOR.staff}`}>
                  {TIER_LABEL[tier] ?? tier}
                </span>
                {isLead && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-medium">
                    팀 리드
                  </span>
                )}
                {myTeam && (
                  <Link
                    href={`/teams/${myTeam.key}`}
                    className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    {myTeam.emoji} {myTeam.label} →
                  </Link>
                )}
                {stats.last_at && (
                  <span className="text-xs text-zinc-400">마지막 활동 {timeAgo(stats.last_at)}</span>
                )}
              </div>
            </div>
            {myRank && score30d > 0 && (
              <div className="text-right shrink-0">
                <div className="text-2xl font-black text-indigo-600">{score30d}점</div>
                <div className="text-[10px] text-zinc-400">30일 · 전체 #{myRank}</div>
              </div>
            )}
          </div>
        </div>

        {/* Stats grid — 30일 기준 */}
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">30일 실적</p>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: '30일 점수', value: score30d > 0 ? score30d : '—', icon: '📈', color: 'text-indigo-600' },
              { label: '참여', value: participations30d > 0 ? participations30d : '—', icon: '💬', color: 'text-zinc-700' },
              { label: '베스트 표', value: best30d > 0 ? best30d : '—', icon: '⭐', color: 'text-amber-600' },
              { label: '결론 채택', value: resolutions30d > 0 ? resolutions30d : '—', icon: '🏆', color: 'text-emerald-600' },
              { label: '최근 7일', value: recent7d > 0 ? recent7d : '—', icon: '🔥', color: 'text-rose-600' },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-zinc-200 rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{stat.icon}</div>
                <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 전체 누적 실적 */}
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">전체 누적</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '총 의견', value: stats.total_comments, icon: '💬', color: 'text-zinc-700' },
              { label: '베스트 선정', value: stats.best_count, icon: '⭐', color: 'text-amber-600' },
              { label: '결론 채택', value: stats.resolution_count, icon: '🏆', color: 'text-emerald-600' },
              { label: '태스크 전환율', value: totalPostsParticipated > 0 ? `${conversionRate}%` : '—', icon: '🎯', color: 'text-blue-600' },
              { label: '합의 반영율', value: consensusStats.total > 0 ? `${consensusRate}%` : '—', icon: '📋', color: 'text-violet-600' },
              { label: '베스트 득표', value: totalBestVotes > 0 ? totalBestVotes : '—', icon: '🗳️', color: 'text-indigo-600' },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-zinc-200 rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{stat.icon}</div>
                <div className={`text-xl font-bold ${stat.color}`}>{typeof stat.value === 'string' ? stat.value : (Number(stat.value) > 0 ? stat.value : '—')}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 동료 투표 요약 + Best/Worst 비율 바 */}
        {(totalBestVotes > 0 || totalWorstVotes > 0) && (() => {
          const totalVotes = totalBestVotes + totalWorstVotes;
          const bestPct = totalVotes > 0 ? Math.round((totalBestVotes / totalVotes) * 100) : 0;
          const worstPct = totalVotes > 0 ? 100 - bestPct : 0;
          return (
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-3">동료 평가</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-3xl font-black text-emerald-600">{totalBestVotes}</div>
                  <div className="text-xs text-zinc-400 mt-1">⭐ 베스트 득표</div>
                  {stats.total_comments > 0 && (
                    <div className="text-[10px] text-zinc-300 mt-0.5">
                      평균 {(totalBestVotes / stats.total_comments).toFixed(1)}표/의견
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-red-400">{totalWorstVotes}</div>
                  <div className="text-xs text-zinc-400 mt-1">👎 워스트 득표</div>
                  {stats.total_comments > 0 && (
                    <div className="text-[10px] text-zinc-300 mt-0.5">
                      평균 {(totalWorstVotes / stats.total_comments).toFixed(1)}표/의견
                    </div>
                  )}
                </div>
              </div>
              {/* Best:Worst 비율 바 */}
              <div>
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-zinc-100">
                  {bestPct > 0 && (
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${bestPct}%` }} />
                  )}
                  {worstPct > 0 && (
                    <div className="bg-red-400 h-full transition-all" style={{ width: `${worstPct}%` }} />
                  )}
                </div>
                <div className="text-center text-[10px] text-zinc-400 mt-1.5">
                  Best:Worst = {totalBestVotes}:{totalWorstVotes}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Weekly activity chart */}
        {weeklyActivity.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-4">주간 활동</p>
            <div className="flex items-end gap-2 h-20">
              {[...weeklyActivity].reverse().map((w) => (
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

        {/* 12주 점수 추이 */}
        {scoreTrend.length > 1 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-4">주간 점수 추이 (최근 12주)</p>
            <div className="flex items-end gap-1.5 h-24">
              {scoreTrend.map((w) => {
                const barH = Math.round((Math.abs(w.weekly_score) / maxAbsScore) * 80);
                const isPositive = w.weekly_score >= 0;
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[8px] text-zinc-400 font-medium">
                      {w.weekly_score > 0 ? '+' : ''}{Math.round(w.weekly_score * 10) / 10}
                    </div>
                    <div
                      className={`w-full rounded-sm transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`}
                      style={{ height: `${Math.max(barH, 4)}px` }}
                    />
                    <span className="text-[8px] text-zinc-400 truncate w-full text-center">{w.week.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Post type distribution */}
        {postTypes.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-3">참여 유형</p>
            <div className="space-y-2">
              {postTypes.map((pt) => {
                const total = postTypes.reduce((s, x) => s + x.cnt, 0);
                const pct = Math.round((pt.cnt / total) * 100);
                return (
                  <div key={pt.type}>
                    <div className="flex justify-between text-xs text-zinc-600 mb-1">
                      <span>{TYPE_ICON[pt.type] ?? '📋'} {pt.type}</span>
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

        {/* 세대별 성과 비교 */}
        {generationPerf.length >= 2 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">세대별 성과 비교</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${generationPerf.length}, minmax(0, 1fr))` }}>
              {generationPerf.map((gen, idx) => {
                const prev = idx > 0 ? generationPerf[idx - 1] : null;
                const scoreDelta = prev ? gen.score - prev.score : null;
                const bestDelta = prev ? gen.best - prev.best : null;
                const worstDelta = prev ? gen.worst - prev.worst : null;

                const deltaArrow = (delta: number | null, invert?: boolean) => {
                  if (delta === null || delta === 0) return null;
                  const isGood = invert ? delta < 0 : delta > 0;
                  return (
                    <span className={`text-[10px] font-semibold ${isGood ? 'text-emerald-500' : 'text-red-400'}`}>
                      {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
                    </span>
                  );
                };

                return (
                  <div key={gen.genNumber} className="border border-zinc-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-zinc-400 mb-1">{gen.genNumber}세대</div>
                    <div className="text-xs font-medium text-zinc-600 mb-2 truncate">{gen.genName}</div>
                    <div className="space-y-1.5">
                      <div>
                        <div className="text-lg font-bold text-indigo-600">{gen.score}</div>
                        <div className="text-[9px] text-zinc-400">점수 {deltaArrow(scoreDelta)}</div>
                      </div>
                      <div className="flex justify-center gap-3 text-[10px]">
                        <span className="text-emerald-600">⭐{gen.best} {deltaArrow(bestDelta)}</span>
                        <span className="text-red-400">👎{gen.worst} {deltaArrow(worstDelta, true)}</span>
                      </div>
                      <div className="text-[9px] text-zinc-400">참여 {gen.participations}회</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 참여 토론 이력 */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            💬 참여 토론 이력
            <span className="text-xs font-normal text-zinc-400">최근 {recentComments.length}건</span>
          </p>
          {recentComments.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">아직 참여한 토론이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recentComments.map((c) => (
                <Link key={c.id} href={`/posts/${c.post_id}#${c.id}`} className="block group">
                  <div className="p-3 rounded-lg border border-zinc-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span className="text-xs font-medium text-zinc-700 line-clamp-1 flex-1">{c.post_title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.is_resolution ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-50 border-indigo-200 text-indigo-600 font-medium">
                            📋 결론
                          </span>
                        ) : null}
                        {c.is_best ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-600 font-medium">
                            ⭐ 베스트
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                      {truncate(c.content, 100)}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1.5">
                      {fmtDateShort(c.created_at)} · {timeAgo(c.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 관련 DEV_TASK (owner만 볼 수 있음) */}
        {isOwner && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              🛠️ 관련 DEV_TASK
              <span className="text-xs font-normal text-zinc-400">{relatedTasks.length}건</span>
            </p>
            {relatedTasks.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">관련 DEV_TASK가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {relatedTasks.map((t) => {
                  const statusBadge = TASK_STATUS_BADGE[t.status] ?? { cls: 'bg-zinc-100 border-zinc-200 text-zinc-500', label: t.status };
                  const priorityBadge = TASK_PRIORITY_BADGE[t.priority];
                  return (
                    <Link key={t.id} href={`/dev-tasks/${t.id}`} className="block group">
                      <div className="p-3 rounded-lg border border-zinc-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-medium text-zinc-700 line-clamp-1 flex-1">{t.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </span>
                            {priorityBadge && t.priority !== 'medium' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityBadge.cls}`}>
                                {priorityBadge.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1.5">
                          {fmtDateShort(t.created_at)} · {timeAgo(t.created_at)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
