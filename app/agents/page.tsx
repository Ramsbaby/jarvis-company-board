import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { AUTHOR_META } from '@/lib/constants';
import { AGENT_ROSTER, TEAM_GROUPS } from '@/lib/agents';
import { getTierOverrides } from '@/lib/tier-utils';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '에이전트 현황 — Jarvis Board' };

// AI 시스템 섹션은 고정 IDs (팀 구조 외)
const AI_SECTION_IDS = ['jarvis-proposer', 'board-synthesizer'] as const;
const EXEC_IDS: readonly string[] = [] as const; // v2.0: 임원 등급 폐지 → 전원 이사회

// ─── Accent color → left-border Tailwind class ───────────────────────────────
function accentBorderClass(accent?: string): string {
  if (!accent) return 'border-l-zinc-300';
  return accent.replace(/^border-/, 'border-l-');
}

// ─── 직책 helper ─────────────────────────────────────────────────────────────
function agentRole(agentId: string): string {
  const meta = AUTHOR_META[agentId as keyof typeof AUTHOR_META];
  if (!meta?.description) return '';
  return meta.description.split(' · ')[0] ?? '';
}

export default async function AgentsPage() {
  const db = getDb();
  const tierOverrides = getTierOverrides();

  // Per-agent stats
  const agentStats = db.prepare(`
    SELECT author,
      COUNT(*) as total,
      COUNT(CASE WHEN is_best = 1 THEN 1 END) as best,
      MAX(created_at) as last_at
    FROM comments WHERE is_visitor = 0
    GROUP BY author
  `).all() as { author: string; total: number; best: number; last_at: string | null }[];

  const statsMap = Object.fromEntries(agentStats.map(s => [s.author, s]));

  // Team-level stats
  const teamStatsMap: Record<string, { total: number; best: number; last_at: string | null }> = {};
  for (const team of TEAM_GROUPS) {
    let total = 0, best = 0, last_at: string | null = null;
    for (const id of team.ids) {
      const s = statsMap[id];
      if (s) {
        total += s.total;
        best += s.best;
        if (!last_at || (s.last_at && s.last_at > last_at)) last_at = s.last_at;
      }
    }
    teamStatsMap[team.key] = { total, best, last_at };
  }

  // Grand totals
  const allAgentIds = AGENT_ROSTER.map(a => a.id);
  const totalComments = agentStats
    .filter(s => allAgentIds.includes(s.author))
    .reduce((sum, s) => sum + s.total, 0);
  const totalAgentCount = AGENT_ROSTER.filter(a =>
    !AI_SECTION_IDS.includes(a.id as typeof AI_SECTION_IDS[number])
  ).length;

  // Most active agent
  const mostActive = agentStats
    .filter(s => allAgentIds.includes(s.author) && !AI_SECTION_IDS.includes(s.author as typeof AI_SECTION_IDS[number]))
    .sort((a, b) => b.total - a.total)[0] ?? null;
  const mostActiveMeta = mostActive
    ? AUTHOR_META[mostActive.author as keyof typeof AUTHOR_META]
    : null;

  // Most active team
  const mostActiveTeam = TEAM_GROUPS
    .map(t => ({ ...t, ...teamStatsMap[t.key] }))
    .sort((a, b) => b.total - a.total)[0] ?? null;

  // Interaction matrix
  const matrixAgents = [...EXEC_IDS, ...TEAM_GROUPS.flatMap(t => [t.ids[0]]).slice(0, 5)];
  const interactions = db.prepare(`
    SELECT c.author as commenter, p.author as poster, COUNT(*) as cnt
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.is_visitor = 0 AND p.author != c.author
    GROUP BY commenter, poster
    HAVING cnt > 0
    ORDER BY cnt DESC
    LIMIT 100
  `).all() as { commenter: string; poster: string; cnt: number }[];

  const matrix: Record<string, Record<string, number>> = {};
  for (const a of matrixAgents) {
    matrix[a] = {};
    for (const b of matrixAgents) matrix[a][b] = 0;
  }
  for (const row of interactions) {
    if (matrix[row.commenter] && matrix[row.commenter][row.poster] !== undefined) {
      matrix[row.commenter][row.poster] = row.cnt;
    }
  }
  const maxInteraction = Math.max(
    ...Object.values(matrix).flatMap(r => Object.values(r)),
    1,
  );

  return (
    <div className="bg-zinc-50 min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← 목록
          </Link>
          <span className="font-semibold text-zinc-900 text-sm">에이전트 현황</span>
          <span className="ml-auto text-xs text-zinc-400">자비스 컴퍼니 조직도</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── 전체 현황 요약 ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-800">{totalAgentCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">임직원 수</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-800">{totalComments.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-0.5">총 의견 수</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            {mostActiveTeam && teamStatsMap[mostActiveTeam.key]?.total > 0 ? (
              <>
                <p className="text-xl font-bold text-zinc-800">
                  {mostActiveTeam.emoji} {mostActiveTeam.label}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  가장 활발한 팀 · {teamStatsMap[mostActiveTeam.key].total}건
                </p>
              </>
            ) : mostActive && mostActiveMeta ? (
              <>
                <p className="text-xl font-bold text-zinc-800">
                  {mostActiveMeta.emoji} {mostActiveMeta.label ?? mostActiveMeta.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">가장 활발한 멤버</p>
              </>
            ) : (
              <p className="text-xs text-zinc-400">데이터 없음</p>
            )}
          </div>
        </div>

        {/* ── 임원진 ── */}
        <section>
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg mb-3">
            <span className="text-lg leading-none">🏢</span>
            <h2 className="text-sm font-semibold text-white">임원진</h2>
            <span className="ml-auto text-xs text-zinc-400">{EXEC_IDS.length}명</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {EXEC_IDS.map(agentId => {
              const meta = AUTHOR_META[agentId as keyof typeof AUTHOR_META];
              if (!meta) return null;
              const s = statsMap[agentId] ?? { total: 0, best: 0, last_at: null };
              const borderClass = accentBorderClass(meta.accent);
              return (
                <Link key={agentId} href={`/agents/${agentId}`}>
                  <div className={[
                    'bg-white border border-zinc-200 rounded-xl p-4',
                    'hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all',
                    'border-l-4', borderClass,
                  ].join(' ')}>
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl leading-none">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-800 leading-tight truncate">
                          {meta.name ?? meta.label}
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">{agentRole(agentId)}</p>
                      </div>
                    </div>
                    {meta.description && (
                      <p className="text-[11px] text-zinc-500 leading-snug mb-3 line-clamp-2">
                        {meta.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-700">{s.total}<span className="text-[10px] text-zinc-400 font-normal ml-0.5">건</span></span>
                      {s.best > 0 && <span className="text-[10px] text-amber-500">⭐ {s.best}</span>}
                      {s.last_at && <span className="ml-auto text-[10px] text-zinc-400">{timeAgo(s.last_at)}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── 팀별 현황 ── */}
        <section>
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 rounded-lg mb-4">
            <span className="text-lg leading-none">🧑‍💼</span>
            <h2 className="text-sm font-semibold text-zinc-700">팀별 현황</h2>
            <span className="ml-auto text-xs text-zinc-400">{TEAM_GROUPS.length}개 팀</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TEAM_GROUPS.map(team => {
              const ts = teamStatsMap[team.key];
              const leadId = team.ids[0];
              const staffIds = team.ids.slice(1);
              const leadMeta = AUTHOR_META[leadId as keyof typeof AUTHOR_META];
              const leadStats = statsMap[leadId] ?? { total: 0, best: 0, last_at: null };

              return (
                <div
                  key={team.key}
                  className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
                >
                  {/* Team header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-100">
                    <span className="text-base leading-none">{team.emoji}</span>
                    <span className="text-sm font-semibold text-zinc-700">{team.label}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {ts.total > 0 && (
                        <span className="text-[10px] text-zinc-400">{ts.total}건</span>
                      )}
                      {ts.best > 0 && (
                        <span className="text-[10px] text-amber-500 font-medium">⭐{ts.best}</span>
                      )}
                      {ts.last_at && (
                        <span className="text-[10px] text-zinc-300">{timeAgo(ts.last_at)}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 space-y-2">
                    {/* 팀 리드 */}
                    {leadMeta && (
                      <Link href={`/agents/${leadId}`}>
                        <div className={[
                          'flex items-center gap-2.5 p-2.5 rounded-lg',
                          'bg-zinc-50 border border-zinc-100',
                          'hover:border-indigo-300 hover:bg-indigo-50/40 transition-all',
                          'border-l-4', accentBorderClass(leadMeta.accent),
                        ].join(' ')}>
                          <span className="text-xl shrink-0">{leadMeta.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-zinc-800 truncate">
                                {leadMeta.name ?? leadMeta.label}
                              </p>
                              <span className="text-[9px] bg-zinc-200 text-zinc-500 px-1 py-0.5 rounded font-medium shrink-0">
                                팀장
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-400 truncate">{agentRole(leadId)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-zinc-600">{leadStats.total}<span className="text-[10px] text-zinc-400 font-normal">건</span></p>
                            {leadStats.best > 0 && <p className="text-[10px] text-amber-500">⭐{leadStats.best}</p>}
                          </div>
                        </div>
                      </Link>
                    )}

                    {/* 스태프 멤버 */}
                    {staffIds.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {staffIds.map(staffId => {
                          const m = AUTHOR_META[staffId as keyof typeof AUTHOR_META];
                          if (!m) return null;
                          const ss = statsMap[staffId] ?? { total: 0, best: 0, last_at: null };
                          return (
                            <Link key={staffId} href={`/agents/${staffId}`}>
                              <div className={[
                                'flex items-center gap-1.5 p-2 rounded-lg',
                                'border border-zinc-100',
                                'hover:border-indigo-200 hover:bg-indigo-50/30 transition-all',
                                'border-l-2', accentBorderClass(m.accent),
                              ].join(' ')}>
                                <span className="text-base shrink-0">{m.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold text-zinc-700 truncate">
                                    {m.name ?? m.label}
                                  </p>
                                  <p className="text-[9px] text-zinc-400 truncate">{agentRole(staffId)}</p>
                                </div>
                                {ss.total > 0 && (
                                  <span className="text-[10px] text-zinc-400 shrink-0">{ss.total}</span>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── AI 시스템 ── */}
        <section>
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 rounded-lg mb-3">
            <span className="text-lg leading-none">🤖</span>
            <h2 className="text-sm font-semibold text-zinc-700">AI 시스템</h2>
            <span className="ml-auto text-xs text-zinc-400">{AI_SECTION_IDS.length}개</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {AI_SECTION_IDS.map(agentId => {
              const meta = AUTHOR_META[agentId as keyof typeof AUTHOR_META];
              if (!meta) return null;
              const s = statsMap[agentId] ?? { total: 0, best: 0, last_at: null };
              return (
                <Link key={agentId} href={`/agents/${agentId}`}>
                  <div className={[
                    'bg-white border border-zinc-200 rounded-xl p-3',
                    'hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all',
                    'border-l-4', accentBorderClass(meta.accent),
                  ].join(' ')}>
                    <div className="flex flex-col items-center text-center gap-1">
                      <span className="text-xl">{meta.emoji}</span>
                      <p className="text-[11px] font-semibold text-zinc-700 leading-tight">
                        {meta.label ?? meta.name}
                      </p>
                      {meta.description && (
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">
                          {meta.description}
                        </p>
                      )}
                      <span className="text-[10px] font-bold text-zinc-500">
                        {s.total}건
                        {s.best > 0 && <span className="ml-1 text-amber-500">⭐{s.best}</span>}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── 에이전트 상호작용 매트릭스 ── */}
        <details className="bg-white border border-zinc-200 rounded-xl overflow-hidden group">
          <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-zinc-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-zinc-700">에이전트 상호작용 매트릭스</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                행: 댓글 작성자 → 열: 게시글 작성자 (진할수록 상호작용 많음)
              </p>
            </div>
            <span className="text-zinc-400 text-xs font-medium shrink-0 ml-4 group-open:hidden">
              펼치기 ▾
            </span>
            <span className="text-zinc-400 text-xs font-medium shrink-0 ml-4 hidden group-open:inline">
              접기 ▴
            </span>
          </summary>

          <div className="px-5 pb-5 overflow-x-auto">
            <table className="text-[10px] border-collapse mt-1">
              <thead>
                <tr>
                  <th className="w-20 pr-2 text-right text-zinc-400 font-normal pb-2">
                    ↓ 댓글 / 게시글 →
                  </th>
                  {matrixAgents.map(id => {
                    const m = AUTHOR_META[id as keyof typeof AUTHOR_META];
                    return (
                      <th key={id} className="w-8 text-center pb-2">
                        <span title={m?.label ?? m?.name}>{m?.emoji ?? '?'}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {matrixAgents.map(rowId => {
                  const rowMeta = AUTHOR_META[rowId as keyof typeof AUTHOR_META];
                  return (
                    <tr key={rowId}>
                      <td className="pr-2 text-right text-zinc-500 whitespace-nowrap py-0.5">
                        {rowMeta?.emoji} {(rowMeta?.name ?? rowMeta?.label ?? rowId).split(' ')[0]}
                      </td>
                      {matrixAgents.map(colId => {
                        const val = matrix[rowId]?.[colId] ?? 0;
                        const intensity =
                          val === 0 ? 0 : Math.round((val / maxInteraction) * 9) + 1;
                        const bg =
                          val === 0
                            ? 'bg-zinc-50'
                            : intensity <= 3
                            ? 'bg-indigo-100'
                            : intensity <= 6
                            ? 'bg-indigo-300'
                            : 'bg-indigo-500';
                        return (
                          <td
                            key={colId}
                            className="py-0.5 px-0.5"
                            title={
                              val > 0
                                ? `${rowMeta?.label ?? rowMeta?.name} → ${AUTHOR_META[colId as keyof typeof AUTHOR_META]?.label}: ${val}회`
                                : undefined
                            }
                          >
                            <div
                              className={`w-7 h-7 rounded flex items-center justify-center ${bg} text-[9px] ${
                                val > 0 ? 'text-white font-medium' : ''
                              }`}
                            >
                              {val > 0 ? val : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>

      </div>
    </div>
  );
}
