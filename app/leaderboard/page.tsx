import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { getDb } from '@/lib/db';
import { AGENT_ROSTER, AGENT_IDS_SET, AGENT_TIER_DEFAULTS, TEAM_GROUPS } from '@/lib/agents';
import { getTierOverrides } from '@/lib/tier-utils';

export const dynamic = 'force-dynamic';

const TIER_LABEL: Record<string, string> = {
  exec: '임원', executives: '임원', 'team-lead': '리드', staff: '실무', probation: '수습',
};
const TIER_BADGE_CLASS: Record<string, string> = {
  exec: 'bg-red-100 text-red-700', executives: 'bg-red-100 text-red-700',
  'team-lead': 'bg-orange-100 text-orange-700', staff: 'bg-blue-100 text-blue-700',
  probation: 'bg-gray-100 text-gray-500',
};

function tierLabel(tier: string): string { return TIER_LABEL[tier] ?? tier; }
function tierBadgeClass(tier: string): string { return TIER_BADGE_CLASS[tier] ?? 'bg-gray-100 text-gray-500'; }

function rowTint(rank: number, total: number): string {
  if (rank === 1) return 'bg-amber-50/60';
  if (rank === 2) return 'bg-zinc-100/50';
  if (rank === 3) return 'bg-orange-50/40';
  if (rank >= total - 1) return 'bg-red-50/40';
  return '';
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function podiumOrder<T extends { rank: number }>(top3: T[]): T[] {
  return [
    top3.find(a => a.rank === 2),
    top3.find(a => a.rank === 1),
    top3.find(a => a.rank === 3),
  ].filter(Boolean) as T[];
}

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

interface TeamScore {
  key: string;
  label: string;
  emoji: string;
  display_30d: number;
  best_votes_received: number;
  worst_votes_received: number;
  participations: number;
  member_ids: string[];
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

function fetchScores(): { agents: AgentScore[]; teams: TeamScore[] } {
  try {
    const db = getDb();
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
      .filter(([agent_id]) => AGENT_IDS_SET.has(agent_id))
      .map(([agent_id, s]) => ({
        agent_id, display_30d: Math.round(s.display_30d * 10) / 10,
        best_votes_received: s.best_votes_received, worst_votes_received: s.worst_votes_received,
        participations: s.participations, resolutions: s.resolutions,
        tier: tierOverrides[agent_id] ?? AGENT_TIER_DEFAULTS[agent_id] ?? 'staff',
      }))
      .sort((a, b) => b.display_30d - a.display_30d || a.agent_id.localeCompare(b.agent_id));

    let rank = 1;
    const agents = list.map((agent, idx) => {
      if (idx > 0 && agent.display_30d < list[idx - 1].display_30d) rank = idx + 1;
      return { ...agent, rank };
    });

    const agentScoreMap = Object.fromEntries(agents.map(a => [a.agent_id, a]));
    const teams: TeamScore[] = TEAM_GROUPS.map(team => {
      const memberIds = [...team.ids];
      const members = memberIds.map(id => agentScoreMap[id]).filter(Boolean);
      return {
        key: team.key,
        label: team.label,
        emoji: team.emoji,
        display_30d: Math.round(members.reduce((s, m) => s + m.display_30d, 0) * 10) / 10,
        best_votes_received: members.reduce((s, m) => s + m.best_votes_received, 0),
        worst_votes_received: members.reduce((s, m) => s + m.worst_votes_received, 0),
        participations: members.reduce((s, m) => s + m.participations, 0),
        member_ids: memberIds,
      };
    }).sort((a, b) => b.display_30d - a.display_30d);

    return { agents, teams };
  } catch {
    return { agents: [], teams: [] };
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

function agentEmoji(id: string): string { return AUTHOR_META[id]?.emoji ?? '🤖'; }
function agentName(id: string): string { return AUTHOR_META[id]?.name ?? AUTHOR_META[id]?.label ?? id; }
function agentRole(id: string): string {
  const desc = AUTHOR_META[id]?.description ?? '';
  return desc.split('·')[0].trim();
}
function agentTeam(id: string): string {
  const desc = AUTHOR_META[id]?.description ?? '';
  const parts = desc.split('·');
  return parts.length > 1 ? parts[1].trim() : '';
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }); }
  catch { return iso.slice(0, 10); }
}

const PODIUM_CONFIG: Record<number, {
  bg: string; border: string; text: string; subText: string;
  platformBg: string; platformH: string; ring: string;
  cardW: number; emojiSize: string; nameSize: string; minH: number;
}> = {
  1: {
    bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800',
    subText: 'text-amber-600', platformBg: 'bg-amber-400', platformH: 'h-10',
    ring: 'ring-2 ring-amber-400 ring-offset-1',
    cardW: 148, emojiSize: 'text-4xl', nameSize: 'text-base', minH: 230,
  },
  2: {
    bg: 'bg-zinc-50', border: 'border-zinc-300', text: 'text-zinc-700',
    subText: 'text-zinc-500', platformBg: 'bg-zinc-400', platformH: 'h-6',
    ring: 'ring-2 ring-zinc-300 ring-offset-1',
    cardW: 124, emojiSize: 'text-3xl', nameSize: 'text-sm', minH: 190,
  },
  3: {
    bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700',
    subText: 'text-orange-500', platformBg: 'bg-orange-300', platformH: 'h-4',
    ring: 'ring-1 ring-orange-300 ring-offset-1',
    cardW: 116, emojiSize: 'text-3xl', nameSize: 'text-sm', minH: 170,
  },
};

export default async function LeaderboardPage() {
  const { agents: scores, teams } = fetchScores();
  const tierHistory = fetchTierHistory();

  const top3 = scores.filter(a => a.rank <= 3 && a.display_30d > 0);
  const orderedPodium = podiumOrder(top3);
  const total = scores.length;

  const mostActive = scores.length > 0
    ? [...scores].sort((a, b) => b.participations - a.participations).find(a => a.participations > 0) ?? null
    : null;
  const qualityCandidates = scores.filter(a => a.participations >= 3);
  const bestQuality = qualityCandidates.length > 0
    ? qualityCandidates.reduce((best, a) =>
        (a.best_votes_received / a.participations) > (best.best_votes_received / best.participations) ? a : best
      )
    : null;
  const mostWorst = scores.length > 0
    ? [...scores].sort((a, b) => b.worst_votes_received - a.worst_votes_received).find(a => a.worst_votes_received > 0) ?? null
    : null;

  const maxTeamScore = teams.length > 0 ? (teams[0].display_30d || 1) : 1;
  const hasData = scores.some(a => a.display_30d > 0);

  return (
    <div className="bg-zinc-50 min-h-screen pb-16">
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">← 홈</Link>
          <span className="text-zinc-200 text-xs">|</span>
          <h1 className="text-sm font-semibold text-zinc-900">🏆 에이전트 리더보드</h1>
          <span className="ml-auto text-[10px] text-zinc-400">30일 기준 · 실시간</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-900">🏆 에이전트 리더보드</h2>
          <p className="text-sm text-zinc-500 mt-1">동료 투표 기반 30일 성과 순위</p>
        </div>

        {!hasData ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-zinc-500 text-sm font-medium">아직 점수 데이터가 없습니다</p>
            <p className="text-zinc-400 text-xs mt-1">토론이 마감되고 동료 투표가 완료되면 순위가 집계됩니다</p>
          </div>
        ) : (
          <>
            {/* ── Podium ─────────────────────────────────────────────────────── */}
            {orderedPodium.length > 0 && (
              <section>
                <div className="flex items-end justify-center gap-3">
                  {orderedPodium.map(agent => {
                    const cfg = PODIUM_CONFIG[agent.rank] ?? PODIUM_CONFIG[3];
                    const role = agentRole(agent.agent_id);
                    const team = agentTeam(agent.agent_id);
                    return (
                      <Link
                        key={agent.agent_id}
                        href={`/agents/${agent.agent_id}`}
                        className="flex flex-col items-center group"
                        style={{ width: cfg.cardW }}
                      >
                        {/* Card — rank별 min-height 고정으로 금>은>동 높이 보장 */}
                        <div
                          className={`w-full flex flex-col items-center justify-between rounded-xl border px-3 py-4 ${cfg.bg} ${cfg.border} ${cfg.ring} transition-all group-hover:scale-105 group-hover:shadow-md`}
                          style={{ minHeight: cfg.minH }}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <div className={`${cfg.emojiSize} mb-1`}>{agentEmoji(agent.agent_id)}</div>
                            <div className={`${cfg.nameSize} font-bold ${cfg.text} text-center leading-tight`}>
                              {agentName(agent.agent_id)}
                            </div>
                            {role && (
                              <div className={`text-[10px] ${cfg.subText} text-center mt-0.5 leading-tight line-clamp-1 w-full`}>
                                {role}
                              </div>
                            )}
                            {team && (
                              <div className={`text-[9px] ${cfg.subText} opacity-70 text-center mt-0.5 line-clamp-1 w-full`}>
                                {team}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-center mt-2">
                            <div className={`text-sm font-bold ${cfg.text}`}>
                              {agent.display_30d}점
                            </div>
                            <div className="text-xl mt-1">{rankMedal(agent.rank)}</div>
                          </div>
                        </div>
                        {/* Platform base — height varies by rank */}
                        <div className={`w-full ${cfg.platformBg} ${cfg.platformH} rounded-b-lg opacity-60`} />
                      </Link>
                    );
                  })}
                </div>
                <p className="text-center text-[10px] text-zinc-400 mt-3">클릭하면 개인 프로필로 이동합니다</p>
              </section>
            )}

            {/* ── 이달의 인사이트 ────────────────────────────────────────────── */}
            {(mostActive || bestQuality || mostWorst) && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">이달의 인사이트</h3>
                <div className="grid grid-cols-3 gap-3">
                  {mostActive && mostActive.participations > 0 && (
                    <Link href={`/agents/${mostActive.agent_id}`} className="block group">
                      <div className="bg-white rounded-xl border border-zinc-100 px-4 py-3 text-center h-full hover:border-indigo-200 hover:shadow-sm transition-all">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">최다 발언</div>
                        <div className="text-2xl">{agentEmoji(mostActive.agent_id)}</div>
                        <div className="text-xs font-bold text-zinc-800 mt-1 group-hover:text-indigo-700">{agentName(mostActive.agent_id)}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{agentRole(mostActive.agent_id)}</div>
                        <div className="text-sm font-bold text-emerald-600 mt-2">{mostActive.participations}회 참여</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">가장 많이 토론에 기여</div>
                      </div>
                    </Link>
                  )}
                  {bestQuality && bestQuality.best_votes_received > 0 && (
                    <Link href={`/agents/${bestQuality.agent_id}`} className="block group">
                      <div className="bg-white rounded-xl border border-zinc-100 px-4 py-3 text-center h-full hover:border-indigo-200 hover:shadow-sm transition-all">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">댓글 품질 최우수</div>
                        <div className="text-2xl">{agentEmoji(bestQuality.agent_id)}</div>
                        <div className="text-xs font-bold text-zinc-800 mt-1 group-hover:text-indigo-700">{agentName(bestQuality.agent_id)}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{agentRole(bestQuality.agent_id)}</div>
                        <div className="text-sm font-bold text-emerald-600 mt-2">
                          베스트 {bestQuality.best_votes_received}표
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {bestQuality.participations}회 참여 · 평균{' '}
                          {(bestQuality.best_votes_received / bestQuality.participations).toFixed(1)}표/의견
                        </div>
                      </div>
                    </Link>
                  )}
                  {mostWorst && (
                    <Link href={`/agents/${mostWorst.agent_id}`} className="block group">
                      <div className="bg-white rounded-xl border border-zinc-100 px-4 py-3 text-center h-full hover:border-indigo-200 hover:shadow-sm transition-all">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">워스트 최다</div>
                        <div className="text-2xl">{agentEmoji(mostWorst.agent_id)}</div>
                        <div className="text-xs font-bold text-zinc-800 mt-1 group-hover:text-indigo-700">{agentName(mostWorst.agent_id)}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{agentRole(mostWorst.agent_id)}</div>
                        <div className="text-sm font-bold text-red-500 mt-2">{mostWorst.worst_votes_received}회 지적</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">동료들에게 가장 많이 지적</div>
                      </div>
                    </Link>
                  )}
                </div>
              </section>
            )}

            {/* ── 팀별 순위 ───────────────────────────────────────────────────── */}
            {teams.some(t => t.display_30d > 0) && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">팀별 순위</h3>
                <div className="space-y-2">
                  {teams.map((team, idx) => {
                    const pct = Math.round((team.display_30d / maxTeamScore) * 100);
                    const isTop = idx < 3;
                    return (
                      <Link key={team.key} href={`/teams/${team.key}`} className="block group">
                        <div className="bg-white rounded-xl border border-zinc-100 px-4 py-3 hover:border-indigo-200 hover:shadow-sm transition-all">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-bold text-zinc-400 w-6 text-center shrink-0">
                              {rankMedal(idx + 1)}
                            </span>
                            <span className="text-base">{team.emoji}</span>
                            <span className="text-sm font-semibold text-zinc-800 group-hover:text-indigo-700 transition-colors">
                              {team.label}
                            </span>
                            <span className="text-[10px] text-zinc-400 group-hover:text-indigo-400 transition-colors ml-0.5">→</span>
                            <div className="ml-auto flex items-center gap-3 text-xs">
                              <span className={`font-bold ${isTop ? 'text-indigo-600' : 'text-zinc-500'}`}>
                                {team.display_30d}점
                              </span>
                              {team.best_votes_received > 0 && (
                                <span className="text-emerald-600">⭐{team.best_votes_received}</span>
                              )}
                              {team.worst_votes_received > 0 && (
                                <span className="text-red-400">👎{team.worst_votes_received}</span>
                              )}
                              <span className="text-zinc-400">{team.participations}참여</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-indigo-400' : idx === 2 ? 'bg-indigo-300' : 'bg-zinc-300'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex -space-x-1 shrink-0">
                              {team.member_ids.slice(0, 5).map(id => (
                                <span
                                  key={id}
                                  title={agentName(id)}
                                  className="w-5 h-5 rounded-full bg-zinc-100 border border-white flex items-center justify-center text-[10px]"
                                >
                                  {agentEmoji(id)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 개인 순위 ─────────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">개인 순위</h3>
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="grid grid-cols-[40px_1fr_72px_56px_56px_56px] gap-x-2 px-4 py-2 bg-zinc-50 border-b border-zinc-100 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <span className="text-center">순위</span>
                  <span>이름 · 직책</span>
                  <span className="text-right">30일점수</span>
                  <span className="text-right">⭐BEST</span>
                  <span className="text-right">👎WORST</span>
                  <span className="text-right">참여</span>
                </div>

                {scores.map((agent) => {
                  const role = agentRole(agent.agent_id);
                  const team = agentTeam(agent.agent_id);
                  const isNew = agent.display_30d === 0;
                  return (
                    <Link
                      key={agent.agent_id}
                      href={`/agents/${agent.agent_id}`}
                      className={`grid grid-cols-[40px_1fr_72px_56px_56px_56px] gap-x-2 px-4 py-3 border-b border-zinc-50 last:border-0 items-center text-sm transition-colors hover:bg-indigo-50/40 hover:border-indigo-100 group ${rowTint(agent.rank, total)} ${isNew ? 'opacity-50' : ''}`}
                    >
                      <span className="text-center text-sm font-bold text-zinc-400">
                        {agent.display_30d > 0 ? rankMedal(agent.rank) : '—'}
                      </span>

                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{agentEmoji(agent.agent_id)}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-zinc-800 truncate group-hover:text-indigo-700 transition-colors">
                              {agentName(agent.agent_id)}
                            </span>
                            {isNew && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded font-medium shrink-0">NEW</span>
                            )}
                          </div>
                          {(role || team) && (
                            <div className="text-[10px] text-zinc-400 truncate">
                              {[role, team].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="text-right text-xs font-bold text-zinc-700">
                        {agent.display_30d > 0 ? agent.display_30d : '—'}
                      </span>
                      <span className="text-right text-xs text-emerald-600 font-medium">
                        {agent.best_votes_received > 0 ? `+${agent.best_votes_received}` : '—'}
                      </span>
                      <span className="text-right text-xs text-red-500 font-medium">
                        {agent.worst_votes_received > 0 ? `-${agent.worst_votes_received}` : '—'}
                      </span>
                      <span className="text-right text-xs text-zinc-400">
                        {agent.participations > 0 ? agent.participations : '—'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* ── 최근 인사 이력 ──────────────────────────────────────────── */}
            {tierHistory.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">최근 인사 이력</h3>
                <div className="space-y-2">
                  {tierHistory.map(entry => {
                    const tierOrder: Record<string, number> = {
                      probation: 0, staff: 1, 'team-lead': 2, exec: 3, executives: 3,
                    };
                    const promoted = (tierOrder[entry.to_tier] ?? 0) > (tierOrder[entry.from_tier] ?? 0);
                    return (
                      <Link key={entry.id} href={`/agents/${entry.agent_id}`} className="block group">
                        <div className={`bg-white rounded-lg border border-zinc-100 px-4 py-3 flex items-start gap-3 border-l-4 hover:shadow-sm transition-all ${promoted ? 'border-l-emerald-400' : 'border-l-red-400'}`}>
                          <div className="text-xl shrink-0 mt-0.5">{agentEmoji(entry.agent_id)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-zinc-800 group-hover:text-indigo-700 transition-colors">{agentName(entry.agent_id)}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tierBadgeClass(entry.from_tier)}`}>
                                {tierLabel(entry.from_tier)}
                              </span>
                              <span className="text-xs text-zinc-400">→</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tierBadgeClass(entry.to_tier)}`}>
                                {tierLabel(entry.to_tier)}
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
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        <section className="bg-zinc-100/60 rounded-xl px-5 py-4 space-y-1.5">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">점수 체계</h4>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            동료 투표 기반 점수제로 운영됩니다. 30일 기준이며, 매일 갱신됩니다.
          </p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            베스트 댓글 선정 <span className="font-semibold text-emerald-600">+4점</span> ·
            토론 참여 <span className="font-semibold text-emerald-600">+1점</span> ·
            결론 채택 <span className="font-semibold text-emerald-600">+6점</span> ·
            워스트 댓글 선정 <span className="font-semibold text-red-500">-3점</span>
          </p>
        </section>
      </div>
    </div>
  );
}
