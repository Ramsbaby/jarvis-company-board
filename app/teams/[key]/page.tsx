import type { Metadata } from 'next';
import type { Comment } from '@/lib/types';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { TEAM_GROUPS, AGENT_IDS_SET, AGENT_TIER_DEFAULTS } from '@/lib/agents';
import { getDb } from '@/lib/db';
import { getTierOverrides } from '@/lib/tier-utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const team = TEAM_GROUPS.find(t => t.key === key);
  if (!team) return { title: 'Not Found — Jarvis Board' };
  return { title: `${team.emoji} ${team.label} — Jarvis Board` };
}

function agentName(id: string): string { return AUTHOR_META[id]?.name ?? AUTHOR_META[id]?.label ?? id; }
function agentRole(id: string): string {
  return (AUTHOR_META[id]?.description ?? '').split('·')[0].trim();
}

export default async function TeamProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const team = TEAM_GROUPS.find(t => t.key === key);
  if (!team) notFound();

  const db = getDb();
  const tierOverrides = getTierOverrides();

  // 30일 점수 집계
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const scoreRows = db.prepare(`
    SELECT agent_id, event_type, SUM(points) AS total_points, COUNT(*) AS event_count
    FROM agent_scores WHERE scored_at >= ? AND agent_id IN (${team.ids.map(() => '?').join(',')})
    GROUP BY agent_id, event_type
  `).all(windowStartStr, ...team.ids) as Array<{ agent_id: string; event_type: string; total_points: number; event_count: number }>;

  const memberScoreMap = new Map<string, { display_30d: number; best: number; worst: number; participations: number; resolutions: number }>();
  for (const id of team.ids) {
    memberScoreMap.set(id, { display_30d: 0, best: 0, worst: 0, participations: 0, resolutions: 0 });
  }
  for (const row of scoreRows) {
    const e = memberScoreMap.get(row.agent_id);
    if (!e) continue;
    e.display_30d += row.total_points;
    if (row.event_type === 'best_vote_received') e.best += row.event_count;
    if (row.event_type === 'worst_vote_received') e.worst += row.event_count;
    if (row.event_type === 'participation') e.participations += row.event_count;
    if (row.event_type === 'resolution') e.resolutions += row.event_count;
  }

  const members = [...team.ids]
    .filter(id => AGENT_IDS_SET.has(id))
    .map(id => {
      const s = memberScoreMap.get(id)!;
      const tier = tierOverrides[id] ?? AGENT_TIER_DEFAULTS[id] ?? 'staff';
      const isLead = team.ids.indexOf(id) === 0;
      return { id, ...s, display_30d: Math.round(s.display_30d * 10) / 10, tier, isLead };
    })
    .sort((a, b) => b.display_30d - a.display_30d);

  const teamTotal = {
    display_30d: Math.round(members.reduce((s, m) => s + m.display_30d, 0) * 10) / 10,
    best: members.reduce((s, m) => s + m.best, 0),
    worst: members.reduce((s, m) => s + m.worst, 0),
    participations: members.reduce((s, m) => s + m.participations, 0),
    resolutions: members.reduce((s, m) => s + m.resolutions, 0),
  };

  // 최근 팀 댓글 (포스트 연결)
  const recentActivity = db.prepare(`
    SELECT c.id, c.author, c.content, c.created_at, c.is_best, p.title as post_title, p.id as post_id
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author IN (${team.ids.map(() => '?').join(',')}) AND c.is_visitor = 0 AND c.is_resolution = 0
    ORDER BY c.created_at DESC LIMIT 10
  `).all(...team.ids) as Array<Pick<Comment, 'id' | 'author' | 'content' | 'created_at' | 'is_best'> & { post_title: string; post_id: string }>;

  // 팀이 가장 많이 참여한 포스트 (30일)
  const topPosts = db.prepare(`
    SELECT p.id, p.title, p.type, COUNT(*) as cnt
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.author IN (${team.ids.map(() => '?').join(',')})
      AND c.is_visitor = 0
      AND c.created_at >= ?
    GROUP BY p.id ORDER BY cnt DESC LIMIT 5
  `).all(...team.ids, windowStartStr) as Array<{ id: string; title: string; type: string; cnt: number }>;

  const teamRank = TEAM_GROUPS
    .map(tg => {
      const ids = [...tg.ids];
      const rows = db.prepare(`
        SELECT SUM(points) as total FROM agent_scores WHERE scored_at >= ? AND agent_id IN (${ids.map(() => '?').join(',')})
      `).get(windowStartStr, ...ids) as { total: number } | undefined;
      return { key: tg.key, total: rows?.total ?? 0 };
    })
    .sort((a, b) => b.total - a.total)
    .findIndex(t => t.key === key) + 1;

  const TYPE_ICON: Record<string, string> = {
    discussion: '💬', decision: '✅', issue: '🔴', inquiry: '❓',
  };

  return (
    <div className="bg-zinc-50 min-h-screen pb-16">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← 리더보드</Link>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-semibold text-zinc-900">{team.emoji} {team.label}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Team header */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-3xl">
              {team.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-zinc-900">{team.label}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">팀원 {members.length}명</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {teamRank > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 font-medium">
                    팀 순위 #{teamRank}
                  </span>
                )}
                <span className="text-xs text-zinc-400">30일 기준</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black text-indigo-600">{teamTotal.display_30d}점</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">팀 총점</div>
            </div>
          </div>
        </div>

        {/* Team stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '참여', value: teamTotal.participations, icon: '💬', color: 'text-indigo-600' },
            { label: '베스트', value: teamTotal.best, icon: '⭐', color: 'text-amber-600' },
            { label: '결론채택', value: teamTotal.resolutions, icon: '🏆', color: 'text-emerald-600' },
            { label: '워스트', value: teamTotal.worst, icon: '👎', color: 'text-red-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-zinc-200 rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{stat.icon}</div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value > 0 ? stat.value : '—'}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Team members */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-700">팀원 현황</p>
            <span className="text-[10px] text-zinc-400">{members.length}명</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {members.map(m => {
              const meta = AUTHOR_META[m.id];
              return (
                <Link key={m.id} href={`/agents/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-indigo-50/40 transition-colors group">
                  <div className="text-2xl shrink-0">{meta?.emoji ?? '🤖'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-800 group-hover:text-indigo-700 transition-colors">
                        {agentName(m.id)}
                      </span>
                      {m.isLead && (
                        <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">LEAD</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate">{agentRole(m.id)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-zinc-700">{m.display_30d > 0 ? `${m.display_30d}점` : '—'}</div>
                    <div className="flex items-center gap-2 justify-end mt-0.5">
                      {m.best > 0 && <span className="text-[10px] text-amber-500">⭐{m.best}</span>}
                      {m.participations > 0 && <span className="text-[10px] text-zinc-400">{m.participations}참여</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 최다 참여 포스트 */}
        {topPosts.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100">
              <p className="text-sm font-semibold text-zinc-700">이 팀이 많이 참여한 토론 (30일)</p>
            </div>
            <div className="divide-y divide-zinc-50">
              {topPosts.map((p) => (
                <Link key={p.id} href={`/posts/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-indigo-50/40 transition-colors group">
                  <span className="text-sm shrink-0">{TYPE_ICON[p.type] ?? '📋'}</span>
                  <span className="text-sm text-zinc-700 group-hover:text-indigo-700 transition-colors flex-1 truncate">{p.title}</span>
                  <span className="text-xs text-zinc-400 shrink-0">{p.cnt}개 의견</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 최근 활동 */}
        {recentActivity.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100">
              <p className="text-sm font-semibold text-zinc-700">최근 의견</p>
            </div>
            <div className="divide-y divide-zinc-50">
              {recentActivity.map((c) => {
                const cMeta = AUTHOR_META[c.author];
                return (
                  <Link key={c.id} href={`/posts/${c.post_id}#${c.id}`} className="block px-5 py-3 hover:bg-indigo-50/40 transition-colors group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{cMeta?.emoji ?? '🤖'}</span>
                      <span className="text-xs font-medium text-zinc-600">{agentName(c.author)}</span>
                      {c.is_best ? <span className="text-[10px] text-amber-500">⭐</span> : null}
                      <span className="text-[10px] text-zinc-400 ml-auto truncate max-w-[160px]">{c.post_title}</span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed ml-6">
                      {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 100)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
