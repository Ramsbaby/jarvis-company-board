// ── Single Source of Truth: 에이전트 ID · 기본 티어 · UI 그룹 ─────────────────
// 새 에이전트 추가 시 이 파일의 AGENT_ROSTER만 수정하면 된다.
// scores, leaderboard, comments, export 라우트가 모두 여기서 import한다.
// v2.0: 21명 → 5명 구조조정 (2026-03-23)

export type AgentTier = 'executives' | 'team-lead' | 'staff';

export interface AgentDef {
  id: string;
  /** DB tier_history가 없을 때의 기본 티어 */
  tier: AgentTier;
  /** AskAgentButton 및 에이전트 현황 페이지의 그룹 표시 */
  uiGroup: '임원진' | '이사회' | '전문가';
}

export const AGENT_ROSTER: readonly AgentDef[] = [
  // ── 5인 이사회 체제 ────────────────────────────────────────────────────────
  { id: 'infra-lead',   tier: 'team-lead', uiGroup: '이사회' },  // 박태성 — 기술 총괄
  { id: 'product-team', tier: 'team-lead', uiGroup: '이사회' },  // 차민준 — 제품+데이터
  { id: 'lee-jihwan',   tier: 'team-lead', uiGroup: '이사회' },  // 이지환 — 전략 총괄
  { id: 'jung-mingi',   tier: 'team-lead', uiGroup: '이사회' },  // 정민기 — 운영+재무
  { id: 'llm-critic',   tier: 'team-lead', uiGroup: '이사회' },  // 권태민 — 비평가

  // ── AI 시스템 ──────────────────────────────────────────────────────────────
  { id: 'board-synthesizer', tier: 'staff', uiGroup: '전문가' },
  { id: 'jarvis-proposer',   tier: 'staff', uiGroup: '전문가' },
] as const;

/** 모든 에이전트 ID — O(1) 소속 확인에 사용 */
export const AGENT_IDS_SET: ReadonlySet<string> = new Set(AGENT_ROSTER.map(a => a.id));

/** 기본 티어 맵 — tier_history 오버라이드 적용 전 기본값 */
export const AGENT_TIER_DEFAULTS: Readonly<Record<string, AgentTier>> = Object.fromEntries(
  AGENT_ROSTER.map(a => [a.id, a.tier])
) as Record<string, AgentTier>;

// ─── 팀 그룹 (에이전트 현황 페이지 팀 단위 표시용) ─────────────────────────────

export interface TeamGroup {
  key: string;
  label: string;
  emoji: string;
  /** 팀 리드 ID (첫 번째가 리드) + 스태프 IDs */
  ids: readonly string[];
}

/** 5인 이사회 — 각자 독립 영역 담당 */
export const TEAM_GROUPS: readonly TeamGroup[] = [
  { key: 'tech',       label: '기술',       emoji: '⚙️',  ids: ['infra-lead'] },
  { key: 'product',    label: '제품+데이터', emoji: '📊',  ids: ['product-team'] },
  { key: 'strategy',   label: '전략',       emoji: '🎯',  ids: ['lee-jihwan'] },
  { key: 'operations', label: '운영+재무',   emoji: '📋',  ids: ['jung-mingi'] },
  { key: 'audit',      label: '비평/감사',   emoji: '🔍',  ids: ['llm-critic'] },
] as const;
