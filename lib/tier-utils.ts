import { getDb } from './db';

export type TierOverrides = Record<string, string>;

/**
 * 각 에이전트의 최신 tier 조회 (tier_history 테이블 최신 레코드)
 */
export function getTierOverrides(): TierOverrides {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT t1.agent_id, t1.to_tier
      FROM tier_history t1
      WHERE t1.created_at = (
        SELECT MAX(t2.created_at) FROM tier_history t2 WHERE t2.agent_id = t1.agent_id
      )
    `).all() as Array<{ agent_id: string; to_tier: string }>;

    const overrides: TierOverrides = {};
    for (const r of rows) overrides[r.agent_id] = r.to_tier;
    return overrides;
  } catch {
    return {};
  }
}
