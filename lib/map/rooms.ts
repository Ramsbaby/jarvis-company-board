/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Shared room, collision, pathfinding, type definitions
   Extracted from app/company/VirtualOffice.tsx (pure logic, no React)
   ═══════════════════════════════════════════════════════════════════ */

export const T = 32; // tile size
export const COLS = 40;
export const ROWS = 34;
export const MOVE_SPEED = 130; // ms per tile

// ── 방 정의 ────────────────────────────────────────────────────
export interface RoomDef {
  id: string;
  entityId: string;
  name: string;
  emoji: string;
  description: string;
  x: number; y: number; w: number; h: number;
  type: 'team' | 'server' | 'meeting' | 'cron';
  npcX: number; npcY: number;
  teamColor: string;
  floorStyle: 'executive' | 'carpet' | 'metal' | 'stage';
}

export const ROOMS: RoomDef[] = [
  // Row 1 (y=2)
  { id: 'ceo',         entityId: 'ceo',         name: 'CEO실',      emoji: '👔', description: '자비스 컴퍼니 CEO(Opus). 주간 경영보고·KPI 평가·중요 판단 총괄. 매주 월 09:00 경영회의를 주재하고 전사 방향을 결정합니다.',                                                             x: 2,  y: 2,  w: 7, h: 5, type: 'meeting', npcX: 5,  npcY: 4,  teamColor: '#c9a227', floorStyle: 'executive' },
  { id: 'infra-lead',  entityId: 'infra-lead',  name: '인프라팀',   emoji: '🖥️', description: '서버·봇·크론·디스크 안정성 관리. 매일 09:00 자동 자가진단을 실행하고 이상 감지 시 Discord #jarvis-system에 즉시 경보를 발송합니다.',                                               x: 11, y: 2,  w: 7, h: 5, type: 'team',    npcX: 14, npcY: 4,  teamColor: '#22c55e', floorStyle: 'carpet' },
  { id: 'trend-lead',  entityId: 'trend-lead',  name: '정보팀',     emoji: '📡', description: '시장·기술·뉴스 트렌드 인텔리전스. 평일 07:30 글로벌 동향 분석 리포트를 생성하고 Discord #jarvis-ceo 채널로 전송합니다.',                                                            x: 20, y: 2,  w: 7, h: 5, type: 'team',    npcX: 23, npcY: 4,  teamColor: '#3b82f6', floorStyle: 'carpet' },
  { id: 'president',   entityId: 'president',    name: '오너 집무실', emoji: '🏛️', description: '이정우(대표) 개인 공간. 오늘 Preply 수업 일정·예정 수입·미해결 약속 트래킹. 자비스 AI 경영(CEO실)과 분리된 실인 전용 데이터 허브.',                                              x: 29, y: 2,  w: 7, h: 5, type: 'meeting', npcX: 32, npcY: 4,  teamColor: '#f59e0b', floorStyle: 'executive' },
  // Row 2 (y=10)
  { id: 'record-lead', entityId: 'record-lead', name: '기록팀',     emoji: '📁', description: '메모리·기록 관리 및 RAG 아카이빙. 매일 23:50 전사 대화 기록을 정리하고 12만 청크 규모의 RAG 벡터 DB를 최신 상태로 유지합니다.',                                                    x: 2,  y: 10, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 12, teamColor: '#92702a', floorStyle: 'carpet' },
  { id: 'audit-lead',  entityId: 'audit-lead',  name: '감사팀',     emoji: '🔒', description: '내부감사·KPI 평가·크론 성과 추적. 매일 23:00 전사 크론 성공률을 집계하고 연속 실패 크론을 감지하여 에스컬레이션합니다.',                                                            x: 11, y: 10, w: 7, h: 5, type: 'team',    npcX: 14, npcY: 12, teamColor: '#dc2626', floorStyle: 'carpet' },
  { id: 'academy-lead',entityId: 'academy-lead',name: '학습팀',     emoji: '📚', description: '기술 학습 지원·커리큘럼 큐레이션. 매일 20:00 이직 준비 면접 질문·기술 스터디 플랜을 생성하고 학습 진도를 관리합니다.',                                                             x: 20, y: 10, w: 7, h: 5, type: 'team',    npcX: 23, npcY: 12, teamColor: '#9333ea', floorStyle: 'carpet' },
  { id: 'brand-lead',  entityId: 'brand-lead',  name: '브랜드팀',   emoji: '🎨', description: '오픈소스 성장·기술 블로그·GitHub 활동 관리. 매주 화 08:00 브랜딩 전략 리포트를 생성하고 이슈·PR 제안으로 오픈소스 기여를 지원합니다.',                                             x: 29, y: 10, w: 7, h: 5, type: 'team',    npcX: 32, npcY: 12, teamColor: '#ea580c', floorStyle: 'carpet' },
  // Row 3 (y=18)
  { id: 'career-lead', entityId: 'career-lead', name: '커리어팀',   emoji: '💼', description: '이직 준비·채용공고 분석·커리어 전략 수립. 주간 단위로 타겟 기업 공고를 스캔하고 이력서·면접 전략을 맞춤 제안합니다.',                                                              x: 2,  y: 18, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 20, teamColor: '#0d9488', floorStyle: 'carpet' },
  { id: 'standup',     entityId: 'standup',      name: '스탠드업홀', emoji: '🎤', description: '매일 09:15 KST 전사 모닝 브리핑. 시스템 상태·오늘 예정 크론·주요 이슈를 자동 요약하여 Discord #jarvis-ceo 채널로 전송합니다.',                                                   x: 11, y: 18, w: 7, h: 5, type: 'meeting', npcX: 14, npcY: 20, teamColor: '#eab308', floorStyle: 'stage' },
  { id: 'secretary',   entityId: 'bot-system',   name: '비서실',     emoji: '🤵', description: '비서실장(자비스 Sonnet). 대표님 보좌·전사 소통 조율·일상 요청 처리. Discord #jarvis 메인 채널에서 24/7 대기합니다.',                                                              x: 20, y: 18, w: 7, h: 5, type: 'team',    npcX: 23, npcY: 20, teamColor: '#8b5cf6', floorStyle: 'carpet' },
  { id: 'server-room', entityId: 'cron-engine',  name: '서버룸',     emoji: '🖥️', description: 'Mac Mini 서버 인프라. 디스크·메모리·봇 프로세스 모니터링. 자비스 컴퍼니 90개+ 크론과 Discord 봇이 이 서버에서 실행됩니다.',                                                      x: 29, y: 18, w: 7, h: 5, type: 'server',  npcX: 32, npcY: 20, teamColor: '#475569', floorStyle: 'metal' },
  // Row 4 — Cron Center (y=25)
  { id: 'cron-center', entityId: '',             name: '크론 센터',  emoji: '⏰', description: '자비스 컴퍼니 자동화 허브. 90개+ 크론잡의 실시간 실행 상태를 모니터링합니다. 각 워크스테이션이 하나의 자동화 태스크를 나타냅니다.',                                               x: 1,  y: 25, w: 36, h: 8, type: 'cron',    npcX: 18, npcY: 28, teamColor: '#6366f1', floorStyle: 'metal' },
];

// agent-live teamId -> room id mapping
export const AGENT_TEAM_TO_ROOM: Record<string, string> = {
  'infra-lead': 'infra-lead',
  'trend-team': 'trend-lead',
  'audit-team': 'audit-lead',
  'record-team': 'record-lead',
  'brand-team': 'brand-lead',
  'growth-team': 'career-lead',
  'academy-team': 'academy-lead',
  'bot-system': 'server-room',
};

// Room descriptions lookup for fallback display
export const ROOM_DESC: Record<string, string> = {};
for (const r of ROOMS) { ROOM_DESC[r.id] = r.description; }

// 룸 ID → 크론팀 레이블 매핑
export const ROOM_TO_CRON_TEAM: Record<string, string> = {
  'infra-lead':   '인프라팀',
  'trend-lead':   '정보팀',
  'record-lead':  '기록팀',
  'audit-lead':   '감사팀',
  'academy-lead': '학습팀',
  'brand-lead':   '브랜드팀',
  'career-lead':  '커리어팀',
  'server-room':  '인프라팀',
  'ceo':          'CEO/임원실',
  'secretary':    'CEO/임원실',
};

// ── 크론센터 그리드 배치 상수 ──────────────────────────────────
export const CRON_COLS = 12;
export const CRON_ROWS = 3;
export const CRON_COL_SPACING = 2.75; // tiles
export const CRON_ROW_SPACING = 2.0;  // tiles
export const CRON_COL_START = 1.5;    // room-relative start x
export const CRON_ROW_START = 1.5;    // room-relative start y

export function getCronTilePos(cronRoom: RoomDef, i: number): { tx: number; ty: number } {
  const col = i % CRON_COLS;
  const row = Math.floor(i / CRON_COLS);
  return {
    tx: cronRoom.x + CRON_COL_START + col * CRON_COL_SPACING,
    ty: cronRoom.y + CRON_ROW_START + row * CRON_ROW_SPACING,
  };
}

// ── 벽 타일 맵 생성 ────────────────────────────────────────────
export function buildCollisionMap(): boolean[][] {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(false) as boolean[]);
  for (let x = 0; x < COLS; x++) { map[0][x] = true; map[ROWS - 1][x] = true; }
  for (let y = 0; y < ROWS; y++) { map[y][0] = true; map[y][COLS - 1] = true; }
  for (const r of ROOMS) {
    for (let x = r.x; x < r.x + r.w; x++) {
      map[r.y][x] = true;
      map[r.y + r.h - 1][x] = true;
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      map[y][r.x] = true;
      map[y][r.x + r.w - 1] = true;
    }
    const doorX = r.x + Math.floor(r.w / 2);
    // 크론센터는 위쪽 문, 나머지는 아래쪽 문
    if (r.type === 'cron') {
      map[r.y][doorX] = false;
      map[r.y][doorX - 1] = false;
      map[r.y][doorX + 1] = false;
    } else {
      map[r.y + r.h - 1][doorX] = false;
      map[r.y + r.h - 1][doorX - 1] = false;
    }
  }
  return map;
}

// ── A* 경로탐색 ────────────────────────────────────────────────
export function aStarPath(
  sx: number, sy: number, tx: number, ty: number,
  cMap: boolean[][]
): { x: number; y: number }[] {
  if (sx === tx && sy === ty) return [];
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS || cMap[ty][tx]) return [];

  type Node = { x: number; y: number; g: number; f: number; parent: Node | null };
  const key = (x: number, y: number) => y * COLS + x;
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);

  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const start: Node = { x: sx, y: sy, g: 0, f: h(sx, sy), parent: null };
  open.set(key(sx, sy), start);

  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  let best: Node | null = null;

  while (open.size > 0) {
    // 최소 f 노드 선택
    let cur: Node | null = null;
    for (const n of open.values()) {
      if (!cur || n.f < cur.f) cur = n;
    }
    if (!cur) break;
    open.delete(key(cur.x, cur.y));
    closed.add(key(cur.x, cur.y));

    if (cur.x === tx && cur.y === ty) { best = cur; break; }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (cMap[ny][nx]) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + 1;
      const existing = open.get(nk);
      if (!existing || ng < existing.g) {
        const node: Node = { x: nx, y: ny, g: ng, f: ng + h(nx, ny), parent: cur };
        open.set(nk, node);
      }
    }

    // 탐색 한계 (큰 맵에서 무한 루프 방지)
    if (closed.size > 2000) break;
  }

  if (!best) return [];
  const path: { x: number; y: number }[] = [];
  let node: Node | null = best;
  while (node) { path.unshift({ x: node.x, y: node.y }); node = node.parent; }
  path.shift(); // 출발점 제외
  return path;
}

// ── 브리핑 타입 ────────────────────────────────────────────────
export interface BriefingData {
  id: string;
  name: string;
  emoji?: string;
  avatar?: string;
  icon?: string;
  status: string;
  summary: string;
  schedule?: string;
  title?: string;
  description?: string;
  stats?: { total: number; success: number; failed: number; rate: number };
  metrics?: { cronSuccessRate?: number; totalToday?: number; failedToday?: number };
  recentActivity?: Array<{ time: string; task: string; result: string; message: string }>;
  recentEvents?: Array<{ time: string; task?: string; event?: string; result: string }>;
  lastBoardMinutes?: string | null;
  boardMinutes?: { date: string; content: string } | null;
  alerts?: string[];
  upcoming?: Array<{ task: string; taskKo: string; time: string }>;
  discordChannel?: string;
  roomDescription?: string;
}

// ── 크론 아이템 (api/crons) ───────────────────────────────────
export interface RecentRun {
  status: 'success' | 'failed' | 'skipped' | 'running' | 'unknown';
  timestamp: string;
  message: string;
}

export interface CronItem {
  id: string;
  name: string;
  description: string;
  schedule: string;
  scheduleHuman: string;
  status: 'success' | 'failed' | 'skipped' | 'running' | 'unknown';
  lastRun: string | null;
  lastResult: string;
  lastMessage: string;
  lastDuration: string;
  outputSummary: string;
  nextRun: string | null;
  team: string;
  teamEmoji: string;
  priority: string;
  hasLLM: boolean;
  hasScript: boolean;
  recentRuns: RecentRun[];
}

// ── NPC 상태 ───────────────────────────────────────────────────
export interface NpcState {
  status: 'green' | 'yellow' | 'red';
  task: string;
  activity: string;
}

// ── 유틸리티: 상태 텍스트 ─────────────────────────────────────
export function statusExplanation(briefing: BriefingData): string {
  if (briefing.status === 'GREEN') return '정상 운영 중';
  if (briefing.status === 'RED') {
    if (briefing.stats && briefing.stats.failed > 0) {
      const rate = typeof briefing.stats.rate === 'number' ? briefing.stats.rate : 0;
      return `실패 ${briefing.stats.failed}건 · 성공률 ${rate}%`;
    }
    if (briefing.alerts && briefing.alerts.length > 0) return briefing.alerts[0].slice(0, 55);
    if (briefing.recentActivity) {
      const fail = briefing.recentActivity.find(a => a.result === 'failed');
      if (fail) return `최근 실패: ${(fail.task || '').slice(0, 28)}`;
    }
    return '이상 감지됨 — 아래 분석 참조';
  }
  // YELLOW
  if (briefing.stats && briefing.stats.failed > 0) {
    return `${briefing.stats.failed}건 실패 발생 — 모니터링 중`;
  }
  return '일부 주의 필요';
}

export function activityIcon(result: string): string {
  const r = result.toLowerCase();
  if (r === 'success') return '\uD83D\uDFE2'; // green circle
  if (r === 'failed') return '\uD83D\uDD34';  // red circle
  return '\u26A0\uFE0F'; // warning
}
