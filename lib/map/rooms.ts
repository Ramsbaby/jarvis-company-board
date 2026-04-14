/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Shared room, collision, pathfinding, type definitions
   Extracted from app/company/VirtualOffice.tsx (pure logic, no React)
   ═══════════════════════════════════════════════════════════════════ */

export const T = 32; // tile size
export const COLS = 55;
export const ROWS = 32;
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
  floorStyle: 'executive' | 'carpet' | 'metal' | 'stage' | 'open';
  // 'closed' = 벽 있는 개별 공간 (대표실/회의실/서버룸 등). 'pod' = 오픈 오피스 내 데스크 파드 (벽 없음, 가구만)
  wallStyle?: 'closed' | 'pod';
}

// ═════════════════════════════════════════════════════════════════════════
// 실제 회사 레이아웃 — 게더타운 베스트 프랙티스 적용
// ─────────────────────────────────────────────────────────────────────────
// Closed room: 전부 7×5 (대표실/재무실/서버룸/회의실)
// Pod: 전부 5×4 (SRE/전략기획/데이터/QA/자료실/마케팅/인재개발/CS)
// 벽 색상 #21262d 단일 — teamColor는 바닥 러그로만 구분
// ═════════════════════════════════════════════════════════════════════════
export const ROOMS: RoomDef[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // 오피스 영역 (x:1~49) — 방 사이 2~3타일 간격, 여유 있는 레이아웃
  // ═══════════════════════════════════════════════════════════════════════

  // ── Row 1 (y=4~9): 임원실 2개 + 팀 Pod 4개 ────────────────────────────
  { id: 'president',   entityId: 'president',   name: '대표실',     emoji: '🏛️', description: '이정우(실 대표)의 공간. 자비스 AI 경영 데이터(이사회·KPI·경영 점검) + 오너 개인 데이터(Discord 약속·Claude 세션·메모리)를 하나로 통합.',   x: 2,  y: 4,  w: 7, h: 5, type: 'meeting', npcX: 5,  npcY: 6,  teamColor: '#c9a227', floorStyle: 'executive', wallStyle: 'closed' },
  { id: 'infra-lead',  entityId: 'infra-lead',  name: 'SRE실',       emoji: '🛡️', description: '신뢰성 엔지니어링 · 예방적 시스템 운영. 크론 성공률·디스크·MTTR·자가진단 4개 KPI 관리.',                                                             x: 11, y: 4,  w: 6, h: 5, type: 'team',    npcX: 14, npcY: 6,  teamColor: '#22c55e', floorStyle: 'open',      wallStyle: 'pod' },
  { id: 'trend-lead',  entityId: 'trend-lead',  name: '전략기획실',  emoji: '📡', description: '뉴스·기술 트렌드 인텔리전스. 평일 07:30 글로벌 동향 분석 리포트.',                                                               x: 19, y: 4,  w: 6, h: 5, type: 'team',    npcX: 22, npcY: 6,  teamColor: '#3b82f6', floorStyle: 'open',      wallStyle: 'pod' },
  { id: 'record-lead', entityId: 'record-lead', name: '데이터실',    emoji: '📁', description: '메모리·기록·RAG 아카이빙 백엔드. 12만 청크 관리.',                                                                               x: 27, y: 4,  w: 6, h: 5, type: 'team',    npcX: 30, npcY: 6,  teamColor: '#92702a', floorStyle: 'open',      wallStyle: 'pod' },
  { id: 'audit-lead',  entityId: 'audit-lead',  name: 'QA실',       emoji: '🔒', description: 'KPI 평가·E2E 테스트·크론 성과 추적. 매일 23:00 집계.',                                                                           x: 35, y: 4,  w: 6, h: 5, type: 'team',    npcX: 38, npcY: 6,  teamColor: '#dc2626', floorStyle: 'open',      wallStyle: 'pod' },
  { id: 'finance',     entityId: 'finance',     name: '재무실',     emoji: '💰', description: '자비스 AI 운영 비용 + TQQQ·시장 포지션 + 오너 개인 수입(Preply) 통합. 이번 주/월 얼마 벌고 얼마 썼는지 한 곳에서.',               x: 43, y: 4,  w: 7, h: 5, type: 'meeting', npcX: 46, npcY: 6,  teamColor: '#10b981', floorStyle: 'executive', wallStyle: 'closed' },

  // ── Row 2 (y=12~17): Pod 4개 + 회의실 + 서버룸 ─────────────────────────
  { id: 'library',     entityId: 'library',     name: '자료실',      emoji: '📖', description: '전사 지식 베이스 프론트엔드. 데이터실 RAG 인덱스(12만+ 청크) + 오너 메모리 검색·탐색 허브.',                               x: 2,  y: 12, w: 6, h: 5, type: 'team',    npcX: 5,  npcY: 14, teamColor: '#0ea5e9', floorStyle: 'open',  wallStyle: 'pod' },
  { id: 'brand-lead',  entityId: 'brand-lead',  name: '마케팅실',    emoji: '🎨', description: 'OSS·블로그·GitHub 활동 관리. 매주 화 08:00 브랜딩 리포트.',                                                                       x: 10, y: 12, w: 6, h: 5, type: 'team',    npcX: 13, npcY: 14, teamColor: '#ea580c', floorStyle: 'open',  wallStyle: 'pod' },
  { id: 'standup',     entityId: 'standup',     name: '회의실',     emoji: '🎤', description: '매일 09:15 KST 전사 모닝 브리핑 + 임시 미팅. 시스템 상태·오늘 예정 크론·주요 이슈를 자동 요약해 Discord로 전송.',               x: 18, y: 12, w: 8, h: 5, type: 'meeting', npcX: 22, npcY: 14, teamColor: '#eab308', floorStyle: 'stage', wallStyle: 'closed' },
  { id: 'growth-lead', entityId: 'growth-lead', name: '인재개발실',  emoji: '🌱', description: '커리어 + 학습 통합. 기술 학습 + 이직 준비.',                                                                                   x: 28, y: 12, w: 6, h: 5, type: 'team',    npcX: 31, npcY: 14, teamColor: '#14b8a6', floorStyle: 'open',  wallStyle: 'pod' },
  { id: 'secretary',   entityId: 'secretary',   name: '컨시어지',    emoji: '🤵', description: '자비스 디지털 컨시어지(Sonnet 기반 Discord 봇). /ask·/logs·/brief 등 슬래시 명령 대응, 사용자 질문 로깅, 봇 품질 자가 점검. 봇이 멈추면 CS 자체가 멈춘다.',                                                       x: 36, y: 12, w: 6, h: 5, type: 'team',    npcX: 39, npcY: 14, teamColor: '#8b5cf6', floorStyle: 'open',  wallStyle: 'pod' },
  { id: 'server-room', entityId: 'cron-engine', name: '서버룸',     emoji: '🖥️', description: 'Mac Mini 서버 인프라. 디스크·메모리·봇 프로세스 모니터링.',                                                                       x: 44, y: 12, w: 6, h: 5, type: 'server',  npcX: 47, npcY: 14, teamColor: '#475569', floorStyle: 'metal', wallStyle: 'closed' },

  // ═══════════════════════════════════════════════════════════════════════
  // 크론 센터 (하단) — 오피스 아래 대형 관제실
  // ═══════════════════════════════════════════════════════════════════════
  { id: 'cron-center', entityId: '',             name: '크론 센터',  emoji: '⏰', description: '자비스 컴퍼니 자동화 허브. 79개 크론잡의 실시간 실행 상태를 모니터링합니다. 각 워크스테이션이 하나의 자동화 태스크를 나타냅니다.', x: 2,  y: 20, w: 51, h: 11, type: 'cron',   npcX: 27, npcY: 25, teamColor: '#6366f1', floorStyle: 'metal' },
];

// agent-live teamId -> room id mapping
export const AGENT_TEAM_TO_ROOM: Record<string, string> = {
  'infra-lead': 'infra-lead',
  'trend-team': 'trend-lead',
  'audit-team': 'audit-lead',
  'record-team': 'record-lead',
  'brand-team': 'brand-lead',
  'growth-team': 'growth-lead',
  'academy-team': 'growth-lead',   // 학습팀 합쳐짐 → 성장실
  'career-team':  'growth-lead',   // 커리어팀 합쳐짐 → 성장실
  'finance-team': 'finance',
  'library-team': 'library',
  'bot-system':   'server-room',
};

// Room descriptions lookup for fallback display
export const ROOM_DESC: Record<string, string> = {};
for (const r of ROOMS) { ROOM_DESC[r.id] = r.description; }

// 룸 ID → 크론팀 레이블 매핑
export const ROOM_TO_CRON_TEAM: Record<string, string> = {
  'finance':      '재무실',
  'infra-lead':   'SRE실',
  'trend-lead':   '전략기획실',
  'president':    '대표실',
  'record-lead':  '데이터실',
  'audit-lead':   'QA실',
  'library':      '자료실',
  'brand-lead':   '마케팅실',
  'growth-lead':  '인재개발실',
  'server-room':  'SRE실',
  'secretary':    '컨시어지',
};

// ── 크론센터 그리드 배치 상수 ──────────────────────────────────
export const CRON_COLS = 10;
export const CRON_ROWS = 8;
export const CRON_COL_SPACING = 4.8;  // tiles (51칸 너비에서 이름 겹침 방지)
export const CRON_ROW_SPACING = 1.15; // tiles
export const CRON_COL_START = 2.5;    // room-relative start x
export const CRON_ROW_START = 1.0;    // room-relative start y

export function getCronTilePos(cronRoom: RoomDef, i: number): { tx: number; ty: number } {
  const col = i % CRON_COLS;
  const row = Math.floor(i / CRON_COLS);
  return {
    tx: cronRoom.x + CRON_COL_START + col * CRON_COL_SPACING,
    ty: cronRoom.y + CRON_ROW_START + row * CRON_ROW_SPACING,
  };
}

// ── 벽 타일 맵 생성 ────────────────────────────────────────────
// ── 오피스↔크론센터 사이 복도 영역 (상하 구조) ─────────────────
export const CORRIDOR_BRIDGE = { x: 1, y: 18, w: 53, h: 2 };

export function buildCollisionMap(): boolean[][] {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(false) as boolean[]);
  // 외벽
  for (let x = 0; x < COLS; x++) { map[0][x] = true; map[ROWS - 1][x] = true; }
  for (let y = 0; y < ROWS; y++) { map[y][0] = true; map[y][COLS - 1] = true; }

  // 각 방 벽 + 문
  for (const r of ROOMS) {
    if (r.wallStyle === 'pod') continue;
    for (let x = r.x; x < r.x + r.w; x++) {
      map[r.y][x] = true;
      map[r.y + r.h - 1][x] = true;
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      map[y][r.x] = true;
      map[y][r.x + r.w - 1] = true;
    }
    const doorX = r.x + Math.floor(r.w / 2);
    if (r.type === 'cron') {
      // 크론센터: 상단 문 (복도 쪽)
      map[r.y][doorX] = false;
      map[r.y][doorX - 1] = false;
      map[r.y][doorX + 1] = false;
    } else {
      // 일반 방: 하단 문
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
    if (closed.size > 4000) break;
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
  kpi?: Array<{ label: string; value: number; target: number; unit: string; icon: string; direction: 'higher' | 'lower' }>;
  /**
   * 구조화 시스템 리소스 메트릭 — 팀 브리핑 팝업의 "리소스 현황" 섹션이 소비.
   * 이전엔 summary 텍스트에서 regex 로 파싱했는데 메모리/CPU 수치가 텍스트에
   * 들어가지 않아 드릴다운이 디스크 한 종류만 떴다. 이제 briefing API 가
   * 구조화 형태로 반환한다 (lib/map/system-metrics.ts 가 생성).
   */
  systemMetrics?: Array<{ label: string; value: number; icon: string; type: 'disk' | 'memory' | 'cpu' }>;
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
