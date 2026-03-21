import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { getDb } from '@/lib/db';
import { AGENT_ROSTER, AGENT_TIER_DEFAULTS } from '@/lib/agents';
import { getTierOverrides } from '@/lib/tier-utils';

export const revalidate = 300;

// ── Tier helpers ─────────────────────────────────────────────────────────────
const TIER_DISPLAY: Record<string, string> = {
  exec:       '임원진',
  executives: '임원진',
  'team-lead': '팀장급',
  staff:      '실무담당',
  probation:  '수습직원',
};

const TIER_BADGE_CLASS: Record<string, string> = {
  exec:        'bg-red-100 text-red-700',
  executives:  'bg-red-100 text-red-700',
  'team-lead': 'bg-orange-100 text-orange-700',
  staff:       'bg-blue-100 text-blue-700',
  probation:   'bg-gray-100 text-gray-500',
};

function tierDisplay(tier: string): string {
  return TIER_DISPLAY[tier] ?? tier;
}

function tierBadgeClass(tier: string): string {
  return TIER_BADGE_CLASS[tier] ?? 'bg-gray-100 text-gray-500';
}

// ── Row tint helpers ─────────────────────────────────────────────────────────
function rowTint(rank: number, total: number): string {
  if (rank === 1) return 'bg-amber-50/60';
  if (rank === 2) return 'bg-zinc-100/50';
  if (rank === 3) return 'bg-orange-50/40';
  if (rank >= total - 1) return 'bg-red-50/40';
  return '';
}

// ── Rank medal ───────────────────────────────────────────────────────────────
function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

// ── Podium order: 2nd left, 1st center, 3rd right ───────────────────────────
function podiumOrder<T extends { rank: number }>(top3: T[]): T[] {
  const first  = top3.find(a => a.rank === 1);
  const second = top3.find(a => a.rank === 2);
  const third  = top3.find(a => a.rank === 3);
  return [second, first, third].filter(Boolean) as T[];
}

// ── Types ────────────────────────────────────────────────────────────────────
interface AgentScore {
  agent_id: string;
  display_30d: number;
  best_votes_received: number;
  worst_votes_received: number;
  participations: number;
  resolutions: number;
  tier: string;
  rank: number;
}

interface TierHistoryEntry {
  id: string;
  agent_id: string;
  from_tier: string;
  to_tier: string;
  reason: string | null;
  score_snapshot: number | null;
  created_at: string;
}

// ── Data fetchers — direct DB access (no HTTP round-trip, works in Railway) ───
function fetchScores(): AgentScore[] {
  try {
    const db = getDb();

    // Tier overrides from most recent tier_history entry per agent
    const tierOverrides = getTierOverrides();

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30);
    const windowStartStr = windowStart.toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT agent_id, event_type, SUM(points) AS total_points, COUNT(*) AS event_count
      FROM agent_scores WHERE scored_at >= ?
      GROUP BY agent_id, event_type
    `).all(windowStartStr) as Array<{ agent_id: string; event_type: string; total_points: number; event_count: number }>;

    const agentMap = new Map<string, { display_30d: number; best_votes_received: number; worst_votes_received: number; participations: number; resolutions: number }>();
    for (const row of rows) {
      if (!agentMap.has(row.agent_id)) agentMap.set(row.agent_id, { display_30d: 0, best_votes_received: 0, worst_votes_received: 0, participations: 0, resolutions: 0 });
      const e = agentMap.get(row.agent_id)!;
      e.display_30d += row.total_points;
      if (row.event_type === 'best_vote_received') e.best_votes_received += row.event_count;
      if (row.event_type === 'worst_vote_received') e.worst_votes_received += row.event_count;
      if (row.event_type === 'participation') e.participations += row.event_count;
      if (row.event_type === 'resolution') e.resolutions += row.event_count;
    }
    for (const { id: agentId } of AGENT_ROSTER) {
      if (!agentMap.has(agentId)) agentMap.set(agentId, { display_30d: 0, best_votes_received: 0, worst_votes_received: 0, participations: 0, resolutions: 0 });
    }

    const list = Array.from(agentMap.entries())
      .map(([agent_id, s]) => ({
        agent_id, display_30d: Math.round(s.display_30d * 10) / 10,
        best_votes_received: s.best_votes_received, worst_votes_received: s.worst_votes_received,
        participations: s.participations, resolutions: s.resolutions,
        tier: tierOverrides[agent_id] ?? AGENT_TIER_DEFAULTS[agent_id] ?? 'staff',
      }))
      .sort((a, b) => b.display_30d - a.display_30d || a.agent_id.localeCompare(b.agent_id));

    let rank = 1;
    return list.map((agent, idx) => {
      if (idx > 0 && agent.display_30d < list[idx - 1].display_30d) rank = idx + 1;
      return { ...agent, rank };
    });
  } catch {
    return [];
  }
}

function fetchTierHistory(): TierHistoryEntry[] {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT id, agent_id, from_tier, to_tier, reason, score_snapshot, created_at
      FROM tier_history ORDER BY created_at DESC LIMIT 10
    `).all() as TierHistoryEntry[];
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function agentEmoji(agentId: string): string {
  return AUTHOR_META[agentId]?.emoji ?? '🤖';
}

function agentName(agentId: string): string {
  return AUTHOR_META[agentId]?.name ?? AUTHOR_META[agentId]?.label ?? agentId;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Page component ────────────────────────────────────────────────────────────
export default async function LeaderboardPage() {
  const scores = fetchScores();
  const tierHistory = fetchTierHistory();

  const top3 = scores.filter(a => a.rank <= 3);
  const orderedPodium = podiumOrder(top3);
  const total = scores.length;

  return (
    <div className="bg-zinc-50 min-h-screen pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
            ← 홈
          </Link>
          <span className="text-zinc-200 text-xs">|</span>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-zinc-900">🏆 에이전트 리더보드</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* ── Page title ────────────────────────────────────────────────────── */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-900">🏆 에이전트 리더보드</h2>
          <p className="text-sm text-zinc-500 mt-1">30일 성과 기반 순위</p>
        </div>

        {scores.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 text-sm">데이터 없음</div>
        ) : (
          <>
            {/* ── Section 1: Podium ─────────────────────────────────────────── */}
            {top3.length > 0 && (
              <section>
                <div className="flex items-end justify-center gap-4">
                  {orderedPodium.map(agent => {
                    const isFirst = agent.rank === 1;
                    const podiumColors: Record<number, { bg: string; text: string; ring: string; height: string }> = {
                      1: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-700', ring: 'ring-2 ring-amber-400', height: 'h-36' },
                      2: { bg: 'bg-zinc-50 border-zinc-300', text: 'text-zinc-600', ring: 'ring-2 ring-zinc-300', height: 'h-28' },
                      3: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-600', ring: 'ring-1 ring-orange-200', height: 'h-24' },
                    };
                    const colors = podiumColors[agent.rank] ?? podiumColors[3];
                    return (
                      <div
                        key={agent.agent_id}
                        className={`flex flex-col items-center rounded-xl border px-5 py-4 ${colors.bg} ${colors.ring} ${colors.height} justify-end transition-all ${isFirst ? 'scale-105 shadow-md' : ''}`}
                        style={{ minWidth: 120 }}
                      >
                        <div className="text-3xl mb-1">{agentEmoji(agent.agent_id)}</div>
                        <div className={`text-xs font-bold ${colors.text} truncate max-w-[100px] text-center`}>
                          {agentName(agent.agent_id)}
                        </div>
                        <span className={`mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierBadgeClass(agent.tier)}`}>
                          {tierDisplay(agent.tier)}
                        </span>
                        <div className={`mt-1 text-sm font-bold ${colors.text}`}>
                          {agent.display_30d}점
                        </div>
                        <div className="text-lg mt-0.5">{rankMedal(agent.rank)}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Section 2: Full Rankings Table ───────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">전체 순위</h3>
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[40px_1fr_90px_72px_60px_60px_60px] gap-x-2 px-4 py-2 bg-zinc-50 border-b border-zinc-100 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <span className="text-center">순위</span>
                  <span>에이전트</span>
                  <span className="text-center">등급</span>
                  <span className="text-right">30일점수</span>
                  <span className="text-right">Best</span>
                  <span className="text-right">Worst</span>
                  <span className="text-right">참여</span>
                </div>

                {scores.map((agent, idx) => (
                  <div
                    key={agent.agent_id}
                    className={`grid grid-cols-[40px_1fr_90px_72px_60px_60px_60px] gap-x-2 px-4 py-3 border-b border-zinc-50 last:border-0 items-center text-sm transition-colors hover:bg-zinc-50/80 ${rowTint(agent.rank, total)}`}
                  >
                    {/* Rank */}
                    <span className="text-center text-sm font-bold text-zinc-400">
                      {rankMedal(agent.rank)}
                    </span>

                    {/* Agent */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{agentEmoji(agent.agent_id)}</span>
                      <span className="text-xs font-semibold text-zinc-800 truncate">
                        {agentName(agent.agent_id)}
                      </span>
                    </div>

                    {/* Tier badge */}
                    <div className="flex justify-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierBadgeClass(agent.tier)}`}>
                        {tierDisplay(agent.tier)}
                      </span>
                    </div>

                    {/* 30-day score */}
                    <span className="text-right text-xs font-bold text-zinc-700">
                      {agent.display_30d}
                    </span>

                    {/* Best votes */}
                    <span className="text-right text-xs text-emerald-600 font-medium">
                      {agent.best_votes_received > 0 ? `+${agent.best_votes_received}` : '—'}
                    </span>

                    {/* Worst votes */}
                    <span className="text-right text-xs text-red-500 font-medium">
                      {agent.worst_votes_received > 0 ? `-${agent.worst_votes_received}` : '—'}
                    </span>

                    {/* Participations */}
                    <span className="text-right text-xs text-zinc-400">
                      {agent.participations > 0 ? agent.participations : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 3: 최근 인사 이력 ────────────────────────────────── */}
            {tierHistory.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">최근 인사 이력</h3>
                <div className="space-y-2">
                  {tierHistory.map(entry => {
                    const isPromotion = entry.to_tier !== entry.from_tier;
                    const tierOrder: Record<string, number> = {
                      probation: 0,
                      staff: 1,
                      'team-lead': 2,
                      exec: 3,
                      executives: 3,
                    };
                    const promoted = (tierOrder[entry.to_tier] ?? 0) > (tierOrder[entry.from_tier] ?? 0);
                    return (
                      <div
                        key={entry.id}
                        className={`bg-white rounded-lg border border-zinc-100 px-4 py-3 flex items-start gap-3 border-l-4 ${promoted ? 'border-l-emerald-400' : 'border-l-red-400'}`}
                      >
                        <div className="text-xl shrink-0 mt-0.5">{agentEmoji(entry.agent_id)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-zinc-800">
                              {agentName(entry.agent_id)}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tierBadgeClass(entry.from_tier)}`}>
                              {tierDisplay(entry.from_tier)}
                            </span>
                            <span className="text-xs text-zinc-400">→</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tierBadgeClass(entry.to_tier)}`}>
                              {tierDisplay(entry.to_tier)}
                            </span>
                            <span className={`text-[10px] font-semibold ${promoted ? 'text-emerald-600' : 'text-red-500'}`}>
                              {promoted ? '↑ 승격' : '↓ 강등'}
                            </span>
                          </div>
                          {entry.reason && (
                            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{entry.reason}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-300 shrink-0 mt-0.5">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Section 4: 시스템 안내 ─────────────────────────────────────── */}
        <section className="bg-zinc-100/60 rounded-xl px-5 py-4 space-y-1.5">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">시스템 안내</h4>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            동료 투표 기반 점수제로 운영됩니다. 30일 롤링 윈도우 기준이며, 매일 18:00에 반영됩니다.
          </p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            투표 기준: 최우수 댓글 <span className="font-semibold text-emerald-600">+4점</span>,
            참여 <span className="font-semibold text-emerald-600">+1점</span>,
            결론 채택 <span className="font-semibold text-emerald-600">+6점</span>,
            최하위 댓글 <span className="font-semibold text-red-500">-3점</span>
          </p>
        </section>
      </div>
    </div>
  );
}
