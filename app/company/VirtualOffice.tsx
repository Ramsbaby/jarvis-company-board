'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Gather Town Style Virtual Office
   Pure Canvas 2D, no external game engine
   Major UX rewrite: unique room visuals, descriptions, mobile support
   ═══════════════════════════════════════════════════════════════════ */

const T = 32; // tile size
const COLS = 40;
const ROWS = 34;
const MOVE_SPEED = 130; // ms per tile

// ── 방 정의 ────────────────────────────────────────────────────
interface RoomDef {
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

const ROOMS: RoomDef[] = [
  // Row 1 (y=2)
  { id: 'ceo',         entityId: 'ceo',         name: 'CEO실',      emoji: '👔', description: '전체 시스템 운영 총괄 · 이사회 주재',           x: 2,  y: 2,  w: 7, h: 5, type: 'meeting', npcX: 5,  npcY: 4,  teamColor: '#c9a227', floorStyle: 'executive' },
  { id: 'infra-lead',  entityId: 'infra-lead',  name: '인프라팀',   emoji: '🖥️', description: '서버·봇·크론·디스크 관리',                     x: 11, y: 2,  w: 7, h: 5, type: 'team',    npcX: 14, npcY: 4,  teamColor: '#22c55e', floorStyle: 'carpet' },
  { id: 'trend-lead',  entityId: 'trend-lead',  name: '정보팀',     emoji: '📡', description: '뉴스·시장·기술 트렌드 분석',                   x: 20, y: 2,  w: 7, h: 5, type: 'team',    npcX: 23, npcY: 4,  teamColor: '#3b82f6', floorStyle: 'carpet' },
  { id: 'finance',     entityId: '',             name: '재무팀',     emoji: '📊', description: '재무 분석 · 예산 관리 · 투자 포트폴리오',      x: 29, y: 2,  w: 7, h: 5, type: 'team',    npcX: 32, npcY: 4,  teamColor: '#166534', floorStyle: 'carpet' },
  // Row 2 (y=10)
  { id: 'record-lead', entityId: 'record-lead', name: '기록팀',     emoji: '📁', description: '일일 기록 정리 · RAG 아카이빙',               x: 2,  y: 10, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 12, teamColor: '#92702a', floorStyle: 'carpet' },
  { id: 'audit-lead',  entityId: 'audit-lead',  name: '감사팀',     emoji: '🔒', description: '품질 감사 · E2E 테스트 · 크론 실패 추적',     x: 11, y: 10, w: 7, h: 5, type: 'team',    npcX: 14, npcY: 12, teamColor: '#dc2626', floorStyle: 'carpet' },
  { id: 'academy-lead',entityId: 'academy-lead',name: '학습팀',     emoji: '📚', description: '학습 큐레이션 · 스터디 계획',                 x: 20, y: 10, w: 7, h: 5, type: 'team',    npcX: 23, npcY: 12, teamColor: '#9333ea', floorStyle: 'carpet' },
  { id: 'brand-lead',  entityId: 'brand-lead',  name: '브랜드팀',   emoji: '🎨', description: 'OSS 전략 · 블로그 · GitHub 성장',             x: 29, y: 10, w: 7, h: 5, type: 'team',    npcX: 32, npcY: 12, teamColor: '#ea580c', floorStyle: 'carpet' },
  // Row 3 (y=18)
  { id: 'career-lead', entityId: 'career-lead', name: '커리어팀',   emoji: '💼', description: '채용 분석 · 면접 준비 · 커리어 전략',        x: 2,  y: 18, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 20, teamColor: '#0d9488', floorStyle: 'carpet' },
  { id: 'standup',     entityId: '',             name: '스탠드업홀', emoji: '🎤', description: '매일 09:15 모닝 브리핑',                     x: 11, y: 18, w: 7, h: 5, type: 'meeting', npcX: 14, npcY: 20, teamColor: '#eab308', floorStyle: 'stage' },
  { id: 'ceo-digest',  entityId: '',             name: '회의실',     emoji: '🗂️', description: '이사회 · CEO 일일 요약',                     x: 20, y: 18, w: 7, h: 5, type: 'meeting', npcX: 23, npcY: 20, teamColor: '#64748b', floorStyle: 'carpet' },
  { id: 'server-room', entityId: 'cron-engine',  name: '서버룸',     emoji: '🖥️', description: 'Mac Mini 서버 · 디스크/메모리/봇 모니터링',    x: 29, y: 18, w: 7, h: 5, type: 'server',  npcX: 32, npcY: 20, teamColor: '#475569', floorStyle: 'metal' },
  // Row 4 — Cron Center (y=25)
  { id: 'cron-center', entityId: '',             name: '크론 센터',   emoji: '⏰', description: '전사 크론잡 실시간 모니터링',                  x: 1,  y: 25, w: 36, h: 8, type: 'cron',    npcX: 18, npcY: 28, teamColor: '#6366f1', floorStyle: 'metal' },
];

// agent-live teamId -> room id mapping
const AGENT_TEAM_TO_ROOM: Record<string, string> = {
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
const ROOM_DESC: Record<string, string> = {};
for (const r of ROOMS) { ROOM_DESC[r.id] = r.description; }

// ── 벽 타일 맵 생성 ────────────────────────────────────────────
function buildCollisionMap(): boolean[][] {
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

// ── 브리핑 타입 ────────────────────────────────────────────────
interface BriefingData {
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
  recentActivity?: Array<{ time: string; task: string; result: string; message: string }>;
  recentEvents?: Array<{ time: string; task?: string; event?: string; result: string }>;
  lastBoardMinutes?: string | null;
  boardMinutes?: { date: string; content: string } | null;
  alerts?: string[];
  discordChannel?: string;
  roomDescription?: string;
}

// ── NPC 상태 ───────────────────────────────────────────────────
interface NpcState {
  status: 'green' | 'yellow' | 'red';
  task: string;
  activity: string;
}

// ── 유틸리티: 상태 텍스트 ─────────────────────────────────────
function statusExplanation(briefing: BriefingData): string {
  if (briefing.status === 'GREEN') return '정상 운영 중';
  if (briefing.status === 'RED') {
    if (briefing.stats && briefing.stats.failed > 0) {
      return `최근 ${briefing.stats.failed}건 실패`;
    }
    if (briefing.alerts && briefing.alerts.length > 0) {
      return briefing.alerts[0];
    }
    return '이상 감지됨';
  }
  // YELLOW
  if (briefing.stats && briefing.stats.failed > 0) {
    return `${briefing.stats.failed}건 실패 발생 — 모니터링 중`;
  }
  return '일부 주의 필요';
}

function activityIcon(result: string): string {
  const r = result.toLowerCase();
  if (r === 'success') return '\uD83D\uDFE2'; // green circle
  if (r === 'failed') return '\uD83D\uDD34';  // red circle
  return '\u26A0\uFE0F'; // warning
}

// ═══════════════════════════════════════════════════════════════
// React 컴포넌트
// ═══════════════════════════════════════════════════════════════
export default function VirtualOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupLoading, setPopupLoading] = useState(false);
  const [nearbyRoom, setNearbyRoom] = useState<RoomDef | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatResp, setChatResp] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipRoom, setTooltipRoom] = useState<{ room: RoomDef; x: number; y: number } | null>(null);
  const [showMobileHelp, setShowMobileHelp] = useState(false);
  const [cronData, setCronData] = useState<Array<{ name: string; korName: string; status: string; lastRun: string; result: string; nextSchedule: string }>>([]);
  const [cronPopup, setCronPopup] = useState<{ name: string; korName: string; status: string; lastRun: string; result: string; nextSchedule: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 게임 상태 refs
  const playerRef = useRef({ x: 20, y: 8 });
  const movingRef = useRef(false);
  const animRef = useRef({ frame: 0, dir: 0, walking: false });
  const tweenRef = useRef({ sx: 0, sy: 0, tx: 0, ty: 0, t: 0, active: false });
  const npcStatesRef = useRef<Record<string, NpcState>>({});
  const keysRef = useRef<Set<string>>(new Set());
  const collisionMap = useRef(buildCollisionMap());
  const popupOpenRef = useRef(false);
  const cameraRef = useRef({ x: 0, y: 0 });
  const frameCountRef = useRef(0);

  useEffect(() => { popupOpenRef.current = popupOpen; }, [popupOpen]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── 팝업 닫기 ──────────────────────────────────────────────
  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setBriefing(null);
    setPopupLoading(false);
    setChatResp('');
    setChatInput('');
  }, []);

  // ── 데이터 로드 ──────────────────────────────────────────────
  const loadStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-live');
      if (!res.ok) return;
      const data = await res.json();
      const states: Record<string, NpcState> = {};

      for (const team of data.teams || []) {
        const roomId = AGENT_TEAM_TO_ROOM[team.teamId];
        if (!roomId) continue;
        const st = team.status === 'failed' ? 'red' : team.status === 'success' ? 'green' : 'yellow';
        states[roomId] = { status: st, task: team.lastTask || '', activity: team.lastMessage || '' };
      }

      // server-room: check via disk-storage + discord-bot
      try {
        const [diskRes, botRes] = await Promise.all([
          fetch('/api/entity/disk-storage/briefing').catch(() => null),
          fetch('/api/entity/discord-bot/briefing').catch(() => null),
        ]);
        const diskOk = diskRes?.ok ? ((await diskRes.json()) as BriefingData).status : null;
        const botOk = botRes?.ok ? ((await botRes.json()) as BriefingData).status : null;
        const worstSt = (diskOk === 'RED' || botOk === 'RED') ? 'red'
          : (diskOk === 'YELLOW' || botOk === 'YELLOW') ? 'yellow' : 'green';
        states['server-room'] = {
          status: worstSt, task: 'mac-mini', activity: 'Mac Mini 서버 모니터링',
        };
      } catch { /* skip */ }

      npcStatesRef.current = states;

      // Extract cron data for cron-center
      const crons: typeof cronData = [];
      for (const team of data.teams || []) {
        for (const cron of team.recentCrons || []) {
          crons.push({
            name: cron.task || team.teamId,
            korName: cron.task || team.label || team.teamId,
            status: cron.result === 'success' ? 'green' : cron.result === 'failed' ? 'red' : 'yellow',
            lastRun: cron.time || '',
            result: cron.result || '',
            nextSchedule: team.schedule || '',
          });
        }
      }
      setCronData(crons.slice(0, 20));
    } catch { /* retry next interval */ }
  }, []);

  const openBriefing = useCallback(async (room: RoomDef) => {
    // Cron center: show cron tiles popup, not a standard briefing
    if (room.id === 'cron-center') {
      // If we have cron data and user clicks a specific tile, cronPopup handles that.
      // For room-level click, just show the briefing with cron summary.
      setPopupOpen(true);
      setPopupLoading(false);
      setBriefing({
        id: room.id, name: room.name, emoji: room.emoji,
        status: cronData.some(c => c.status === 'red') ? 'RED' : cronData.some(c => c.status === 'yellow') ? 'YELLOW' : 'GREEN',
        summary: `${cronData.length}개 크론잡 모니터링 중`,
        roomDescription: room.description,
        recentActivity: cronData.map(c => ({
          time: c.lastRun, task: c.korName, result: c.result, message: '',
        })),
      });
      setChatResp('');
      return;
    }

    setPopupOpen(true);
    setPopupLoading(true);
    setBriefing(null);
    setChatResp('');

    const entityId = room.entityId;

    // Server room: fetch Mac Mini metrics instead of cron-engine
    if (room.id === 'server-room') {
      try {
        const [diskRes, botRes] = await Promise.all([
          fetch('/api/entity/disk-storage/briefing').catch(() => null),
          fetch('/api/entity/discord-bot/briefing').catch(() => null),
        ]);
        const diskData = diskRes?.ok ? await diskRes.json() as BriefingData : null;
        const botData = botRes?.ok ? await botRes.json() as BriefingData : null;

        const worstStatus = (diskData?.status === 'RED' || botData?.status === 'RED') ? 'RED'
          : (diskData?.status === 'YELLOW' || botData?.status === 'YELLOW') ? 'YELLOW' : 'GREEN';

        const summaryParts: string[] = [];
        if (diskData?.summary) summaryParts.push(diskData.summary);
        if (botData?.summary) summaryParts.push(botData.summary);

        setBriefing({
          id: room.id, name: room.name, emoji: room.emoji,
          status: worstStatus,
          summary: summaryParts.join(' / ') || room.description,
          roomDescription: room.description,
          stats: diskData?.stats || botData?.stats,
          recentActivity: diskData?.recentActivity || botData?.recentActivity,
          alerts: [...(diskData?.alerts || []), ...(botData?.alerts || [])],
        });
        setPopupLoading(false);
        return;
      } catch { /* fall through */ }
    }

    // If there's an entity ID, try the entity briefing API first
    if (entityId) {
      try {
        const res = await fetch(`/api/entity/${entityId}/briefing`);
        if (res.ok) {
          const data = await res.json() as BriefingData;
          if (!data.emoji && !data.avatar && !data.icon) {
            data.emoji = room.emoji;
          }
          data.roomDescription = room.description;
          setBriefing(data);
          setPopupLoading(false);
          return;
        }
      } catch { /* fall through to agent-live */ }
    }

    // Fallback: use agent-live data
    try {
      const res2 = await fetch('/api/agent-live');
      if (!res2.ok) {
        // Even if API fails, show room info — never show empty error
        setBriefing({
          id: room.id, name: room.name, emoji: room.emoji,
          status: 'YELLOW',
          summary: room.description,
          roomDescription: room.description,
          schedule: room.id === 'standup' ? '매일 09:15 KST' : undefined,
        });
        setPopupLoading(false);
        return;
      }
      const data = await res2.json();

      // Find matching team by reverse-mapping room id
      const agentTeamId = Object.entries(AGENT_TEAM_TO_ROOM).find(([, rid]) => rid === room.id)?.[0];
      const team = agentTeamId
        ? (data.teams || []).find((t: { teamId: string }) => t.teamId === agentTeamId)
        : null;

      if (team) {
        const total = (team.successCount24h || 0) + (team.failCount24h || 0);
        setBriefing({
          id: room.id,
          name: team.label || room.name,
          emoji: room.emoji,
          status: team.status === 'success' ? 'GREEN' : team.status === 'failed' ? 'RED' : 'YELLOW',
          summary: `최근: ${team.lastTask || 'idle'} — ${team.lastMessage || '대기 중'}`,
          schedule: team.schedule,
          roomDescription: room.description,
          stats: {
            total,
            success: team.successCount24h || 0,
            failed: team.failCount24h || 0,
            rate: total > 0 ? Math.round((team.successCount24h || 0) / total * 100) : 0,
          },
          recentActivity: team.recentCrons || [],
        });
      } else {
        // No matching team — show room description instead of error
        setBriefing({
          id: room.id,
          name: room.name,
          emoji: room.emoji,
          status: 'YELLOW',
          summary: room.description,
          roomDescription: room.description,
          schedule: room.id === 'standup' ? '매일 09:15 KST' : room.id === 'ceo-digest' ? '이사회 정기 소집' : undefined,
        });
      }
    } catch {
      // Even on total failure, show room info
      setBriefing({
        id: room.id,
        name: room.name,
        emoji: room.emoji,
        status: 'YELLOW',
        summary: `${room.description} (API 연결 대기 중)`,
        roomDescription: room.description,
      });
    }

    setPopupLoading(false);
  }, [cronData]);

  // ── 게임 루프 (Canvas) ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastMove = 0;
    const cMap = collisionMap.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') closePopup();
        return;
      }
      keysRef.current.add(e.key);
      if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && !popupOpenRef.current) {
        const nr = findNearbyRoom();
        if (nr) openBriefing(nr);
      }
      if (e.key === 'Escape') closePopup();
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer/touch: tap on NPC or anywhere inside room
    const onPointerDown = (e: PointerEvent) => {
      if (popupOpenRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      // First check NPC proximity (desktop/precise click)
      for (const r of ROOMS) {
        const nx = r.npcX * T - camX + T / 2;
        const ny = r.npcY * T - camY + T / 2;
        const dist = Math.sqrt((clickX - nx) ** 2 + (clickY - ny) ** 2);
        if (dist < 28) {
          openBriefing(r);
          return;
        }
      }

      // Then check if tap is inside any room area (mobile-friendly)
      for (const r of ROOMS) {
        const rx = r.x * T - camX;
        const ry = r.y * T - camY;
        const rw = r.w * T;
        const rh = r.h * T;
        if (clickX >= rx && clickX <= rx + rw && clickY >= ry && clickY <= ry + rh) {
          openBriefing(r);
          return;
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    // Hover tooltip for rooms
    const onPointerMove = (e: PointerEvent) => {
      if (popupOpenRef.current) { setTooltipRoom(null); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      for (const r of ROOMS) {
        const rx = r.x * T - camX;
        const ry = r.y * T - camY;
        const rw = r.w * T;
        const rh = r.h * T;
        if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
          setTooltipRoom({ room: r, x: e.clientX, y: e.clientY });
          return;
        }
      }
      setTooltipRoom(null);
    };
    canvas.addEventListener('pointermove', onPointerMove);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    function findNearbyRoom(): RoomDef | null {
      const p = playerRef.current;
      for (const r of ROOMS) {
        const dist = Math.abs(p.x - r.npcX) + Math.abs(p.y - r.npcY);
        if (dist <= 2) return r;
      }
      return null;
    }

    // ── Helper: draw a small pixel-art chair ──
    function drawChair(cx: number, cy: number, color: string) {
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = color + '80';
      ctx!.fillRect(cx - 5, cy - 9, 10, 6);
    }

    // ── Helper: draw a small monitor ──
    function drawMonitor(mx: number, my: number, screenW: number, screenH: number, screenColor: string, standColor: string) {
      ctx!.fillStyle = '#1a1a2e';
      ctx!.fillRect(mx, my, screenW, screenH);
      ctx!.fillStyle = screenColor;
      ctx!.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);
      ctx!.fillStyle = standColor;
      ctx!.fillRect(mx + screenW / 2 - 2, my + screenH, 4, 5);
      ctx!.fillRect(mx + screenW / 2 - 5, my + screenH + 4, 10, 3);
    }

    // ── Helper: draw a potted plant ──
    function drawPlantSmall(px: number, py: number) {
      ctx!.fillStyle = '#92400e';
      ctx!.fillRect(px - 4, py, 8, 7);
      ctx!.fillStyle = '#78350f';
      ctx!.fillRect(px - 5, py - 1, 10, 3);
      ctx!.fillStyle = '#16a34a';
      ctx!.beginPath();
      ctx!.arc(px, py - 5, 5, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = '#22c55e90';
      ctx!.beginPath();
      ctx!.arc(px - 3, py - 8, 3, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.arc(px + 3, py - 7, 4, 0, Math.PI * 2);
      ctx!.fill();
    }

    // ── 룸별 가구 드로잉 ──────────────────────────────────────
    function drawRoomFurniture(r: RoomDef, rx: number, ry: number, _rw: number, _rh: number) {
      const fc = frameCountRef.current;
      switch (r.id) {
        case 'ceo': {
          // Rug (dark red carpet)
          ctx!.fillStyle = '#5a1a1a18';
          ctx!.beginPath();
          ctx!.roundRect(rx + T * 1.2, ry + T * 1.8, T * 4.5, T * 2.2, 6);
          ctx!.fill();
          ctx!.strokeStyle = '#c9a22720';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.roundRect(rx + T * 1.3, ry + T * 1.9, T * 4.3, T * 2, 4);
          ctx!.stroke();
          // Executive desk (large, dark wood)
          ctx!.fillStyle = '#5a3e1b';
          ctx!.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, T * 0.7);
          ctx!.fillStyle = '#4a2e10';
          ctx!.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, 3);
          ctx!.fillRect(rx + T * 1.6, ry + T * 1.9, 4, 10);
          ctx!.fillRect(rx + T * 4.8, ry + T * 1.9, 4, 10);
          // Large monitor with golden tint
          drawMonitor(rx + T * 2.2, ry + T * 0.4, T * 1.8, T * 0.9, '#c9a22718', '#333');
          // Screen content: dashboard
          ctx!.fillStyle = '#c9a22740';
          ctx!.fillRect(rx + T * 2.4, ry + T * 0.55, T * 0.6, T * 0.3);
          ctx!.fillRect(rx + T * 3.2, ry + T * 0.55, T * 0.6, T * 0.3);
          ctx!.fillStyle = '#c9a22720';
          ctx!.fillRect(rx + T * 2.4, ry + T * 0.9, T * 1.4, 4);
          // Nameplate on desk
          ctx!.fillStyle = '#c9a22760';
          ctx!.fillRect(rx + T * 2.5, ry + T * 1.25, T * 1.5, 6);
          ctx!.fillStyle = '#fff';
          ctx!.font = '6px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText('CEO', rx + T * 3.25, ry + T * 1.25 + 5);
          // Leather chair (behind desk)
          ctx!.fillStyle = '#5a3322';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3.2, ry + T * 2.5, 8, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = '#4a2812';
          ctx!.fillRect(rx + T * 3.2 - 7, ry + T * 2.5 - 12, 14, 8);
          // Bookshelf on right wall
          ctx!.fillStyle = '#3d2a0f';
          ctx!.fillRect(rx + T * 5.5, ry + T * 0.5, T * 1, T * 2.5);
          for (let j = 0; j < 3; j++) {
            ctx!.fillStyle = '#4d3a1f';
            ctx!.fillRect(rx + T * 5.5, ry + T * 0.7 + j * T * 0.8, T * 1, 2);
            const bkColors = ['#8b4513', '#a0522d', '#d2691e'];
            for (let k = 0; k < 2; k++) {
              ctx!.fillStyle = bkColors[k % 3];
              ctx!.fillRect(rx + T * 5.65 + k * 12, ry + T * 0.8 + j * T * 0.8, 8, T * 0.55);
            }
          }
          // Plant in corner
          drawPlantSmall(rx + T * 0.8, ry + T * 3.5);
          // Picture frame on wall
          ctx!.strokeStyle = '#c9a22750';
          ctx!.lineWidth = 2;
          ctx!.strokeRect(rx + T * 5.3, ry + T * 3.2, 18, 14);
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx + T * 5.3 + 2, ry + T * 3.2 + 2, 14, 10);
          ctx!.fillStyle = '#22c55e20';
          ctx!.fillRect(rx + T * 5.3 + 4, ry + T * 3.2 + 6, 10, 5);
          break;
        }
        case 'infra-lead': {
          // L-shaped desk
          ctx!.fillStyle = '#374151';
          ctx!.fillRect(rx + T * 0.8, ry + T * 1.4, T * 4.5, T * 0.4);
          ctx!.fillRect(rx + T * 0.8, ry + T * 1.4, T * 0.4, T * 1.5);
          // 3 monitors on desk
          for (let i = 0; i < 3; i++) {
            const mmx = rx + T * 1.0 + i * T * 1.4;
            drawMonitor(mmx, ry + T * 0.5, T * 1.1, T * 0.8, '#22c55e15', '#333');
            // Terminal lines
            for (let j = 0; j < 4; j++) {
              ctx!.fillStyle = '#22c55e50';
              ctx!.fillRect(mmx + 5, ry + T * 0.65 + j * 5, T * 0.5 + ((j * 7 + i * 3) % 12), 2);
            }
          }
          // Chair
          drawChair(rx + T * 2.8, ry + T * 2.5, '#1f2937');
          // Server rack miniature (right wall)
          ctx!.fillStyle = '#1e293b';
          ctx!.fillRect(rx + T * 5.5, ry + T * 0.6, T * 0.9, T * 2.5);
          ctx!.strokeStyle = '#334155';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 5.5, ry + T * 0.6, T * 0.9, T * 2.5);
          for (let j = 0; j < 6; j++) {
            ctx!.fillStyle = j % 2 === 0 ? '#22c55e' : '#3b82f6';
            ctx!.beginPath();
            ctx!.arc(rx + T * 5.7, ry + T * 0.9 + j * 12, 2, 0, Math.PI * 2);
            ctx!.fill();
          }
          // Whiteboard with diagrams
          ctx!.fillStyle = '#f8fafc15';
          ctx!.fillRect(rx + T * 5.2, ry + T * 3.2, T * 1.3, T * 0.9);
          ctx!.strokeStyle = '#22c55e40';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 5.2, ry + T * 3.2, T * 1.3, T * 0.9);
          // Diagram lines
          ctx!.strokeStyle = '#22c55e30';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 5.4, ry + T * 3.5);
          ctx!.lineTo(rx + T * 5.9, ry + T * 3.4);
          ctx!.lineTo(rx + T * 6.2, ry + T * 3.7);
          ctx!.stroke();
          // Cable management under desk
          ctx!.strokeStyle = '#22c55e15';
          ctx!.lineWidth = 1;
          for (let c = 0; c < 3; c++) {
            ctx!.beginPath();
            ctx!.moveTo(rx + T * 1.5 + c * T * 1.2, ry + T * 1.8);
            ctx!.bezierCurveTo(rx + T * 2 + c * T * 0.5, ry + T * 2.2, rx + T * 0.8, ry + T * 2.5, rx + T * 0.8, ry + T * 2.8);
            ctx!.stroke();
          }
          break;
        }
        case 'trend-lead': {
          // Wall-mounted TV (news feeds)
          ctx!.fillStyle = '#1e3a5f';
          ctx!.fillRect(rx + T * 1, ry + T * 0.3, T * 5, T * 1.3);
          ctx!.fillStyle = '#3b82f618';
          ctx!.fillRect(rx + T * 1.1, ry + T * 0.4, T * 4.8, T * 1.1);
          // Chart bars
          const barH = [12, 18, 8, 22, 15, 20, 10, 16];
          for (let i = 0; i < barH.length; i++) {
            ctx!.fillStyle = '#3b82f660';
            ctx!.fillRect(rx + T * 1.3 + i * 17, ry + T * 1.3 - barH[i], 9, barH[i]);
          }
          // Ticker line with scrolling effect
          const tickerOffset = (fc * 0.5) % (T * 5);
          ctx!.fillStyle = '#60a5fa';
          ctx!.fillRect(rx + T * 1, ry + T * 1.6, T * 5, 3);
          ctx!.fillStyle = '#93c5fd';
          ctx!.font = '6px monospace';
          ctx!.textAlign = 'left';
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rx + T * 1, ry + T * 1.5, T * 5, 12);
          ctx!.clip();
          ctx!.fillText('BREAKING: TREND ANALYSIS DATA FEED — LIVE MONITORING', rx + T * 1 - tickerOffset, ry + T * 1.73);
          ctx!.fillText('BREAKING: TREND ANALYSIS DATA FEED — LIVE MONITORING', rx + T * 1 - tickerOffset + T * 8, ry + T * 1.73);
          ctx!.restore();
          // Multiple screens (2 smaller)
          for (let i = 0; i < 2; i++) {
            const sx = rx + T * 1.2 + i * T * 2.6;
            drawMonitor(sx, ry + T * 2, T * 1.4, T * 0.7, '#3b82f610', '#334155');
          }
          // Globe icon
          ctx!.strokeStyle = '#3b82f640';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(rx + T * 5.5, ry + T * 2.8, 10, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.beginPath();
          ctx!.ellipse(rx + T * 5.5, ry + T * 2.8, 5, 10, 0, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 5.5 - 10, ry + T * 2.8);
          ctx!.lineTo(rx + T * 5.5 + 10, ry + T * 2.8);
          ctx!.stroke();
          // Desk
          ctx!.fillStyle = '#334155';
          ctx!.fillRect(rx + T * 1, ry + T * 2.9, T * 4, T * 0.35);
          // Chair
          drawChair(rx + T * 3, ry + T * 3.5, '#1e293b');
          // Newspaper stack
          for (let i = 0; i < 3; i++) {
            ctx!.fillStyle = `rgba(200,200,200,${0.1 + i * 0.05})`;
            ctx!.fillRect(rx + T * 5.2, ry + T * 3.6 - i * 3, 16, 10);
          }
          break;
        }
        case 'finance': {
          // Stock chart on wall (larger)
          ctx!.fillStyle = '#0f2918';
          ctx!.fillRect(rx + T * 0.8, ry + T * 0.3, T * 5.5, T * 1.6);
          ctx!.strokeStyle = '#22c55e60';
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          const pts = [22, 16, 19, 11, 15, 9, 13, 7, 12, 10, 6, 8, 4];
          for (let i = 0; i < pts.length; i++) {
            const px = rx + T * 1 + i * 11;
            const py = ry + T * 0.5 + pts[i];
            if (i === 0) ctx!.moveTo(px, py);
            else ctx!.lineTo(px, py);
          }
          ctx!.stroke();
          // Candlesticks
          for (let i = 0; i < 8; i++) {
            const isUp = i % 3 !== 1;
            ctx!.fillStyle = isUp ? '#22c55e60' : '#ef444460';
            ctx!.fillRect(rx + T * 1.1 + i * 18, ry + T * 1.3 + (isUp ? 0 : 4), 7, isUp ? 10 : 7);
          }
          // Dual monitors with charts
          for (let i = 0; i < 2; i++) {
            drawMonitor(rx + T * 1.2 + i * T * 2.2, ry + T * 2, T * 1.6, T * 0.8, '#16653418', '#1c3324');
            // Mini chart on screen
            ctx!.strokeStyle = '#22c55e40';
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            for (let j = 0; j < 5; j++) {
              const smx = rx + T * 1.4 + i * T * 2.2 + j * 8;
              const smy = ry + T * 2.3 + ((j + i) % 3) * 4;
              if (j === 0) ctx!.moveTo(smx, smy);
              else ctx!.lineTo(smx, smy);
            }
            ctx!.stroke();
          }
          // Calculator
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx + T * 5, ry + T * 2.5, 14, 18);
          ctx!.fillStyle = '#22c55e30';
          ctx!.fillRect(rx + T * 5 + 2, ry + T * 2.5 + 2, 10, 5);
          for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
              ctx!.fillStyle = '#33333360';
              ctx!.fillRect(rx + T * 5 + 2 + bc * 4, ry + T * 2.5 + 9 + br * 3, 3, 2);
            }
          }
          // Filing cabinet
          ctx!.fillStyle = '#374151';
          ctx!.fillRect(rx + T * 5.5, ry + T * 1.2, T * 0.8, T * 1.8);
          for (let j = 0; j < 3; j++) {
            ctx!.fillStyle = '#4b5563';
            ctx!.fillRect(rx + T * 5.6, ry + T * 1.4 + j * 16, T * 0.6, 12);
            ctx!.fillStyle = '#9ca3af';
            ctx!.fillRect(rx + T * 5.85, ry + T * 1.4 + j * 16 + 4, 6, 3);
          }
          // Safe
          ctx!.fillStyle = '#374151';
          ctx!.fillRect(rx + T * 0.6, ry + T * 3, T * 0.8, T * 0.8);
          ctx!.strokeStyle = '#6b728080';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 0.6, ry + T * 3, T * 0.8, T * 0.8);
          ctx!.fillStyle = '#c9a227';
          ctx!.beginPath();
          ctx!.arc(rx + T * 1, ry + T * 3.4, 4, 0, Math.PI * 2);
          ctx!.fill();
          // Desk
          ctx!.fillStyle = '#1c3324';
          ctx!.fillRect(rx + T * 1, ry + T * 2.9, T * 4, T * 0.35);
          drawChair(rx + T * 3, ry + T * 3.5, '#14532d');
          break;
        }
        case 'record-lead': {
          // Tall bookshelves on left wall
          for (let shelf = 0; shelf < 2; shelf++) {
            const sx = rx + T * 0.5 + shelf * T * 1.5;
            ctx!.fillStyle = '#6b5514';
            ctx!.fillRect(sx, ry + T * 0.4, T * 1.2, T * 3.2);
            for (let j = 0; j < 4; j++) {
              ctx!.fillStyle = '#8b6914';
              ctx!.fillRect(sx, ry + T * 0.6 + j * T * 0.8, T * 1.2, 2);
              const colors = ['#a0522d', '#8b4513', '#d2691e', '#cd853f'];
              for (let k = 0; k < 3; k++) {
                ctx!.fillStyle = colors[(k + shelf) % 4];
                ctx!.fillRect(sx + 3 + k * 10, ry + T * 0.7 + j * T * 0.8, 7, T * 0.55);
              }
            }
          }
          // Tall bookshelves on right wall
          ctx!.fillStyle = '#6b5514';
          ctx!.fillRect(rx + T * 5.2, ry + T * 0.4, T * 1.2, T * 3.2);
          for (let j = 0; j < 4; j++) {
            ctx!.fillStyle = '#8b6914';
            ctx!.fillRect(rx + T * 5.2, ry + T * 0.6 + j * T * 0.8, T * 1.2, 2);
            const colors = ['#cd853f', '#a0522d', '#8b4513'];
            for (let k = 0; k < 3; k++) {
              ctx!.fillStyle = colors[k];
              ctx!.fillRect(rx + T * 5.35 + k * 10, ry + T * 0.7 + j * T * 0.8, 7, T * 0.55);
            }
          }
          // Filing cabinets (center-left)
          for (let i = 0; i < 2; i++) {
            const cx = rx + T * 3.5 + i * T * 0.9;
            ctx!.fillStyle = '#78601f';
            ctx!.fillRect(cx, ry + T * 0.5, T * 0.7, T * 2);
            for (let j = 0; j < 3; j++) {
              ctx!.fillStyle = '#92702a40';
              ctx!.fillRect(cx + 2, ry + T * 0.7 + j * 16, T * 0.7 - 4, 12);
              ctx!.fillStyle = '#c9a227';
              ctx!.fillRect(cx + T * 0.25, ry + T * 0.7 + j * 16 + 4, 5, 3);
            }
          }
          // Archive boxes stacked
          const boxColors = ['#8b7355', '#a08060', '#9b8b6b'];
          for (let i = 0; i < 3; i++) {
            ctx!.fillStyle = boxColors[i];
            ctx!.fillRect(rx + T * 3.6, ry + T * 2.8 + i * 8, 18, 7);
            ctx!.strokeStyle = '#00000020';
            ctx!.lineWidth = 0.5;
            ctx!.strokeRect(rx + T * 3.6, ry + T * 2.8 + i * 8, 18, 7);
          }
          // Desk with lamp
          ctx!.fillStyle = '#6b5514';
          ctx!.fillRect(rx + T * 2.5, ry + T * 2.5, T * 2, T * 0.35);
          // Desk lamp
          ctx!.fillStyle = '#fbbf24';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 4.2, ry + T * 2.2);
          ctx!.lineTo(rx + T * 4.35, ry + T * 1.8);
          ctx!.lineTo(rx + T * 4.5, ry + T * 2.2);
          ctx!.closePath();
          ctx!.fill();
          ctx!.fillStyle = '#92400e';
          ctx!.fillRect(rx + T * 4.33, ry + T * 2.2, 3, T * 0.3);
          // Light glow
          ctx!.fillStyle = '#fbbf2408';
          ctx!.beginPath();
          ctx!.arc(rx + T * 4.35, ry + T * 2.5, 20, 0, Math.PI * 2);
          ctx!.fill();
          drawChair(rx + T * 3.5, ry + T * 3.2, '#5a4a1a');
          break;
        }
        case 'audit-lead': {
          // Security monitors (3x grid) on wall
          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) {
              const smx = rx + T * 0.8 + col * T * 1.7;
              const smy = ry + T * 0.4 + row * T * 0.9;
              ctx!.fillStyle = '#1a1a2e';
              ctx!.fillRect(smx, smy, T * 1.4, T * 0.7);
              ctx!.fillStyle = '#dc262610';
              ctx!.fillRect(smx + 2, smy + 2, T * 1.4 - 4, T * 0.7 - 4);
              // Scan line animation
              const scanY = ((fc * 0.3 + col * 20 + row * 30) % (T * 0.7));
              ctx!.fillStyle = '#dc262608';
              ctx!.fillRect(smx + 2, smy + scanY, T * 1.4 - 4, 2);
              // Grid lines (security cam feel)
              ctx!.strokeStyle = '#dc262618';
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(smx + T * 0.7, smy);
              ctx!.lineTo(smx + T * 0.7, smy + T * 0.7);
              ctx!.moveTo(smx, smy + T * 0.35);
              ctx!.lineTo(smx + T * 1.4, smy + T * 0.35);
              ctx!.stroke();
            }
          }
          // Shield icon
          ctx!.fillStyle = '#dc262620';
          ctx!.beginPath();
          const shX = rx + T * 5.5, shY = ry + T * 1;
          ctx!.moveTo(shX, shY - 10);
          ctx!.lineTo(shX + 12, shY - 3);
          ctx!.lineTo(shX + 12, shY + 8);
          ctx!.lineTo(shX, shY + 14);
          ctx!.lineTo(shX - 12, shY + 8);
          ctx!.lineTo(shX - 12, shY - 3);
          ctx!.closePath();
          ctx!.fill();
          ctx!.strokeStyle = '#dc262660';
          ctx!.lineWidth = 1;
          ctx!.stroke();
          ctx!.strokeStyle = '#fca5a5';
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.moveTo(shX - 5, shY + 1);
          ctx!.lineTo(shX, shY + 6);
          ctx!.lineTo(shX + 7, shY - 3);
          ctx!.stroke();
          // Clipboard rack
          for (let i = 0; i < 3; i++) {
            ctx!.fillStyle = '#92702a80';
            ctx!.fillRect(rx + T * 5.8, ry + T * 2 + i * 14, 12, 10);
            ctx!.fillStyle = '#f5f5f420';
            ctx!.fillRect(rx + T * 5.8 + 1, ry + T * 2 + i * 14 + 2, 10, 6);
          }
          // Emergency light (blinking red)
          const emergBlink = Math.sin(fc * 0.1) > 0;
          ctx!.fillStyle = emergBlink ? '#f8514980' : '#f8514920';
          ctx!.beginPath();
          ctx!.arc(rx + T * 6, ry + T * 3.8, 4, 0, Math.PI * 2);
          ctx!.fill();
          // Desk
          ctx!.fillStyle = '#4a1414';
          ctx!.fillRect(rx + T * 1, ry + T * 2.5, T * 4, T * 0.35);
          drawChair(rx + T * 3, ry + T * 3.3, '#3b1111');
          break;
        }
        case 'academy-lead': {
          // Library shelves (tall, both walls)
          for (let side = 0; side < 2; side++) {
            const shX = side === 0 ? rx + T * 0.5 : rx + T * 5;
            ctx!.fillStyle = '#4c1d95';
            ctx!.fillRect(shX, ry + T * 0.4, T * 1.3, T * 3.2);
            for (let j = 0; j < 4; j++) {
              ctx!.fillStyle = '#6b21a8';
              ctx!.fillRect(shX, ry + T * 0.6 + j * T * 0.75, T * 1.3, 2);
              const colors = ['#a855f7', '#c084fc', '#7c3aed', '#d8b4fe', '#6366f1'];
              for (let k = 0; k < 3; k++) {
                ctx!.fillStyle = colors[(k + side + j) % 5] + '80';
                ctx!.fillRect(shX + 3 + k * 12, ry + T * 0.7 + j * T * 0.75, 9, T * 0.5);
              }
            }
          }
          // Blackboard on wall
          ctx!.fillStyle = '#1a3326';
          ctx!.fillRect(rx + T * 2, ry + T * 0.3, T * 2.8, T * 1.2);
          ctx!.strokeStyle = '#8b6914';
          ctx!.lineWidth = 2;
          ctx!.strokeRect(rx + T * 2, ry + T * 0.3, T * 2.8, T * 1.2);
          // Chalk writing
          ctx!.fillStyle = '#ffffff30';
          ctx!.font = '7px monospace';
          ctx!.textAlign = 'left';
          ctx!.fillText('E = mc²', rx + T * 2.2, ry + T * 0.7);
          ctx!.fillText('λ → 0', rx + T * 2.2, ry + T * 1);
          ctx!.fillRect(rx + T * 3.5, ry + T * 0.5, T * 0.8, 1);
          ctx!.fillRect(rx + T * 3.5, ry + T * 0.8, T * 0.6, 1);
          // Reading desk
          ctx!.fillStyle = '#581c87';
          ctx!.fillRect(rx + T * 2, ry + T * 1.8, T * 3, T * 0.4);
          // Open book on desk
          ctx!.fillStyle = '#f5f5f420';
          ctx!.fillRect(rx + T * 2.8, ry + T * 1.6, T * 0.6, T * 0.4);
          ctx!.fillRect(rx + T * 3.5, ry + T * 1.6, T * 0.6, T * 0.4);
          ctx!.fillStyle = '#9333ea20';
          for (let l = 0; l < 3; l++) {
            ctx!.fillRect(rx + T * 2.9, ry + T * 1.65 + l * 4, T * 0.4, 1);
            ctx!.fillRect(rx + T * 3.6, ry + T * 1.65 + l * 4, T * 0.4, 1);
          }
          // Study lamp
          ctx!.fillStyle = '#fbbf24';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 4.5, ry + T * 1.5);
          ctx!.lineTo(rx + T * 4.65, ry + T * 1.1);
          ctx!.lineTo(rx + T * 4.8, ry + T * 1.5);
          ctx!.closePath();
          ctx!.fill();
          ctx!.fillStyle = '#92400e';
          ctx!.fillRect(rx + T * 4.63, ry + T * 1.5, 3, T * 0.3);
          ctx!.fillStyle = '#fbbf2408';
          ctx!.beginPath();
          ctx!.arc(rx + T * 4.65, ry + T * 1.8, 18, 0, Math.PI * 2);
          ctx!.fill();
          // Globe
          ctx!.strokeStyle = '#9333ea50';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(rx + T * 2.5, ry + T * 3, 8, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.beginPath();
          ctx!.ellipse(rx + T * 2.5, ry + T * 3, 4, 8, 0, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.fillStyle = '#92400e';
          ctx!.fillRect(rx + T * 2.5 - 3, ry + T * 3 + 8, 6, 4);
          drawChair(rx + T * 3.5, ry + T * 2.8, '#3b0764');
          break;
        }
        case 'brand-lead': {
          // Mood board on wall (large)
          ctx!.fillStyle = '#f5f5f412';
          ctx!.fillRect(rx + T * 3.5, ry + T * 0.3, T * 2.8, T * 2.2);
          ctx!.strokeStyle = '#ea580c40';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 3.5, ry + T * 0.3, T * 2.8, T * 2.2);
          // Sticky notes on mood board
          const stickies = [
            { c: '#fbbf24', x: 4, y: 4, w: 18, h: 14 },
            { c: '#fb923c', x: 28, y: 8, w: 20, h: 16 },
            { c: '#f87171', x: 10, y: 24, w: 16, h: 14 },
            { c: '#a3e635', x: 36, y: 28, w: 18, h: 12 },
            { c: '#818cf8', x: 54, y: 4, w: 22, h: 15 },
            { c: '#fb7185', x: 2, y: 42, w: 20, h: 14 },
          ];
          for (const s of stickies) {
            ctx!.fillStyle = s.c + '60';
            ctx!.fillRect(rx + T * 3.5 + s.x, ry + T * 0.4 + s.y, s.w, s.h);
          }
          // Color palette on wall
          ctx!.fillStyle = '#ea580c20';
          ctx!.beginPath();
          ctx!.ellipse(rx + T * 2, ry + T * 0.8, 16, 12, -0.3, 0, Math.PI * 2);
          ctx!.fill();
          const pColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
          for (let i = 0; i < 6; i++) {
            ctx!.fillStyle = pColors[i];
            ctx!.beginPath();
            ctx!.arc(rx + T * 1.6 + i * 6, ry + T * 0.7 + (i % 2) * 5, 3, 0, Math.PI * 2);
            ctx!.fill();
          }
          // Design table
          ctx!.fillStyle = '#7c2d12';
          ctx!.fillRect(rx + T * 1, ry + T * 2.2, T * 3.5, T * 0.5);
          // Color swatches on desk
          for (let i = 0; i < 5; i++) {
            ctx!.fillStyle = pColors[i] + '80';
            ctx!.fillRect(rx + T * 1.2 + i * 12, ry + T * 2.1, 8, 8);
          }
          // iMac-style monitor
          ctx!.fillStyle = '#d4d4d8';
          ctx!.fillRect(rx + T * 2, ry + T * 1.2, T * 1.5, T * 0.9);
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx + T * 2 + 2, ry + T * 1.2 + 2, T * 1.5 - 4, T * 0.7);
          ctx!.fillStyle = '#ea580c18';
          ctx!.fillRect(rx + T * 2 + 4, ry + T * 1.25, T * 1.5 - 8, T * 0.6);
          ctx!.fillStyle = '#d4d4d8';
          ctx!.fillRect(rx + T * 2.6, ry + T * 2.1, 8, 5);
          ctx!.fillRect(rx + T * 2.4, ry + T * 2.13, T * 0.5, 3);
          // Plants
          drawPlantSmall(rx + T * 0.7, ry + T * 3.5);
          drawPlantSmall(rx + T * 5.8, ry + T * 3.5);
          drawChair(rx + T * 2.5, ry + T * 3, '#6b2a0a');
          break;
        }
        case 'career-lead': {
          // Interview table (center)
          ctx!.fillStyle = '#115e59';
          ctx!.fillRect(rx + T * 2, ry + T * 1.5, T * 3, T * 0.8);
          ctx!.fillStyle = '#0d9488';
          ctx!.fillRect(rx + T * 2 + 2, ry + T * 1.5 + 2, T * 3 - 4, T * 0.8 - 4);
          // Two chairs facing each other
          drawChair(rx + T * 3.5, ry + T * 1, '#0d9488');
          drawChair(rx + T * 3.5, ry + T * 2.8, '#0d9488');
          // Resume display on wall
          ctx!.fillStyle = '#0d948818';
          ctx!.fillRect(rx + T * 0.8, ry + T * 0.4, T * 1.8, T * 2);
          ctx!.strokeStyle = '#5eead440';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 0.8, ry + T * 0.4, T * 1.8, T * 2);
          // Resume lines
          ctx!.fillStyle = '#5eead440';
          ctx!.fillRect(rx + T * 1, ry + T * 0.6, T * 1.2, 3);
          for (let j = 0; j < 6; j++) {
            ctx!.fillStyle = '#5eead420';
            ctx!.fillRect(rx + T * 1, ry + T * 0.85 + j * 7, T * 1.4 - j * 4, 2);
          }
          // Portfolio display on right wall
          ctx!.fillStyle = '#0d948818';
          ctx!.fillRect(rx + T * 4.5, ry + T * 0.4, T * 2, T * 1.5);
          ctx!.strokeStyle = '#5eead430';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 4.5, ry + T * 0.4, T * 2, T * 1.5);
          // Portfolio cards
          for (let i = 0; i < 4; i++) {
            const col = i % 2, row = Math.floor(i / 2);
            ctx!.fillStyle = '#5eead418';
            ctx!.fillRect(rx + T * 4.7 + col * 24, ry + T * 0.6 + row * 20, 20, 16);
          }
          // Briefcase
          ctx!.fillStyle = '#134e4a';
          ctx!.fillRect(rx + T * 5, ry + T * 2.5, T * 1.2, T * 0.8);
          ctx!.fillStyle = '#0d9488';
          ctx!.fillRect(rx + T * 5.2, ry + T * 2.3, T * 0.8, 5);
          ctx!.fillStyle = '#c9a227';
          ctx!.fillRect(rx + T * 5.45, ry + T * 2.75, 6, 3);
          drawPlantSmall(rx + T * 0.7, ry + T * 3.5);
          break;
        }
        case 'standup': {
          // Projector screen on wall
          ctx!.fillStyle = '#f1f5f910';
          ctx!.fillRect(rx + T * 1.5, ry + T * 0.3, T * 4, T * 1.2);
          ctx!.strokeStyle = '#eab30830';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 1.5, ry + T * 0.3, T * 4, T * 1.2);
          // Podium
          ctx!.fillStyle = '#713f12';
          ctx!.fillRect(rx + T * 3, ry + T * 1.8, T * 1.2, T * 1.5);
          ctx!.fillStyle = '#854d0e';
          ctx!.fillRect(rx + T * 2.8, ry + T * 1.8, T * 1.6, T * 0.35);
          // Microphone stand
          ctx!.fillStyle = '#6b7280';
          ctx!.fillRect(rx + T * 3.5, ry + T * 0.8, 2, T * 1);
          ctx!.fillStyle = '#9ca3af';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3.52, ry + T * 0.7, 5, 0, Math.PI * 2);
          ctx!.fill();
          // Spotlight beams
          ctx!.fillStyle = '#fbbf2406';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 2, ry);
          ctx!.lineTo(rx + T * 2.5, ry + T * 3);
          ctx!.lineTo(rx + T * 4.5, ry + T * 3);
          ctx!.lineTo(rx + T * 5, ry);
          ctx!.closePath();
          ctx!.fill();
          // 3 rows of audience chairs
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) {
              const cx = rx + T * 1.2 + col * T * 1;
              const cy = ry + T * 3 + row * 10;
              ctx!.fillStyle = '#78350f50';
              ctx!.fillRect(cx - 3, cy - 3, 6, 6);
              ctx!.fillStyle = '#78350f30';
              ctx!.fillRect(cx - 3, cy - 6, 6, 3);
            }
          }
          break;
        }
        case 'ceo-digest': {
          // Long conference table
          ctx!.fillStyle = '#475569';
          ctx!.fillRect(rx + T * 1.2, ry + T * 1.5, T * 4.5, T * 1.2);
          ctx!.fillStyle = '#64748b15';
          ctx!.fillRect(rx + T * 1.4, ry + T * 1.6, T * 4.1, T * 1);
          // 6 chairs (3 per side)
          for (let i = 0; i < 3; i++) {
            drawChair(rx + T * 2 + i * T * 1.2, ry + T * 1.1, '#334155');
            drawChair(rx + T * 2 + i * T * 1.2, ry + T * 3.1, '#334155');
          }
          // Projector screen on wall
          ctx!.fillStyle = '#f1f5f910';
          ctx!.fillRect(rx + T * 1.5, ry + T * 0.2, T * 4, T * 0.9);
          ctx!.strokeStyle = '#94a3b830';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 1.5, ry + T * 0.2, T * 4, T * 0.9);
          // Whiteboard
          ctx!.fillStyle = '#f8fafc10';
          ctx!.fillRect(rx + T * 5.8, ry + T * 0.8, T * 0.8, T * 1.5);
          ctx!.strokeStyle = '#64748b40';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 5.8, ry + T * 0.8, T * 0.8, T * 1.5);
          // Marker dots
          ctx!.fillStyle = '#ef4444';
          ctx!.beginPath();
          ctx!.arc(rx + T * 6, ry + T * 2.5, 2, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = '#3b82f6';
          ctx!.beginPath();
          ctx!.arc(rx + T * 6.15, ry + T * 2.5, 2, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = '#22c55e';
          ctx!.beginPath();
          ctx!.arc(rx + T * 6.3, ry + T * 2.5, 2, 0, Math.PI * 2);
          ctx!.fill();
          break;
        }
        case 'cron-center': {
          // Title bar
          ctx!.fillStyle = '#6366f120';
          ctx!.fillRect(rx + T * 1, ry + T * 0.3, T * 8, T * 0.7);
          ctx!.fillStyle = '#a5b4fc';
          ctx!.font = 'bold 10px monospace';
          ctx!.textAlign = 'left';
          ctx!.fillText('CRON MONITORING CENTER', rx + T * 1.3, ry + T * 0.75);
          // Central control desk
          ctx!.fillStyle = '#1e293b';
          ctx!.fillRect(rx + T * 14, ry + T * 3.5, T * 6, T * 0.5);
          ctx!.fillStyle = '#334155';
          ctx!.fillRect(rx + T * 14.2, ry + T * 3, T * 2, T * 0.5);
          ctx!.fillRect(rx + T * 17, ry + T * 3, T * 2, T * 0.5);
          // Large status wall of monitoring tiles
          const tileW = T * 1.5;
          const tileH = T * 1.1;
          const tilesPerRow = 10;
          for (let i = 0; i < 20; i++) {
            const col = i % tilesPerRow;
            const row = Math.floor(i / tilesPerRow);
            const tx = rx + T * 1.5 + col * (tileW + 6);
            const ty = ry + T * 1.3 + row * (tileH + 6);
            ctx!.fillStyle = '#0f172a';
            ctx!.fillRect(tx, ty, tileW, tileH);
            ctx!.strokeStyle = '#1e293b';
            ctx!.lineWidth = 0.5;
            ctx!.strokeRect(tx, ty, tileW, tileH);
            // Status LED with blink
            const blinkPhase = (fc + i * 11) % 80;
            const isLit = blinkPhase > 15;
            const ledColor = i % 7 === 0 ? '#f85149' : i % 5 === 0 ? '#d29922' : '#3fb950';
            ctx!.fillStyle = isLit ? ledColor : ledColor + '30';
            ctx!.beginPath();
            ctx!.arc(tx + 8, ty + tileH / 2, 3, 0, Math.PI * 2);
            ctx!.fill();
            // Mini sparkline
            ctx!.strokeStyle = ledColor + '40';
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            for (let s = 0; s < 5; s++) {
              const sparkX = tx + 16 + s * 6;
              const sparkY = ty + tileH / 2 + Math.sin(fc * 0.02 + i + s) * 4;
              if (s === 0) ctx!.moveTo(sparkX, sparkY);
              else ctx!.lineTo(sparkX, sparkY);
            }
            ctx!.stroke();
          }
          // Wall of status displays (bottom row)
          for (let i = 0; i < 8; i++) {
            const dx = rx + T * 2 + i * T * 4;
            ctx!.fillStyle = '#6366f108';
            ctx!.fillRect(dx, ry + T * 4.5, T * 3.5, T * 2.2);
            ctx!.strokeStyle = '#6366f120';
            ctx!.lineWidth = 0.5;
            ctx!.strokeRect(dx, ry + T * 4.5, T * 3.5, T * 2.2);
          }
          break;
        }
        case 'server-room': {
          // 4 server racks with blinking LEDs
          for (let i = 0; i < 4; i++) {
            const sx = rx + T * 0.6 + i * T * 1.6;
            const sy = ry + T * 0.5;
            ctx!.fillStyle = '#1e293b';
            ctx!.fillRect(sx, sy, T * 1.2, T * 2.8);
            ctx!.strokeStyle = '#334155';
            ctx!.lineWidth = 1;
            ctx!.strokeRect(sx, sy, T * 1.2, T * 2.8);
            // Rack label
            ctx!.fillStyle = '#64748b60';
            ctx!.font = '6px monospace';
            ctx!.textAlign = 'center';
            ctx!.fillText(`R${i + 1}`, sx + T * 0.6, sy + 8);
            // LED rows with blinking animation
            for (let j = 0; j < 8; j++) {
              const blinkPhase = (fc + i * 7 + j * 3) % 60;
              const isLit = blinkPhase > 10;
              if (j % 3 === 0) ctx!.fillStyle = isLit ? '#f85149' : '#f8514920';
              else if (j % 2 === 0) ctx!.fillStyle = isLit ? '#3fb950' : '#3fb95020';
              else ctx!.fillStyle = isLit ? '#58a6ff' : '#58a6ff20';
              ctx!.beginPath();
              ctx!.arc(sx + 6, sy + 14 + j * 10, 2, 0, Math.PI * 2);
              ctx!.fill();
              // Drive slots
              ctx!.fillStyle = '#0f172a';
              ctx!.fillRect(sx + 14, sy + 10 + j * 10, T * 0.5, 5);
            }
          }
          // Cable trays (overhead)
          ctx!.strokeStyle = '#475569';
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 0.5, ry + T * 3.4);
          ctx!.lineTo(rx + T * 6.5, ry + T * 3.4);
          ctx!.stroke();
          // Cables
          ctx!.strokeStyle = '#3fb95018';
          ctx!.lineWidth = 1;
          for (let c = 0; c < 5; c++) {
            ctx!.beginPath();
            ctx!.moveTo(rx + T * 0.8 + c * T * 1.4, ry + T * 3.2);
            ctx!.bezierCurveTo(
              rx + T * 1 + c * T * 1, ry + T * 3.6,
              rx + T * 3, ry + T * 3.5 + c * 2,
              rx + T * 5.5, ry + T * 3.4
            );
            ctx!.stroke();
          }
          // AC unit on wall
          ctx!.fillStyle = '#64748b40';
          ctx!.fillRect(rx + T * 5.3, ry + T * 0.5, T * 1.2, T * 0.6);
          ctx!.strokeStyle = '#94a3b840';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 5.3, ry + T * 0.5, T * 1.2, T * 0.6);
          // AC vent lines
          for (let v = 0; v < 3; v++) {
            ctx!.fillStyle = '#94a3b830';
            ctx!.fillRect(rx + T * 5.4, ry + T * 0.6 + v * 5, T * 1, 2);
          }
          // Monitoring screen
          drawMonitor(rx + T * 5.2, ry + T * 1.5, T * 1.3, T * 0.8, '#3fb95010', '#475569');
          // Screen content
          ctx!.fillStyle = '#3fb95040';
          ctx!.font = '5px monospace';
          ctx!.textAlign = 'left';
          ctx!.fillText('CPU:OK', rx + T * 5.35, ry + T * 1.75);
          ctx!.fillText('MEM:OK', rx + T * 5.35, ry + T * 1.95);
          ctx!.fillText('DISK:OK', rx + T * 5.35, ry + T * 2.1);
          break;
        }
      }
    }

    // ── 렌더 함수들 ────────────────────────────────────────────
    function drawRoom(r: RoomDef, camX: number, camY: number) {
      const rx = r.x * T - camX, ry = r.y * T - camY;
      const rw = r.w * T, rh = r.h * T;
      const state = npcStatesRef.current[r.id];

      // Floor based on floorStyle
      switch (r.floorStyle) {
        case 'executive':
          // Dark wood plank pattern
          ctx!.fillStyle = '#2a1f0e';
          ctx!.fillRect(rx, ry, rw, rh);
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              const offset = (y % 2) * (T / 2);
              ctx!.fillStyle = (x + y) % 3 === 0 ? '#33260f0a' : '#1f18080a';
              ctx!.fillRect(rx + x * T, ry + y * T, T, T);
              // Wood grain horizontal lines
              ctx!.fillStyle = '#3d2e1508';
              ctx!.fillRect(rx + x * T + offset, ry + y * T + 6, T - 2, 1);
              ctx!.fillRect(rx + x * T + offset, ry + y * T + 18, T - 4, 1);
              ctx!.fillRect(rx + x * T + offset, ry + y * T + 28, T - 1, 1);
            }
          }
          // Warm ambient glow
          const grdExec = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.6);
          grdExec.addColorStop(0, '#c9a22710');
          grdExec.addColorStop(1, 'transparent');
          ctx!.fillStyle = grdExec;
          ctx!.fillRect(rx, ry, rw, rh);
          break;
        case 'metal':
          // Metal grid for server/cron rooms
          ctx!.fillStyle = '#0c0f14';
          ctx!.fillRect(rx, ry, rw, rh);
          ctx!.strokeStyle = '#1e293b40';
          ctx!.lineWidth = 0.5;
          for (let gx = 0; gx < r.w * 2; gx++) {
            ctx!.beginPath();
            ctx!.moveTo(rx + gx * (T / 2), ry);
            ctx!.lineTo(rx + gx * (T / 2), ry + rh);
            ctx!.stroke();
          }
          for (let gy = 0; gy < r.h * 2; gy++) {
            ctx!.beginPath();
            ctx!.moveTo(rx, ry + gy * (T / 2));
            ctx!.lineTo(rx + rw, ry + gy * (T / 2));
            ctx!.stroke();
          }
          // Raised floor panels (diamond pattern)
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              if ((x + y) % 4 === 0) {
                ctx!.fillStyle = '#1e293b08';
                ctx!.fillRect(rx + x * T + 2, ry + y * T + 2, T - 4, T - 4);
              }
            }
          }
          break;
        case 'stage':
          // Polished stage floor with planks
          ctx!.fillStyle = '#1a1505';
          ctx!.fillRect(rx, ry, rw, rh);
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              ctx!.fillStyle = '#2a200a06';
              ctx!.fillRect(rx + x * T, ry + y * T, T, T);
              // Stage plank lines
              ctx!.fillStyle = '#33280f08';
              ctx!.fillRect(rx + x * T, ry + y * T + T - 1, T, 1);
            }
          }
          const grdStage = ctx!.createRadialGradient(rx + rw / 2, ry + rh * 0.3, 0, rx + rw / 2, ry + rh * 0.3, rw * 0.5);
          grdStage.addColorStop(0, '#eab30812');
          grdStage.addColorStop(1, 'transparent');
          ctx!.fillStyle = grdStage;
          ctx!.fillRect(rx, ry, rw, rh);
          break;
        default:
          // Carpet floor with alternating subtle shades
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx, ry, rw, rh);
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              // Carpet texture pattern (alternating subtle squares)
              const shade = ((x + y) % 2 === 0) ? '06' : '04';
              ctx!.fillStyle = r.teamColor + shade;
              ctx!.fillRect(rx + x * T, ry + y * T, T, T);
              // Carpet fiber dots
              if ((x * 7 + y * 13) % 5 === 0) {
                ctx!.fillStyle = r.teamColor + '08';
                ctx!.fillRect(rx + x * T + 8, ry + y * T + 8, 2, 2);
              }
              if ((x * 11 + y * 3) % 7 === 0) {
                ctx!.fillStyle = r.teamColor + '06';
                ctx!.fillRect(rx + x * T + 20, ry + y * T + 14, 2, 2);
              }
            }
          }
          break;
      }

      // Inner shadow along walls (depth effect)
      const innerShadowSize = 8;
      const grdTop = ctx!.createLinearGradient(rx, ry, rx, ry + innerShadowSize);
      grdTop.addColorStop(0, 'rgba(0,0,0,0.15)');
      grdTop.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdTop;
      ctx!.fillRect(rx, ry, rw, innerShadowSize);
      const grdLeft = ctx!.createLinearGradient(rx, ry, rx + innerShadowSize, ry);
      grdLeft.addColorStop(0, 'rgba(0,0,0,0.1)');
      grdLeft.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdLeft;
      ctx!.fillRect(rx, ry, innerShadowSize, rh);
      const grdRight = ctx!.createLinearGradient(rx + rw, ry, rx + rw - innerShadowSize, ry);
      grdRight.addColorStop(0, 'rgba(0,0,0,0.08)');
      grdRight.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdRight;
      ctx!.fillRect(rx + rw - innerShadowSize, ry, innerShadowSize, rh);

      // Room glow based on status
      if (state) {
        const glowColor = state.status === 'green' ? '#3fb950' : state.status === 'red' ? '#f85149' : '#d29922';
        const grdGlow = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.7);
        grdGlow.addColorStop(0, glowColor + '06');
        grdGlow.addColorStop(1, 'transparent');
        ctx!.fillStyle = grdGlow;
        ctx!.fillRect(rx, ry, rw, rh);
      }

      // Walls — thick with proper corners
      ctx!.strokeStyle = r.teamColor + '55';
      ctx!.lineWidth = 4;
      ctx!.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);

      // Wall top line for 3D depth illusion (lighter)
      ctx!.fillStyle = r.teamColor + '40';
      ctx!.fillRect(rx, ry, rw, 5);
      // Wall top highlight
      ctx!.fillStyle = '#ffffff08';
      ctx!.fillRect(rx + 4, ry, rw - 8, 2);

      // Side wall shading (left darker, right lighter for depth)
      ctx!.fillStyle = r.teamColor + '18';
      ctx!.fillRect(rx, ry, 4, rh);
      ctx!.fillStyle = r.teamColor + '0c';
      ctx!.fillRect(rx + rw - 4, ry, 4, rh);

      // Glass window sections (on some walls — top wall for non-cron rooms)
      if (r.type !== 'cron' && r.w >= 6) {
        const windowCount = Math.floor(r.w / 3);
        for (let i = 0; i < windowCount; i++) {
          const wx = rx + T * 1.5 + i * T * 2.5;
          const wy = ry + 2;
          ctx!.fillStyle = '#58a6ff08';
          ctx!.fillRect(wx, wy, T * 1.2, 4);
          ctx!.strokeStyle = '#58a6ff15';
          ctx!.lineWidth = 0.5;
          ctx!.strokeRect(wx, wy, T * 1.2, 4);
        }
      }

      // Door opening
      const doorX = (r.x + Math.floor(r.w / 2)) * T - camX;
      if (r.type === 'cron') {
        // 크론센터: 위쪽 문
        ctx!.fillStyle = '#3a3a52';
        ctx!.fillRect(doorX - T, ry - 2, T * 3, 8);
        ctx!.fillStyle = r.teamColor + '80';
        ctx!.fillRect(doorX - T, ry, T * 3, 3);
        // Door light strip
        ctx!.fillStyle = r.teamColor + '20';
        ctx!.fillRect(doorX - T + 4, ry + 3, T * 3 - 8, 2);
      } else {
        // 일반: 아래쪽 문
        ctx!.fillStyle = '#3a3a52';
        ctx!.fillRect(doorX - T, ry + rh - 6, T * 2, 8);
        ctx!.fillStyle = r.teamColor + '80';
        ctx!.fillRect(doorX - T, ry + rh - 3, T * 2, 3);
        // Door light strip
        ctx!.fillStyle = r.teamColor + '20';
        ctx!.fillRect(doorX - T + 4, ry + rh - 6, T * 2 - 8, 2);
      }

      // Draw unique furniture per room
      drawRoomFurniture(r, rx, ry, rw, rh);

      // Room name plate (inside top, more refined)
      ctx!.font = 'bold 11px monospace';
      const plateText = `${r.emoji} ${r.name}`;
      const plateW = ctx!.measureText(plateText).width + 20;
      ctx!.fillStyle = r.teamColor + '20';
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 5);
      ctx!.fill();
      ctx!.strokeStyle = r.teamColor + '35';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 5);
      ctx!.stroke();
      ctx!.fillStyle = '#d8e0e8';
      ctx!.textAlign = 'center';
      ctx!.fillText(plateText, rx + rw / 2, ry + 24);
    }

    // Door nameplate (outside the room)
    function drawDoorNameplate(r: RoomDef, camX: number, camY: number) {
      const doorX = (r.x + Math.floor(r.w / 2)) * T - camX;
      const doorY = (r.y + r.h) * T - camY;
      ctx!.font = '8px monospace';
      const text = r.name;
      const tw = ctx!.measureText(text).width + 10;
      ctx!.fillStyle = r.teamColor + '30';
      ctx!.beginPath();
      ctx!.roundRect(doorX - tw / 2, doorY + 4, tw, 14, 3);
      ctx!.fill();
      ctx!.fillStyle = r.teamColor + 'cc';
      ctx!.textAlign = 'center';
      ctx!.fillText(text, doorX, doorY + 14);
    }

    function drawNPC(r: RoomDef, camX: number, camY: number) {
      const fc = frameCountRef.current;
      const nx = r.npcX * T - camX + T / 2;
      // Idle animation: subtle oscillation +/-1px every 30 frames
      const idleBob = Math.sin(fc * 0.07 + r.npcX * 3) * 1;
      const ny = r.npcY * T - camY + T / 2 + idleBob;
      const state = npcStatesRef.current[r.id];
      const stColor = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
      const isError = state?.status === 'red';

      // Shadow (soft ellipse)
      ctx!.fillStyle = 'rgba(0,0,0,0.3)';
      ctx!.beginPath();
      ctx!.ellipse(nx, ny + 15, 10, 4, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Legs (two small rectangles)
      ctx!.fillStyle = isError ? '#8b3a3a' : '#2a2a3e';
      ctx!.fillRect(nx - 4, ny + 10, 3, 6);
      ctx!.fillRect(nx + 2, ny + 10, 3, 6);

      // Body (team color shirt)
      const bodyColor = isError ? '#6b2020' : r.teamColor;
      ctx!.fillStyle = bodyColor + 'c0';
      ctx!.fillRect(nx - 7, ny - 2, 14, 13);
      // Shirt highlight (left side lighter)
      ctx!.fillStyle = '#ffffff08';
      ctx!.fillRect(nx - 7, ny - 2, 5, 13);
      // Collar
      ctx!.fillStyle = bodyColor + 'e0';
      ctx!.fillRect(nx - 3, ny - 3, 6, 2);

      // Arms (two small lines/rects extending from body)
      ctx!.fillStyle = '#f0d0a0';
      ctx!.fillRect(nx - 9, ny + 1, 3, 8);
      ctx!.fillRect(nx + 7, ny + 1, 3, 8);

      // Head (skin color circle)
      ctx!.fillStyle = isError ? '#e0b090' : '#f0d0a0';
      ctx!.beginPath();
      ctx!.arc(nx, ny - 8, 8, 0, Math.PI * 2);
      ctx!.fill();

      // Hair (team-colored)
      const hairColor = r.teamColor;
      ctx!.fillStyle = hairColor + 'b0';
      ctx!.beginPath();
      ctx!.arc(nx, ny - 11, 8, Math.PI + 0.3, Math.PI * 2 - 0.3);
      ctx!.fill();
      // Hair top (fuller)
      ctx!.fillRect(nx - 7, ny - 16, 14, 5);

      // Eyes (small dark pixels)
      ctx!.fillStyle = '#222';
      ctx!.fillRect(nx - 3, ny - 9, 2, 2);
      ctx!.fillRect(nx + 2, ny - 9, 2, 2);
      // Eye whites
      ctx!.fillStyle = '#ffffff40';
      ctx!.fillRect(nx - 3, ny - 9, 1, 1);
      ctx!.fillRect(nx + 2, ny - 9, 1, 1);

      // Mouth
      ctx!.fillStyle = '#c4907060';
      ctx!.fillRect(nx - 1, ny - 5, 3, 1);

      // Floating status icon above head
      const iconY = ny - 26 + Math.sin(fc * 0.06) * 2;
      if (state?.status === 'red') {
        // Error: floating red exclamation
        ctx!.fillStyle = '#f85149';
        ctx!.font = 'bold 12px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText('!', nx, iconY);
        // Glow
        ctx!.save();
        ctx!.shadowColor = '#f85149';
        ctx!.shadowBlur = 8;
        ctx!.fillStyle = '#f85149';
        ctx!.beginPath();
        ctx!.arc(nx, iconY - 4, 8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
        ctx!.fillStyle = '#fff';
        ctx!.font = 'bold 10px monospace';
        ctx!.fillText('!', nx, iconY);
      } else if (state?.task && state.task !== 'idle') {
        // Running: floating lightning bolt
        ctx!.fillStyle = '#fbbf24';
        ctx!.font = '10px sans-serif';
        ctx!.textAlign = 'center';
        ctx!.fillText('\u26A1', nx, iconY);
      } else {
        // Normal: status LED with glow
        ctx!.save();
        ctx!.shadowColor = stColor;
        ctx!.shadowBlur = 6;
        ctx!.fillStyle = stColor;
        ctx!.beginPath();
        ctx!.arc(nx, iconY, 4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // LED ring pulse
      const pulse = Math.sin(fc * 0.05) * 0.3 + 0.7;
      ctx!.strokeStyle = stColor + Math.round(pulse * 80).toString(16).padStart(2, '0');
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(nx, iconY, 6 + Math.sin(fc * 0.03) * 1.5, 0, Math.PI * 2);
      ctx!.stroke();

      // Name label with background pill
      const nameText = r.name;
      ctx!.font = 'bold 9px monospace';
      const nameW = ctx!.measureText(nameText).width + 8;
      ctx!.fillStyle = 'rgba(0,0,0,0.55)';
      ctx!.beginPath();
      ctx!.roundRect(nx - nameW / 2, ny + 19, nameW, 13, 3);
      ctx!.fill();
      ctx!.fillStyle = '#c8d0d8';
      ctx!.textAlign = 'center';
      ctx!.fillText(nameText, nx, ny + 29);

      // Status text (current task)
      if (state?.task) {
        const taskLabel = state.task.length > 14 ? state.task.slice(0, 13) + '\u2026' : state.task;
        ctx!.fillStyle = '#8b949e';
        ctx!.font = '7px monospace';
        ctx!.fillText(taskLabel, nx, ny + 39);
      }
    }

    function drawPlayer(camX: number, camY: number) {
      const fc = frameCountRef.current;
      const p = playerRef.current;
      let px: number, py: number;
      const dir = animRef.current.dir; // 0=down, 1=left, 2=right, 3=up

      if (tweenRef.current.active) {
        const tw = tweenRef.current;
        px = (tw.sx + (tw.tx - tw.sx) * tw.t) * T - camX + T / 2;
        py = (tw.sy + (tw.ty - tw.sy) * tw.t) * T - camY + T / 2;
      } else {
        px = p.x * T - camX + T / 2;
        py = p.y * T - camY + T / 2;
      }

      // Subtle bounce while moving
      const isMoving = tweenRef.current.active;
      const bounce = isMoving ? Math.abs(Math.sin(fc * 0.3)) * 2 : 0;
      py -= bounce;

      // Shadow (bigger when bouncing)
      const shadowScale = 1 - bounce * 0.03;
      ctx!.fillStyle = 'rgba(0,0,0,0.4)';
      ctx!.beginPath();
      ctx!.ellipse(px, py + 15 + bounce, 10 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Legs with walking animation
      const legOffset = isMoving ? Math.sin(fc * 0.4) * 2 : 0;
      ctx!.fillStyle = '#1e3a5f';
      ctx!.fillRect(px - 4, py + 10 + legOffset, 3, 6);
      ctx!.fillRect(px + 2, py + 10 - legOffset, 3, 6);

      // Body (blue outfit, brighter)
      ctx!.fillStyle = '#58a6ff';
      ctx!.fillRect(px - 7, py - 2, 14, 13);
      // Body highlight
      ctx!.fillStyle = '#7dc4ff20';
      ctx!.fillRect(px - 7, py - 2, 5, 13);
      // Collar
      ctx!.fillStyle = '#4090e0';
      ctx!.fillRect(px - 3, py - 3, 6, 2);

      // Arms
      ctx!.fillStyle = '#f0d0a0';
      const armSwing = isMoving ? Math.sin(fc * 0.4) * 2 : 0;
      ctx!.fillRect(px - 9, py + 1 + armSwing, 3, 8);
      ctx!.fillRect(px + 7, py + 1 - armSwing, 3, 8);

      // Head
      ctx!.fillStyle = '#f0d0a0';
      ctx!.beginPath();
      ctx!.arc(px, py - 8, 8, 0, Math.PI * 2);
      ctx!.fill();

      // Hair
      ctx!.fillStyle = '#2a1a0a';
      ctx!.beginPath();
      ctx!.arc(px, py - 11, 8, Math.PI + 0.3, Math.PI * 2 - 0.3);
      ctx!.fill();
      ctx!.fillRect(px - 7, py - 17, 14, 5);

      // Eyes — direction indicator
      const eyeOffX = dir === 1 ? -1 : dir === 2 ? 1 : 0;
      const eyeOffY = dir === 3 ? -1 : dir === 0 ? 1 : 0;
      ctx!.fillStyle = '#222';
      ctx!.fillRect(px - 3 + eyeOffX, py - 9 + eyeOffY, 2, 2);
      ctx!.fillRect(px + 2 + eyeOffX, py - 9 + eyeOffY, 2, 2);
      // Eye whites
      ctx!.fillStyle = '#ffffff40';
      ctx!.fillRect(px - 3 + eyeOffX, py - 9 + eyeOffY, 1, 1);
      ctx!.fillRect(px + 2 + eyeOffX, py - 9 + eyeOffY, 1, 1);

      // "YOU" label with cyan glow
      ctx!.save();
      ctx!.shadowColor = '#58a6ff';
      ctx!.shadowBlur = 8;
      // Background pill for label
      const youW = 30;
      ctx!.fillStyle = 'rgba(0,0,0,0.6)';
      ctx!.beginPath();
      ctx!.roundRect(px - youW / 2, py - 28, youW, 14, 4);
      ctx!.fill();
      ctx!.fillStyle = '#7dd3fc';
      ctx!.font = 'bold 10px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('YOU', px, py - 18);
      ctx!.restore();

      // Player glow aura
      const auraGlow = ctx!.createRadialGradient(px, py, 0, px, py, 24);
      auraGlow.addColorStop(0, '#58a6ff08');
      auraGlow.addColorStop(1, 'transparent');
      ctx!.fillStyle = auraGlow;
      ctx!.fillRect(px - 24, py - 24, 48, 48);
    }

    function drawInteractPrompt(room: RoomDef, camX: number, camY: number) {
      const nx = room.npcX * T - camX + T / 2;
      const ny = room.npcY * T - camY - 32;
      const text = `[E] ${room.name}`;
      ctx!.font = 'bold 11px monospace';
      const tw = ctx!.measureText(text).width + 20;

      // Background pill
      ctx!.fillStyle = 'rgba(0,0,0,0.85)';
      ctx!.beginPath();
      ctx!.roundRect(nx - tw / 2, ny - 11, tw, 22, 8);
      ctx!.fill();

      // Border
      ctx!.strokeStyle = room.teamColor + '80';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(nx - tw / 2, ny - 11, tw, 22, 8);
      ctx!.stroke();

      ctx!.fillStyle = '#fff';
      ctx!.textAlign = 'center';
      ctx!.fillText(text, nx, ny + 4);
    }

    // Decorative elements
    function drawDecorations(camX: number, camY: number) {
      const fc = frameCountRef.current;

      // Potted plants at corridor intersections
      const plantPositions = [
        { x: 9.5, y: 8 }, { x: 18.5, y: 8 }, { x: 27.5, y: 8 },
        { x: 9.5, y: 16 }, { x: 18.5, y: 16 }, { x: 27.5, y: 16 },
        { x: 9.5, y: 24 }, { x: 18.5, y: 24 }, { x: 27.5, y: 24 },
        { x: 37, y: 8 }, { x: 37, y: 16 },
      ];
      for (const pl of plantPositions) {
        drawPlantSmall(pl.x * T - camX, pl.y * T - camY);
      }

      // Water cooler
      const wcx = 1 * T - camX + T / 2;
      const wcy = 8 * T - camY;
      ctx!.fillStyle = '#64748b';
      ctx!.fillRect(wcx - 5, wcy - 2, 10, 12);
      ctx!.fillStyle = '#bae6fd50';
      ctx!.fillRect(wcx - 4, wcy - 10, 8, 10);
      ctx!.fillStyle = '#7dd3fc60';
      ctx!.fillRect(wcx - 4, wcy - 10, 8, 4);
      // Cup
      ctx!.fillStyle = '#f5f5f430';
      ctx!.fillRect(wcx + 6, wcy + 2, 5, 6);

      // Water cooler #2 (right side)
      const wcx2 = 38 * T - camX + T / 2;
      const wcy2 = 16 * T - camY;
      ctx!.fillStyle = '#64748b';
      ctx!.fillRect(wcx2 - 5, wcy2 - 2, 10, 12);
      ctx!.fillStyle = '#bae6fd50';
      ctx!.fillRect(wcx2 - 4, wcy2 - 10, 8, 10);
      ctx!.fillStyle = '#7dd3fc60';
      ctx!.fillRect(wcx2 - 4, wcy2 - 10, 8, 4);

      // Vending machine (near server room area)
      const vmx = 38 * T - camX;
      const vmy = 22 * T - camY;
      ctx!.fillStyle = '#1e293b';
      ctx!.fillRect(vmx, vmy, T * 1, T * 1.5);
      ctx!.strokeStyle = '#334155';
      ctx!.lineWidth = 1;
      ctx!.strokeRect(vmx, vmy, T * 1, T * 1.5);
      // Vending display
      ctx!.fillStyle = '#3b82f615';
      ctx!.fillRect(vmx + 3, vmy + 3, T - 6, T * 0.6);
      // Drink rows
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const drinkColor = ['#ef4444', '#22c55e', '#3b82f6'][col];
          ctx!.fillStyle = drinkColor + '60';
          ctx!.fillRect(vmx + 5 + col * 8, vmy + 5 + row * 8, 5, 6);
        }
      }
      // Coin slot
      ctx!.fillStyle = '#c9a227';
      ctx!.fillRect(vmx + T * 0.7, vmy + T * 0.8, 4, 6);

      // Notice board on corridor wall (top corridor)
      const nbx = 10 * T - camX;
      const nby = 0.3 * T - camY;
      ctx!.fillStyle = '#5a3e1b80';
      ctx!.fillRect(nbx, nby, T * 2.5, T * 0.8);
      ctx!.strokeStyle = '#8b6914';
      ctx!.lineWidth = 1;
      ctx!.strokeRect(nbx, nby, T * 2.5, T * 0.8);
      // Colored pins
      const pinColors = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6'];
      for (let i = 0; i < 5; i++) {
        ctx!.fillStyle = pinColors[i];
        ctx!.beginPath();
        ctx!.arc(nbx + 8 + i * 14, nby + 4, 2, 0, Math.PI * 2);
        ctx!.fill();
        // Note paper
        ctx!.fillStyle = '#f5f5f420';
        ctx!.fillRect(nbx + 3 + i * 14, nby + 8, 10, 12);
      }

      // Welcome sign at top with decorative border
      const signX = 20 * T - camX;
      const signY = 0.15 * T - camY;
      ctx!.fillStyle = '#c9a22720';
      ctx!.beginPath();
      ctx!.roundRect(signX - 80, signY, 160, 22, 5);
      ctx!.fill();
      ctx!.strokeStyle = '#c9a22740';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(signX - 80, signY, 160, 22, 5);
      ctx!.stroke();
      // Decorative dots
      ctx!.fillStyle = '#c9a22750';
      ctx!.beginPath();
      ctx!.arc(signX - 72, signY + 11, 2, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.arc(signX + 72, signY + 11, 2, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = '#c9a227';
      ctx!.font = 'bold 11px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('\uD83C\uDFE2 JARVIS MAP', signX, signY + 16);

      // Floor arrows in corridors (directional guides)
      const arrowPositions = [
        { x: 5, y: 8, dir: 'right' }, { x: 15, y: 8, dir: 'right' },
        { x: 25, y: 8, dir: 'right' }, { x: 35, y: 8, dir: 'left' },
        { x: 5, y: 16, dir: 'right' }, { x: 15, y: 16, dir: 'right' },
        { x: 25, y: 16, dir: 'right' }, { x: 35, y: 16, dir: 'left' },
      ];
      for (const arr of arrowPositions) {
        const ax = arr.x * T - camX + T / 2;
        const ay = arr.y * T - camY + T / 2;
        ctx!.fillStyle = '#4a4d6010';
        ctx!.beginPath();
        if (arr.dir === 'right') {
          ctx!.moveTo(ax - 6, ay - 3);
          ctx!.lineTo(ax + 4, ay);
          ctx!.lineTo(ax - 6, ay + 3);
        } else {
          ctx!.moveTo(ax + 6, ay - 3);
          ctx!.lineTo(ax - 4, ay);
          ctx!.lineTo(ax + 6, ay + 3);
        }
        ctx!.closePath();
        ctx!.fill();
      }

      // Emergency exit signs (green rectangles)
      const exitPositions = [
        { x: 0.3, y: 7.5 }, { x: 0.3, y: 15.5 }, { x: 0.3, y: 23.5 },
        { x: 38.5, y: 7.5 },
      ];
      for (const ep of exitPositions) {
        const ex = ep.x * T - camX;
        const ey = ep.y * T - camY;
        ctx!.fillStyle = '#22c55e30';
        ctx!.fillRect(ex, ey, T * 0.8, T * 0.4);
        ctx!.fillStyle = '#22c55e80';
        ctx!.font = '6px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText('EXIT', ex + T * 0.4, ey + T * 0.28);
      }

      // Wall clock showing real KST time
      const clockX = 30 * T - camX;
      const clockY = 0.3 * T - camY;
      // Clock body
      ctx!.fillStyle = '#21262d';
      ctx!.beginPath();
      ctx!.arc(clockX, clockY + 8, 10, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.strokeStyle = '#c9a22760';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(clockX, clockY + 8, 10, 0, Math.PI * 2);
      ctx!.stroke();
      // Clock hands based on KST time
      const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const hours = kstNow.getHours() % 12;
      const minutes = kstNow.getMinutes();
      // Hour hand
      const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      ctx!.strokeStyle = '#c9a227';
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.moveTo(clockX, clockY + 8);
      ctx!.lineTo(clockX + Math.cos(hAngle) * 5, clockY + 8 + Math.sin(hAngle) * 5);
      ctx!.stroke();
      // Minute hand
      const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
      ctx!.strokeStyle = '#8b949e';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(clockX, clockY + 8);
      ctx!.lineTo(clockX + Math.cos(mAngle) * 7, clockY + 8 + Math.sin(mAngle) * 7);
      ctx!.stroke();
      // Second hand tick
      const sAngle = ((fc % 60) / 60) * Math.PI * 2 - Math.PI / 2;
      ctx!.strokeStyle = '#f8514960';
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      ctx!.moveTo(clockX, clockY + 8);
      ctx!.lineTo(clockX + Math.cos(sAngle) * 8, clockY + 8 + Math.sin(sAngle) * 8);
      ctx!.stroke();

      // Ceiling lights in corridors (subtle glow circles on floor)
      const lightPositions = [
        { x: 5, y: 8 }, { x: 10, y: 8 }, { x: 15, y: 8 }, { x: 20, y: 8 },
        { x: 25, y: 8 }, { x: 30, y: 8 }, { x: 35, y: 8 },
        { x: 5, y: 16 }, { x: 10, y: 16 }, { x: 15, y: 16 }, { x: 20, y: 16 },
        { x: 25, y: 16 }, { x: 30, y: 16 }, { x: 35, y: 16 },
      ];
      for (const lp of lightPositions) {
        const lx = lp.x * T - camX + T / 2;
        const ly = lp.y * T - camY + T / 2;
        const lightGlow = ctx!.createRadialGradient(lx, ly, 0, lx, ly, T * 1.5);
        lightGlow.addColorStop(0, 'rgba(255,255,240,0.03)');
        lightGlow.addColorStop(1, 'transparent');
        ctx!.fillStyle = lightGlow;
        ctx!.fillRect(lx - T * 1.5, ly - T * 1.5, T * 3, T * 3);
      }

      // Lobby welcome mat near entrance (top center corridor)
      const matX = 18 * T - camX;
      const matY = 1 * T - camY;
      ctx!.fillStyle = '#5a3e1b15';
      ctx!.beginPath();
      ctx!.roundRect(matX, matY, T * 4, T * 0.6, 3);
      ctx!.fill();
      ctx!.strokeStyle = '#c9a22715';
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      ctx!.roundRect(matX + 2, matY + 2, T * 4 - 4, T * 0.6 - 4, 2);
      ctx!.stroke();
    }

    function drawMinimap(canvasW: number, canvasH: number) {
      const mmW = 180, mmH = 130;
      const mx = canvasW - mmW - 12, my = 36;
      const scale = Math.min(mmW / (COLS * T), mmH / (ROWS * T));

      // Background
      ctx!.fillStyle = 'rgba(13,17,23,0.9)';
      ctx!.beginPath();
      ctx!.roundRect(mx - 4, my - 4, mmW + 8, mmH + 8, 6);
      ctx!.fill();
      ctx!.strokeStyle = '#30363d';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(mx - 4, my - 4, mmW + 8, mmH + 8, 6);
      ctx!.stroke();

      // Label
      ctx!.fillStyle = '#8b949e';
      ctx!.font = '8px monospace';
      ctx!.textAlign = 'left';
      ctx!.fillText('MINIMAP', mx, my - 8);

      // Rooms with abbreviated names
      const abbrevNames: Record<string, string> = {
        'ceo': 'CEO', 'infra-lead': 'INF', 'trend-lead': 'TRD', 'finance': 'FIN',
        'record-lead': 'REC', 'audit-lead': 'AUD', 'academy-lead': 'ACM', 'brand-lead': 'BRD',
        'career-lead': 'CAR', 'standup': 'STU', 'ceo-digest': 'MTG', 'server-room': 'SRV',
        'cron-center': 'CRON',
      };

      // Detect which room the player is in
      const p = playerRef.current;
      const playerRoomId = ROOMS.find(r =>
        p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
      )?.id;

      // Zone color coding: executive=gold, team=blue, infra=green, server=slate
      const zoneColor = (rId: string): string => {
        if (rId === 'ceo' || rId === 'ceo-digest') return '#c9a227';
        if (rId === 'server-room' || rId === 'cron-center') return '#64748b';
        if (rId === 'infra-lead') return '#22c55e';
        if (rId === 'standup') return '#eab308';
        return '#3b82f6';
      };

      for (const r of ROOMS) {
        const state = npcStatesRef.current[r.id];
        const statusColor = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
        const zone = zoneColor(r.id);
        const isCurrentRoom = r.id === playerRoomId;

        ctx!.fillStyle = isCurrentRoom ? (zone + '50') : (zone + '18');
        ctx!.fillRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);
        ctx!.strokeStyle = isCurrentRoom ? '#fff' : (zone + '50');
        ctx!.lineWidth = isCurrentRoom ? 2 : 1;
        ctx!.strokeRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);

        // Status dot in corner of minimap room
        if (state) {
          ctx!.fillStyle = statusColor;
          ctx!.beginPath();
          ctx!.arc(
            mx + r.x * T * scale + 3,
            my + r.y * T * scale + 3,
            1.5, 0, Math.PI * 2
          );
          ctx!.fill();
        }

        // Abbreviated room name (larger font)
        const abbrev = abbrevNames[r.id] || '';
        if (abbrev) {
          ctx!.fillStyle = isCurrentRoom ? '#fff' : '#a0a8b4';
          ctx!.font = isCurrentRoom ? 'bold 7px monospace' : '6px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText(abbrev,
            mx + (r.x + r.w / 2) * T * scale,
            my + (r.y + r.h / 2) * T * scale + 2
          );
        }
      }

      // Player dot with pulse
      const pulseSize = 3 + Math.sin(frameCountRef.current * 0.08) * 1;
      ctx!.fillStyle = '#58a6ff';
      ctx!.beginPath();
      ctx!.arc(
        mx + p.x * T * scale + T * scale / 2,
        my + p.y * T * scale + T * scale / 2,
        pulseSize, 0, Math.PI * 2
      );
      ctx!.fill();
      // Pulse ring
      const ringSize = 5 + Math.sin(frameCountRef.current * 0.06) * 2;
      ctx!.strokeStyle = '#58a6ff60';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(
        mx + p.x * T * scale + T * scale / 2,
        my + p.y * T * scale + T * scale / 2,
        ringSize, 0, Math.PI * 2
      );
      ctx!.stroke();

      // Viewport indicator (if map is large enough)
      if (canvasW < COLS * T || canvasH < ROWS * T) {
        const vpX = mx + cameraRef.current.x * scale;
        const vpY = my + cameraRef.current.y * scale;
        const vpW = canvasW * scale;
        const vpH = canvasH * scale;
        ctx!.strokeStyle = '#58a6ff30';
        ctx!.lineWidth = 1;
        ctx!.strokeRect(vpX, vpY, vpW, vpH);
      }
    }

    // ── 게임 루프 ──────────────────────────────────────────────
    function gameLoop(time: number) {
      frameCountRef.current++;
      const w = canvas!.width;
      const h = canvas!.height;

      // Movement
      if (!movingRef.current && !popupOpenRef.current && time - lastMove > MOVE_SPEED) {
        const keys = keysRef.current;
        let dx = 0, dy = 0;
        if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) { dx = -1; animRef.current.dir = 1; }
        else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) { dx = 1; animRef.current.dir = 2; }
        else if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) { dy = -1; animRef.current.dir = 3; }
        else if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) { dy = 1; animRef.current.dir = 0; }

        if (dx !== 0 || dy !== 0) {
          const p = playerRef.current;
          const nx = p.x + dx, ny = p.y + dy;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !cMap[ny][nx]) {
            movingRef.current = true;
            tweenRef.current = { sx: p.x, sy: p.y, tx: nx, ty: ny, t: 0, active: true };
            playerRef.current = { x: nx, y: ny };
            animRef.current.walking = true;
            lastMove = time;

            const startTime = time;
            const tweenLoop = (t: number) => {
              const progress = Math.min(1, (t - startTime) / MOVE_SPEED);
              tweenRef.current.t = progress;
              if (progress >= 1) {
                tweenRef.current.active = false;
                movingRef.current = false;
                animRef.current.walking = false;
              } else {
                requestAnimationFrame(tweenLoop);
              }
            };
            requestAnimationFrame(tweenLoop);
          }
        }
      }

      // Nearby NPC detection
      const nearby = findNearbyRoom();
      setNearbyRoom(nearby);

      // Camera with smooth lerp
      const p = playerRef.current;
      let cpx = p.x * T, cpy = p.y * T;
      if (tweenRef.current.active) {
        const tw = tweenRef.current;
        cpx = (tw.sx + (tw.tx - tw.sx) * tw.t) * T;
        cpy = (tw.sy + (tw.ty - tw.sy) * tw.t) * T;
      }
      const targetCamX = Math.max(0, Math.min(COLS * T - w, cpx - w / 2 + T / 2));
      const targetCamY = Math.max(0, Math.min(ROWS * T - h, cpy - h / 2 + T / 2));
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.12;
      const camX = Math.round(cameraRef.current.x);
      const camY = Math.round(cameraRef.current.y);

      // Clear
      ctx!.fillStyle = '#0d1117';
      ctx!.fillRect(0, 0, w, h);

      // ── Outer wall border (thick with window pattern) ──
      const wallThick = 6;
      // Main wall color
      ctx!.fillStyle = '#2d3748';
      ctx!.fillRect(0 - camX, 0 - camY, COLS * T, wallThick);
      ctx!.fillRect(0 - camX, ROWS * T - wallThick - camY, COLS * T, wallThick);
      ctx!.fillRect(0 - camX, 0 - camY, wallThick, ROWS * T);
      ctx!.fillRect(COLS * T - wallThick - camX, 0 - camY, wallThick, ROWS * T);
      // Wall top highlight
      ctx!.fillStyle = '#4a5568';
      ctx!.fillRect(0 - camX, 0 - camY, COLS * T, 2);
      ctx!.fillRect(0 - camX, 0 - camY, 2, ROWS * T);
      // Exterior window pattern on top wall
      for (let wx = 3; wx < COLS - 3; wx += 4) {
        ctx!.fillStyle = '#58a6ff06';
        ctx!.fillRect(wx * T - camX, -camY, T * 2, wallThick);
      }
      // Exterior window pattern on bottom wall
      for (let wx = 3; wx < COLS - 3; wx += 4) {
        ctx!.fillStyle = '#58a6ff06';
        ctx!.fillRect(wx * T - camX, ROWS * T - wallThick - camY, T * 2, wallThick);
      }

      // Floor (corridor with directional pattern)
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const sx = x * T - camX, sy = y * T - camY;
          if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;

          // Check if inside a room
          let inRoom = false;
          for (const r of ROOMS) {
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
              inRoom = true;
              break;
            }
          }
          if (inRoom) continue; // Room floors are drawn by drawRoom

          // Corridor tiles — lighter with subtle pattern
          const isMainCorridor = (y >= 7 && y <= 9) || (y >= 15 && y <= 17) || (y >= 23 && y <= 25);
          if (isMainCorridor) {
            // Main corridor — lighter tiles with directional lines
            ctx!.fillStyle = (x + y) % 2 === 0 ? '#3a3d50' : '#36394c';
            ctx!.fillRect(sx, sy, T, T);
            // Directional center line
            if (y === 8 || y === 16 || y === 24) {
              ctx!.fillStyle = '#4a4d6015';
              ctx!.fillRect(sx, sy + T / 2 - 1, T, 2);
            }
          } else {
            // Regular corridor
            ctx!.fillStyle = (x + y) % 2 === 0 ? '#2e3044' : '#2a2c3e';
            ctx!.fillRect(sx, sy, T, T);
          }
          // Subtle grid
          ctx!.strokeStyle = '#20223008';
          ctx!.lineWidth = 0.5;
          ctx!.strokeRect(sx, sy, T, T);
        }
      }

      // Decorations
      drawDecorations(camX, camY);

      // Rooms
      for (const r of ROOMS) drawRoom(r, camX, camY);

      // Door nameplates
      for (const r of ROOMS) drawDoorNameplate(r, camX, camY);

      // NPCs
      for (const r of ROOMS) drawNPC(r, camX, camY);

      // Player
      drawPlayer(camX, camY);

      // Interact prompt
      if (nearby && !popupOpenRef.current) {
        drawInteractPrompt(nearby, camX, camY);
      }

      // ── HUD: Top bar ──
      const grad = ctx!.createLinearGradient(0, 0, 0, 40);
      grad.addColorStop(0, 'rgba(13,17,23,0.92)');
      grad.addColorStop(1, 'rgba(13,17,23,0)');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, 40);

      ctx!.fillStyle = '#c9a227';
      ctx!.font = 'bold 14px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('JARVIS MAP', w / 2, 22);

      // ── HUD: Bottom bar ──
      const gradBot = ctx!.createLinearGradient(0, h - 44, 0, h);
      gradBot.addColorStop(0, 'rgba(13,17,23,0)');
      gradBot.addColorStop(1, 'rgba(13,17,23,0.92)');
      ctx!.fillStyle = gradBot;
      ctx!.fillRect(0, h - 44, w, 44);

      ctx!.fillStyle = '#8b949e';
      ctx!.font = '11px monospace';
      ctx!.textAlign = 'left';
      const controlText = w < 600
        ? 'Tap NPC to interact'
        : '[WASD/Arrows] 이동   [E/Space] 대화   [ESC] 닫기';
      ctx!.fillText(controlText, 16, h - 14);

      // Time (KST)
      ctx!.textAlign = 'right';
      ctx!.fillStyle = '#c9a227';
      ctx!.font = '11px monospace';
      const now = new Date();
      ctx!.fillText(now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST', w - 16, h - 14);

      // Minimap
      drawMinimap(w, h);

      // ── Vignette overlay (subtle gradient at map edges) ──
      const vigSize = 80;
      const vigTop = ctx!.createLinearGradient(0, 0, 0, vigSize);
      vigTop.addColorStop(0, 'rgba(13,17,23,0.4)');
      vigTop.addColorStop(1, 'transparent');
      ctx!.fillStyle = vigTop;
      ctx!.fillRect(0, 0, w, vigSize);
      const vigBot = ctx!.createLinearGradient(0, h - vigSize, 0, h);
      vigBot.addColorStop(0, 'transparent');
      vigBot.addColorStop(1, 'rgba(13,17,23,0.4)');
      ctx!.fillStyle = vigBot;
      ctx!.fillRect(0, h - vigSize, w, vigSize);
      const vigLeft = ctx!.createLinearGradient(0, 0, vigSize, 0);
      vigLeft.addColorStop(0, 'rgba(13,17,23,0.3)');
      vigLeft.addColorStop(1, 'transparent');
      ctx!.fillStyle = vigLeft;
      ctx!.fillRect(0, 0, vigSize, h);
      const vigRight = ctx!.createLinearGradient(w - vigSize, 0, w, 0);
      vigRight.addColorStop(0, 'transparent');
      vigRight.addColorStop(1, 'rgba(13,17,23,0.3)');
      ctx!.fillStyle = vigRight;
      ctx!.fillRect(w - vigSize, 0, vigSize, h);

      animId = requestAnimationFrame(gameLoop);
    }

    // Start
    loadStatuses();
    const dataInterval = setInterval(loadStatuses, 15000);
    animId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(dataInterval);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
    };
  }, [loadStatuses, openBriefing, closePopup]);

  // ── 채팅 히스토리 ──────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; created_at: number }>>([]);

  const loadChatHistory = useCallback(async (teamId: string) => {
    try {
      const res = await fetch(`/api/game/chat/${teamId}`);
      if (!res.ok) return;
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    if (briefing) {
      const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
      loadChatHistory(room?.entityId || briefing.id);
    } else {
      setChatMessages([]);
    }
  }, [briefing, loadChatHistory]);

  // Chat auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── 메시지 전송 (인앱 대화) ──────────────────────────────────
  const sendMessage = async () => {
    if (!chatInput.trim() || !briefing) return;
    setChatLoading(true);
    setChatResp('');
    const msg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg, created_at: Math.floor(Date.now() / 1000) }]);

    try {
      const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
      const teamId = room?.entityId || briefing.id;
      const res = await fetch('/api/game/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, message: msg }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content, created_at: data.created_at }]);
    } catch {
      setChatResp('응답 실패 — 잠시 후 다시 시도해주세요');
    }
    setChatLoading(false);
  };

  // ── 상태 색상 ──────────────────────────────────────────────
  const stColor = (s: string) => {
    if (s === 'GREEN') return '#3fb950';
    if (s === 'RED') return '#f85149';
    return '#d29922';
  };

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0d1117' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh', touchAction: 'none' }}
      />

      {/* Hover tooltip */}
      {tooltipRoom && !popupOpen && (
        <div style={{
          position: 'fixed',
          left: Math.min(tooltipRoom.x + 12, window.innerWidth - 220),
          top: tooltipRoom.y - 50,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(22,27,34,0.95)',
          color: '#e6edf3',
          fontSize: 12,
          fontFamily: 'monospace',
          pointerEvents: 'none',
          border: `1px solid ${tooltipRoom.room.teamColor}40`,
          maxWidth: 200,
          zIndex: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            {tooltipRoom.room.emoji} {tooltipRoom.room.name}
          </div>
          <div style={{ color: '#8b949e', fontSize: 11, lineHeight: 1.4 }}>
            {tooltipRoom.room.description}
          </div>
        </div>
      )}

      {/* Nearby room indicator */}
      {nearbyRoom && !popupOpen && (
        <div style={{
          position: 'fixed', bottom: 54, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 18px', borderRadius: 10,
          background: 'rgba(0,0,0,0.8)', color: '#e6edf3',
          fontSize: 13, fontFamily: 'monospace', pointerEvents: 'none',
          border: `1px solid ${nearbyRoom.teamColor}50`,
          boxShadow: `0 0 12px ${nearbyRoom.teamColor}20`,
        }}>
          {nearbyRoom.emoji} {nearbyRoom.name} — {isMobile ? 'Tap으로 대화' : '[E]키로 대화'}
        </div>
      )}

      {/* ── Briefing Popup Overlay ── */}
      {popupOpen && (
        <div
          onClick={closePopup}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: isMobile ? '100%' : '100%',
              maxWidth: isMobile ? '100%' : 460,
              height: isMobile ? '100%' : 'auto',
              maxHeight: isMobile ? '100%' : '88vh',
              background: '#161b22',
              borderRadius: isMobile ? 0 : 14,
              border: isMobile ? 'none' : '1px solid #30363d',
              boxShadow: isMobile ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
              overflowY: 'auto',
              padding: isMobile ? '16px 16px 24px' : '22px 26px',
              color: '#e6edf3',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {popupLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: 36, marginBottom: 12, animation: 'spin 1s linear infinite' }}>
                  <span style={{ display: 'inline-block' }}>&#9696;</span>
                </div>
                <div style={{ fontSize: 13 }}>브리핑 로딩 중...</div>
              </div>
            ) : briefing ? (() => {
              const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
              const teamColorHex = room?.teamColor || '#58a6ff';
              return (
                <>
                  {/* Header with team color accent */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    marginBottom: 16, paddingBottom: 14,
                    borderBottom: `2px solid ${teamColorHex}30`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        fontSize: 40,
                        background: teamColorHex + '15',
                        borderRadius: 12,
                        width: 56, height: 56,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {briefing.emoji || briefing.avatar || briefing.icon || room?.emoji || '\uD83D\uDC64'}
                      </span>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{briefing.name}</div>
                        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3, lineHeight: 1.4 }}>
                          {briefing.roomDescription || briefing.description || room?.description || ''}
                        </div>
                        {(briefing.schedule || briefing.title) && (
                          <div style={{ fontSize: 11, color: '#6e7681', marginTop: 3 }}>
                            {briefing.schedule && <span>&#x1F4C5; {briefing.schedule}</span>}
                            {briefing.schedule && briefing.title && <span> &middot; </span>}
                            {briefing.title && <span>{briefing.title}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={closePopup}
                      style={{
                        background: '#21262d', border: '1px solid #30363d', color: '#8b949e',
                        cursor: 'pointer', fontSize: 16, padding: '4px 8px', lineHeight: 1,
                        borderRadius: 6, minWidth: 32, minHeight: 32,
                      }}
                      aria-label="닫기"
                    >&#x2715;</button>
                  </div>

                  {/* Status badge with explanation */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 14px', borderRadius: 10, marginBottom: 14,
                    background: stColor(briefing.status) + '10',
                    border: `1px solid ${stColor(briefing.status)}30`,
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: stColor(briefing.status),
                      boxShadow: `0 0 8px ${stColor(briefing.status)}60`,
                      flexShrink: 0,
                      marginTop: 3,
                    }} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: stColor(briefing.status) }}>
                        {briefing.status === 'GREEN' ? '정상' : briefing.status === 'RED' ? '이상' : '주의'}
                      </span>
                      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2, lineHeight: 1.4 }}>
                        {statusExplanation(briefing)}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{ marginBottom: 14 }}>
                    <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      &#x1F4CC; 현재 상태
                    </h4>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#c9d1d9' }}>{briefing.summary}</p>
                  </div>

                  {/* Alerts */}
                  {briefing.alerts && briefing.alerts.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      {briefing.alerts.map((a, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 8, marginBottom: 4,
                          background: '#f8514915', border: '1px solid #f8514925',
                          fontSize: 12, color: '#fca5a5', lineHeight: 1.4,
                        }}>
                          &#x26A0;&#xFE0F; {a}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 24h KPI cards */}
                  {briefing.stats && (
                    <div style={{ marginBottom: 14 }}>
                      <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        &#x1F4CA; 24시간 지표
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        {([
                          ['성공률', `${briefing.stats.rate}%`, briefing.stats.rate >= 90 ? '#3fb950' : briefing.stats.rate >= 70 ? '#d29922' : '#f85149'],
                          ['성공', String(briefing.stats.success), '#3fb950'],
                          ['실패', String(briefing.stats.failed), briefing.stats.failed > 0 ? '#f85149' : '#6e7681'],
                        ] as [string, string, string][]).map(([label, value, color], i) => (
                          <div key={i} style={{
                            background: '#0d1117', border: '1px solid #21262d',
                            borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 4, fontWeight: 500 }}>{label}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent activity timeline */}
                  {(briefing.recentActivity?.length || briefing.recentEvents?.length) ? (
                    <div style={{ marginBottom: 14 }}>
                      <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        &#x1F4CB; 최근 활동
                      </h4>
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {(briefing.recentActivity || briefing.recentEvents || []).slice(0, 10).map((a, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 8, padding: '6px 0',
                            fontSize: 12, borderBottom: '1px solid #21262d',
                            alignItems: 'center',
                          }}>
                            <span style={{ fontSize: 14, minWidth: 20, textAlign: 'center' }}>
                              {activityIcon(a.result)}
                            </span>
                            <span style={{ color: '#6e7681', minWidth: 44, fontFamily: 'monospace', fontSize: 11 }}>
                              {(a.time || '').slice(11, 16)}
                            </span>
                            <span style={{
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap', color: '#c9d1d9', flex: 1,
                            }}>
                              {a.task || (a as { event?: string }).event || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Board minutes */}
                  {(briefing.lastBoardMinutes || briefing.boardMinutes) && (
                    <div style={{ marginBottom: 14 }}>
                      <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        &#x1F4DD; 최근 보고
                      </h4>
                      <pre style={{
                        background: '#0d1117', border: '1px solid #21262d',
                        borderRadius: 10, padding: 14, fontSize: 11,
                        color: '#8b949e', whiteSpace: 'pre-wrap',
                        maxHeight: 130, overflowY: 'auto',
                        lineHeight: 1.6, margin: 0,
                      }}>
                        {briefing.lastBoardMinutes || briefing.boardMinutes?.content || ''}
                      </pre>
                    </div>
                  )}

                  {/* Chat section */}
                  <div style={{ marginTop: 6 }}>
                    <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      &#x1F4AC; 대화하기
                    </h4>
                    {/* Chat history — messenger-style bubbles */}
                    <div style={{
                      background: '#0d1117', border: '1px solid #21262d', borderRadius: 10,
                      padding: 12, maxHeight: 220, overflowY: 'auto', marginBottom: 8,
                      minHeight: chatMessages.length > 0 ? 80 : 48,
                    }}>
                      {chatMessages.length === 0 && (
                        <div style={{ fontSize: 12, color: '#484f58', textAlign: 'center', padding: 10 }}>
                          {briefing.name}에게 질문해보세요
                        </div>
                      )}
                      {chatMessages.map((m, i) => (
                        <div key={i} style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                          marginBottom: 8,
                        }}>
                          {m.role !== 'user' && (
                            <span style={{ fontSize: 10, color: '#6e7681', marginBottom: 2, marginLeft: 4 }}>
                              {briefing.emoji} {briefing.name}
                            </span>
                          )}
                          <div style={{
                            maxWidth: '85%', padding: '8px 12px',
                            borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                            background: m.role === 'user' ? '#238636' : '#21262d',
                            color: '#e6edf3',
                          }}>
                            {m.content}
                          </div>
                          <span style={{ fontSize: 9, color: '#484f58', marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                            {new Date(m.created_at * 1000).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ fontSize: 12, color: '#8b949e', padding: 6 }}>
                          <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>
                            {briefing.emoji} 응답 작성 중...
                          </span>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    {/* Input */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendMessage(); }}
                        placeholder={`${briefing.name}에게 질문...`}
                        style={{
                          flex: 1, background: '#0d1117',
                          border: '1px solid #21262d', borderRadius: 10,
                          padding: '10px 14px', color: '#e6edf3',
                          fontSize: 13, outline: 'none',
                          fontFamily: '-apple-system, sans-serif',
                          minHeight: 40,
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={chatLoading}
                        style={{
                          background: teamColorHex, border: 'none',
                          borderRadius: 10, padding: '10px 18px',
                          color: '#fff', fontSize: 13, cursor: 'pointer',
                          fontWeight: 600, opacity: chatLoading ? 0.5 : 1,
                          minHeight: 40, minWidth: 56,
                        }}
                      >전송</button>
                    </div>
                    {chatResp && (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#f85149' }}>{chatResp}</div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1F3E2;</div>
                <div style={{ fontSize: 13 }}>현재 데이터를 수집하고 있어요</div>
              </div>
            )}

            {/* Cron tiles grid (only for cron-center) */}
            {briefing && briefing.id === 'cron-center' && cronData.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  크론잡 현황
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {cronData.map((c, i) => (
                    <div
                      key={i}
                      onClick={() => setCronPopup(c)}
                      style={{
                        background: '#0d1117', border: '1px solid #21262d',
                        borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f180')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#21262d')}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: c.status === 'green' ? '#3fb950' : c.status === 'red' ? '#f85149' : '#d29922',
                      }} />
                      <span style={{ fontSize: 12, color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.korName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cron Tile Popup */}
      {cronPopup && (
        <div
          onClick={() => setCronPopup(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#161b22', border: '1px solid #6366f140',
              borderRadius: 14, padding: '20px 24px', minWidth: 280, maxWidth: 360,
              color: '#e6edf3', fontFamily: '-apple-system, sans-serif',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                background: cronPopup.status === 'green' ? '#3fb950' : cronPopup.status === 'red' ? '#f85149' : '#d29922',
                boxShadow: `0 0 8px ${cronPopup.status === 'green' ? '#3fb95060' : cronPopup.status === 'red' ? '#f8514960' : '#d2992260'}`,
              }} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{cronPopup.korName}</span>
            </div>
            <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.8 }}>
              <div>마지막 실행: {cronPopup.lastRun ? new Date(cronPopup.lastRun).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음'}</div>
              <div>결과: <span style={{ color: cronPopup.result === 'success' ? '#3fb950' : '#f85149', fontWeight: 600 }}>{cronPopup.result === 'success' ? '성공' : cronPopup.result === 'failed' ? '실패' : cronPopup.result || '대기'}</span></div>
              <div>스케줄: {cronPopup.nextSchedule || '정보 없음'}</div>
            </div>
            <button
              onClick={() => setCronPopup(null)}
              style={{
                marginTop: 14, width: '100%', padding: '8px 0',
                background: '#21262d', border: '1px solid #30363d',
                borderRadius: 8, color: '#8b949e', cursor: 'pointer', fontSize: 13,
              }}
            >닫기</button>
          </div>
        </div>
      )}

      {/* Mobile floating help button */}
      {isMobile && !popupOpen && (
        <>
          <button
            onClick={() => setShowMobileHelp(prev => !prev)}
            style={{
              position: 'fixed', bottom: 60, right: 16, zIndex: 600,
              width: 44, height: 44, borderRadius: '50%',
              background: '#21262d', border: '1px solid #30363d',
              color: '#8b949e', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >?</button>
          {showMobileHelp && (
            <div style={{
              position: 'fixed', bottom: 112, right: 16, zIndex: 600,
              background: 'rgba(22,27,34,0.95)', border: '1px solid #30363d',
              borderRadius: 12, padding: '14px 18px', maxWidth: 220,
              color: '#c9d1d9', fontSize: 12, fontFamily: 'monospace',
              lineHeight: 1.8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>조작 방법</div>
              <div>- 방을 탭하면 대화 시작</div>
              <div>- NPC를 탭해도 대화 가능</div>
              <div>- 팝업 바깥 탭으로 닫기</div>
            </div>
          )}
        </>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
