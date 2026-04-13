// ── Single Source of Truth: 에이전트 ID · 기본 티어 · UI 그룹 ─────────────────
// 새 에이전트 추가 시 이 파일의 AGENT_ROSTER만 수정하면 된다.
// scores, leaderboard, comments, export 라우트가 모두 여기서 import한다.

export type AgentTier = 'executives' | 'team-lead' | 'staff';

export interface AgentDef {
  id: string;
  /** DB tier_history가 없을 때의 기본 티어 */
  tier: AgentTier;
  /** AskAgentButton 및 에이전트 현황 페이지의 그룹 표시 */
  uiGroup: '임원진' | '이사회' | '전문가';
}

export const AGENT_ROSTER: readonly AgentDef[] = [
  // ── 임원진 ──────────────────────────────────────────────────────────────────
  { id: 'kim-seonhwi', tier: 'executives', uiGroup: '임원진' },
  { id: 'jung-mingi',  tier: 'executives', uiGroup: '임원진' },
  { id: 'lee-jihwan',  tier: 'executives', uiGroup: '임원진' },

  // ── 이사회 팀장급 ─────────────────────────────────────────────────────────────
  { id: 'infra-lead',   tier: 'team-lead', uiGroup: '이사회' },
  { id: 'career-lead',  tier: 'team-lead', uiGroup: '이사회' },
  { id: 'brand-lead',   tier: 'team-lead', uiGroup: '이사회' },
  { id: 'finance-lead', tier: 'team-lead', uiGroup: '이사회' },
  { id: 'record-lead',  tier: 'team-lead', uiGroup: '이사회' },

  // ── 실무 담당 ─────────────────────────────────────────────────────────────────
  { id: 'infra-team',   tier: 'staff', uiGroup: '전문가' },
  { id: 'brand-team',   tier: 'staff', uiGroup: '전문가' },
  { id: 'record-team',  tier: 'staff', uiGroup: '전문가' },
  { id: 'trend-team',   tier: 'staff', uiGroup: '전문가' },
  { id: 'growth-team',  tier: 'staff', uiGroup: '전문가' },
  { id: 'academy-team', tier: 'staff', uiGroup: '전문가' },
  { id: 'audit-team',   tier: 'staff', uiGroup: '전문가' },
  { id: 'llm-critic',   tier: 'staff', uiGroup: '전문가' },

  // ── 추가 실무 담당 ────────────────────────────────────────────────────────────
  { id: 'devops-team',   tier: 'staff', uiGroup: '전문가' },
  { id: 'finance-team',  tier: 'staff', uiGroup: '전문가' },
  { id: 'product-team',  tier: 'staff', uiGroup: '전문가' },
  { id: 'data-team',     tier: 'staff', uiGroup: '전문가' },

  // ── AI 시스템 (staff 티어, 이사회/전문가 그룹) ────────────────────────────────
  { id: 'board-synthesizer', tier: 'staff', uiGroup: '이사회' },
  { id: 'jarvis-proposer',   tier: 'staff', uiGroup: '전문가' },
  { id: 'council-team',      tier: 'staff', uiGroup: '전문가' },
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

/** 팀 기반 조직 구조 — 첫 번째 ID가 팀 리드 */
export const TEAM_GROUPS: readonly TeamGroup[] = [
  { key: 'infra',   label: 'SRE실',       emoji: '⚙️',  ids: ['infra-lead', 'infra-team', 'devops-team'] },
  { key: 'brand',   label: '마케팅실',    emoji: '✨',  ids: ['brand-lead', 'brand-team'] },
  { key: 'growth',  label: '인재개발실',  emoji: '📈',  ids: ['career-lead', 'growth-team', 'data-team'] },
  { key: 'finance', label: '재무실',      emoji: '💰',  ids: ['finance-lead', 'finance-team'] },
  { key: 'record',  label: '데이터실',    emoji: '📝',  ids: ['record-lead', 'record-team'] },
  { key: 'ai',      label: 'AI/프로덕트', emoji: '🧪',  ids: ['llm-critic', 'trend-team', 'product-team'] },
  { key: 'audit',   label: 'QA실',       emoji: '🔍',  ids: ['audit-team'] },
  { key: 'academy', label: '아카데미',    emoji: '📖',  ids: ['academy-team'] },
] as const;
