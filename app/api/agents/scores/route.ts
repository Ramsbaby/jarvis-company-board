export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { AGENT_ROSTER, AGENT_IDS_SET, AGENT_TIER_DEFAULTS, TEAM_GROUPS } from '@/lib/agents';
import type Database from 'better-sqlite3';

// ── Load tier overrides from DB (most recent tier_history entry per agent) ────
// Loads tier overrides from DB (most recent tier_history entry per agent).
function loadTierOverrides(db: Database.Database): Record<string, string> {
  try {
    const rows = db.prepare(`
      SELECT t1.agent_id, t1.to_tier
      FROM tier_history t1
      WHERE t1.created_at = (
        SELECT MAX(t2.created_at) FROM tier_history t2 WHERE t2.agent_id = t1.agent_id
      )
    `).all() as Array<{ agent_id: string; to_tier: string }>;

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.agent_id] = row.to_tier;
    }
    return result;
  } catch {
    return {};
  }
}

// ── GET /api/agents/scores ────────────────────────────────────────────────────
// Public: return aggregated scores per agent within a rolling window.
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const windowDays = Math.max(1, parseInt(searchParams.get('window') ?? '30', 10) || 30);
  const filterAgentId = searchParams.get('agent_id') ?? null;

  const db = getDb();
  const tierOverrides = loadTierOverrides(db);

  // Fetch all score events in the window
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT
      agent_id,
      event_type,
      SUM(points) AS total_points,
      COUNT(*) AS event_count
    FROM agent_scores
    WHERE scored_at >= ?
    ${filterAgentId ? 'AND agent_id = ?' : ''}
    GROUP BY agent_id, event_type
  `).all(...(filterAgentId ? [windowStartStr, filterAgentId] : [windowStartStr])) as Array<{
    agent_id: string;
    event_type: string;
    total_points: number;
    event_count: number;
  }>;

  // Build per-agent aggregates
  const agentMap = new Map<string, {
    display_30d: number;
    best_votes_received: number;
    worst_votes_received: number;
    participations: number;
    resolutions: number;
  }>();

  for (const row of rows) {
    if (!agentMap.has(row.agent_id)) {
      agentMap.set(row.agent_id, {
        display_30d: 0,
        best_votes_received: 0,
        worst_votes_received: 0,
        participations: 0,
        resolutions: 0,
      });
    }
    const entry = agentMap.get(row.agent_id)!;
    entry.display_30d += row.total_points;
    if (row.event_type === 'best_vote_received') entry.best_votes_received += row.event_count;
    if (row.event_type === 'worst_vote_received') entry.worst_votes_received += row.event_count;
    if (row.event_type === 'participation') entry.participations += row.event_count;
    if (row.event_type === 'resolution') entry.resolutions += row.event_count;
  }

  // Seed known agents from AGENT_ROSTER that have no score events yet
  for (const { id: agentId } of AGENT_ROSTER) {
    if (filterAgentId && agentId !== filterAgentId) continue;
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, {
        display_30d: 0,
        best_votes_received: 0,
        worst_votes_received: 0,
        participations: 0,
        resolutions: 0,
      });
    }
  }

  // Build sorted list with rank — 삭제된 에이전트 제외
  const agentList = Array.from(agentMap.entries())
    .filter(([agent_id]) => AGENT_IDS_SET.has(agent_id))
    .map(([agent_id, stats]) => ({
      agent_id,
      display_30d: Math.round(stats.display_30d * 10) / 10,
      best_votes_received: stats.best_votes_received,
      worst_votes_received: stats.worst_votes_received,
      participations: stats.participations,
      resolutions: stats.resolutions,
      tier: tierOverrides[agent_id] ?? AGENT_TIER_DEFAULTS[agent_id] ?? 'staff',
    }))
    .sort((a, b) => b.display_30d - a.display_30d || a.agent_id.localeCompare(b.agent_id));

  // Assign ranks (ties share the same rank)
  let rank = 1;
  const agents = agentList.map((agent, idx) => {
    if (idx > 0 && agent.display_30d < agentList[idx - 1].display_30d) {
      rank = idx + 1;
    }
    return { ...agent, rank };
  });

  // Build team-level aggregates
  const agentScoreMap = Object.fromEntries(agents.map(a => [a.agent_id, a]));
  const teams = TEAM_GROUPS.map(team => {
    const members = team.ids.map(id => agentScoreMap[id]).filter(Boolean);
    const total = members.reduce((sum, m) => sum + m.display_30d, 0);
    const best = members.reduce((sum, m) => sum + m.best_votes_received, 0);
    const worst = members.reduce((sum, m) => sum + m.worst_votes_received, 0);
    const participations = members.reduce((sum, m) => sum + m.participations, 0);
    return {
      key: team.key,
      label: team.label,
      emoji: team.emoji,
      display_30d: Math.round(total * 10) / 10,
      best_votes_received: best,
      worst_votes_received: worst,
      participations,
      member_count: members.length,
    };
  }).sort((a, b) => b.display_30d - a.display_30d);

  return NextResponse.json({ agents, teams });
}
