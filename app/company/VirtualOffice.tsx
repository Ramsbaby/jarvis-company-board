'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Jarvis Company HQ — Gather Town Style Virtual Office
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
    map[r.y + r.h - 1][doorX] = false;
    map[r.y + r.h - 1][doorX - 1] = false;
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

    // ── 룸별 가구 드로잉 ──────────────────────────────────────
    function drawRoomFurniture(r: RoomDef, rx: number, ry: number, _rw: number, _rh: number) {
      switch (r.id) {
        case 'ceo': {
          // Executive desk (large, dark wood)
          ctx!.fillStyle = '#5a3e1b';
          ctx!.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, T * 0.6);
          ctx!.fillStyle = '#4a2e10';
          ctx!.fillRect(rx + T * 1.5 + 2, ry + T * 1.8, 4, 8);
          ctx!.fillRect(rx + T * 5 - 6, ry + T * 1.8, 4, 8);
          // Large monitor
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx + T * 2.2, ry + T * 0.5, T * 1.8, T * 0.9);
          ctx!.fillStyle = '#c9a22780';
          ctx!.fillRect(rx + T * 2.4, ry + T * 0.6, T * 1.4, T * 0.6);
          ctx!.fillStyle = '#333';
          ctx!.fillRect(rx + T * 3, ry + T * 1.4, 6, 6);
          // Nameplate
          ctx!.fillStyle = '#c9a22760';
          ctx!.fillRect(rx + T * 2.5, ry + T * 1.2, T * 1.5, 6);
          ctx!.fillStyle = '#fff';
          ctx!.font = '6px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText('CEO', rx + T * 3.25, ry + T * 1.2 + 5);
          // Leather chair
          ctx!.fillStyle = '#5a3322';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3.2, ry + T * 2.6, 8, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = '#4a2812';
          ctx!.fillRect(rx + T * 3.2 - 6, ry + T * 2.6 - 12, 12, 8);
          break;
        }
        case 'infra-lead': {
          // Multiple monitors (3 screens)
          for (let i = 0; i < 3; i++) {
            const mx = rx + T * 1.2 + i * T * 1.5;
            ctx!.fillStyle = '#1a1a2e';
            ctx!.fillRect(mx, ry + T * 0.5, T * 1.2, T * 0.8);
            ctx!.fillStyle = '#22c55e30';
            ctx!.fillRect(mx + 3, ry + T * 0.6, T * 1.2 - 6, T * 0.6);
            // Terminal lines
            for (let j = 0; j < 3; j++) {
              ctx!.fillStyle = '#22c55e60';
              ctx!.fillRect(mx + 6, ry + T * 0.7 + j * 5, T * 0.6 + (j * 4), 2);
            }
            ctx!.fillStyle = '#333';
            ctx!.fillRect(mx + T * 0.5, ry + T * 1.3, 4, 5);
          }
          // Server rack mini
          ctx!.fillStyle = '#1e293b';
          ctx!.fillRect(rx + T * 5.5, ry + T * 0.8, T * 0.8, T * 2.2);
          for (let j = 0; j < 5; j++) {
            ctx!.fillStyle = j % 2 === 0 ? '#22c55e' : '#3b82f6';
            ctx!.beginPath();
            ctx!.arc(rx + T * 5.7, ry + T * 1.1 + j * 10, 2, 0, Math.PI * 2);
            ctx!.fill();
          }
          // Desk
          ctx!.fillStyle = '#374151';
          ctx!.fillRect(rx + T * 1, ry + T * 1.4, T * 4.2, T * 0.4);
          // Chair
          ctx!.fillStyle = '#1f2937';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3, ry + T * 2.6, 7, 0, Math.PI * 2);
          ctx!.fill();
          break;
        }
        case 'trend-lead': {
          // News ticker display
          ctx!.fillStyle = '#1e3a5f';
          ctx!.fillRect(rx + T * 1, ry + T * 0.4, T * 5, T * 1.2);
          ctx!.fillStyle = '#3b82f640';
          ctx!.fillRect(rx + T * 1.2, ry + T * 0.6, T * 4.6, T * 0.8);
          // Chart bars
          const barHeights = [12, 18, 8, 22, 15, 20, 10];
          for (let i = 0; i < barHeights.length; i++) {
            ctx!.fillStyle = '#3b82f680';
            ctx!.fillRect(rx + T * 1.5 + i * 18, ry + T * 1.2 - barHeights[i], 10, barHeights[i]);
          }
          // Ticker line
          ctx!.fillStyle = '#60a5fa';
          ctx!.fillRect(rx + T * 1, ry + T * 1.6, T * 5, 3);
          ctx!.fillStyle = '#93c5fd';
          ctx!.font = '6px monospace';
          ctx!.textAlign = 'left';
          ctx!.fillText('TREND ANALYSIS', rx + T * 1.2, ry + T * 1.58);
          // Desk
          ctx!.fillStyle = '#334155';
          ctx!.fillRect(rx + T * 1.5, ry + T * 2, T * 3, T * 0.4);
          // Chair
          ctx!.fillStyle = '#1e293b';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3, ry + T * 3, 7, 0, Math.PI * 2);
          ctx!.fill();
          break;
        }
        case 'finance': {
          // Stock chart on wall
          ctx!.fillStyle = '#0f2918';
          ctx!.fillRect(rx + T * 1, ry + T * 0.4, T * 4.5, T * 1.5);
          ctx!.strokeStyle = '#22c55e80';
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          const pts = [20, 15, 18, 10, 14, 8, 12, 6, 11, 9, 5];
          for (let i = 0; i < pts.length; i++) {
            const px = rx + T * 1.2 + i * 12;
            const py = ry + T * 0.6 + pts[i];
            if (i === 0) ctx!.moveTo(px, py);
            else ctx!.lineTo(px, py);
          }
          ctx!.stroke();
          // Candlesticks
          for (let i = 0; i < 6; i++) {
            const isUp = i % 2 === 0;
            ctx!.fillStyle = isUp ? '#22c55e80' : '#ef444480';
            ctx!.fillRect(rx + T * 1.3 + i * 20, ry + T * 1.3 + (isUp ? 0 : 4), 8, isUp ? 12 : 8);
          }
          // Desk
          ctx!.fillStyle = '#1c3324';
          ctx!.fillRect(rx + T * 1.5, ry + T * 2.2, T * 3, T * 0.4);
          // Chair
          ctx!.fillStyle = '#14532d';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3, ry + T * 3.2, 7, 0, Math.PI * 2);
          ctx!.fill();
          break;
        }
        case 'record-lead': {
          // Filing cabinets
          for (let i = 0; i < 2; i++) {
            const cx = rx + T * 0.5 + i * T * 1.3;
            ctx!.fillStyle = '#78601f';
            ctx!.fillRect(cx + T, ry + T * 0.5, T * 0.9, T * 2.5);
            for (let j = 0; j < 4; j++) {
              ctx!.fillStyle = '#92702a40';
              ctx!.fillRect(cx + T + 3, ry + T * 0.7 + j * 16, T * 0.9 - 6, 12);
              ctx!.fillStyle = '#c9a227';
              ctx!.fillRect(cx + T + T * 0.35, ry + T * 0.7 + j * 16 + 4, 6, 3);
            }
          }
          // Bookshelves
          ctx!.fillStyle = '#6b5514';
          ctx!.fillRect(rx + T * 4, ry + T * 0.5, T * 2, T * 2.5);
          for (let j = 0; j < 3; j++) {
            ctx!.fillStyle = '#8b6914';
            ctx!.fillRect(rx + T * 4, ry + T * 0.7 + j * T * 0.8, T * 2, 3);
            // Books
            const colors = ['#a0522d', '#8b4513', '#d2691e', '#cd853f'];
            for (let k = 0; k < 4; k++) {
              ctx!.fillStyle = colors[k];
              ctx!.fillRect(rx + T * 4.2 + k * 12, ry + T * 0.8 + j * T * 0.8, 8, T * 0.6);
            }
          }
          // Desk
          ctx!.fillStyle = '#6b5514';
          ctx!.fillRect(rx + T * 2, ry + T * 2.3, T * 2, T * 0.4);
          break;
        }
        case 'audit-lead': {
          // Shield icon on wall
          ctx!.fillStyle = '#dc262630';
          ctx!.beginPath();
          const shX = rx + T * 3.5, shY = ry + T * 0.8;
          ctx!.moveTo(shX, shY - 12);
          ctx!.lineTo(shX + 14, shY - 4);
          ctx!.lineTo(shX + 14, shY + 10);
          ctx!.lineTo(shX, shY + 16);
          ctx!.lineTo(shX - 14, shY + 10);
          ctx!.lineTo(shX - 14, shY - 4);
          ctx!.closePath();
          ctx!.fill();
          ctx!.strokeStyle = '#dc262680';
          ctx!.lineWidth = 1;
          ctx!.stroke();
          // Checkmark in shield
          ctx!.strokeStyle = '#fca5a5';
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.moveTo(shX - 6, shY + 2);
          ctx!.lineTo(shX - 1, shY + 7);
          ctx!.lineTo(shX + 8, shY - 4);
          ctx!.stroke();
          // Audit screens (2)
          for (let i = 0; i < 2; i++) {
            const sx = rx + T * 1.2 + i * T * 2.5;
            ctx!.fillStyle = '#1a1a2e';
            ctx!.fillRect(sx, ry + T * 1.5, T * 1.8, T * 1);
            ctx!.fillStyle = '#dc262620';
            ctx!.fillRect(sx + 3, ry + T * 1.6, T * 1.8 - 6, T * 0.8);
            // Checklist lines
            for (let j = 0; j < 3; j++) {
              ctx!.fillStyle = j === 1 ? '#f8514980' : '#3fb95080';
              ctx!.fillRect(sx + 6, ry + T * 1.7 + j * 7, 4, 4);
              ctx!.fillStyle = '#8b949e60';
              ctx!.fillRect(sx + 14, ry + T * 1.7 + j * 7 + 1, T * 0.8, 2);
            }
          }
          // Desk
          ctx!.fillStyle = '#4a1414';
          ctx!.fillRect(rx + T * 1.5, ry + T * 2.8, T * 3.5, T * 0.4);
          break;
        }
        case 'academy-lead': {
          // Bookshelves (tall)
          ctx!.fillStyle = '#4c1d95';
          ctx!.fillRect(rx + T * 4.5, ry + T * 0.4, T * 1.8, T * 3);
          for (let j = 0; j < 4; j++) {
            ctx!.fillStyle = '#6b21a8';
            ctx!.fillRect(rx + T * 4.5, ry + T * 0.6 + j * T * 0.75, T * 1.8, 3);
            const colors = ['#a855f7', '#c084fc', '#7c3aed', '#d8b4fe'];
            for (let k = 0; k < 3; k++) {
              ctx!.fillStyle = colors[k % 4] + '80';
              ctx!.fillRect(rx + T * 4.7 + k * 14, ry + T * 0.7 + j * T * 0.75, 10, T * 0.55);
            }
          }
          // Study lamp
          ctx!.fillStyle = '#fbbf24';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 2.2, ry + T * 1);
          ctx!.lineTo(rx + T * 2.5, ry + T * 0.5);
          ctx!.lineTo(rx + T * 2.8, ry + T * 1);
          ctx!.closePath();
          ctx!.fill();
          ctx!.fillStyle = '#92400e';
          ctx!.fillRect(rx + T * 2.45, ry + T * 1, 4, T * 0.6);
          // Light cone
          ctx!.fillStyle = '#fbbf2410';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 2.2, ry + T * 1);
          ctx!.lineTo(rx + T * 1.5, ry + T * 2.5);
          ctx!.lineTo(rx + T * 3.2, ry + T * 2.5);
          ctx!.lineTo(rx + T * 2.8, ry + T * 1);
          ctx!.closePath();
          ctx!.fill();
          // Desk
          ctx!.fillStyle = '#581c87';
          ctx!.fillRect(rx + T * 1.2, ry + T * 1.6, T * 3, T * 0.4);
          // Chair
          ctx!.fillStyle = '#3b0764';
          ctx!.beginPath();
          ctx!.arc(rx + T * 2.7, ry + T * 2.6, 7, 0, Math.PI * 2);
          ctx!.fill();
          break;
        }
        case 'brand-lead': {
          // Palette on wall
          ctx!.fillStyle = '#ea580c30';
          ctx!.beginPath();
          ctx!.ellipse(rx + T * 2.5, ry + T * 1, 18, 14, -0.3, 0, Math.PI * 2);
          ctx!.fill();
          const pColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'];
          for (let i = 0; i < 5; i++) {
            ctx!.fillStyle = pColors[i];
            ctx!.beginPath();
            ctx!.arc(rx + T * 2 + i * 8, ry + T * 0.9 + (i % 2) * 6, 3, 0, Math.PI * 2);
            ctx!.fill();
          }
          // Design board
          ctx!.fillStyle = '#f5f5f420';
          ctx!.fillRect(rx + T * 4, ry + T * 0.4, T * 2, T * 2);
          ctx!.strokeStyle = '#ea580c60';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 4, ry + T * 0.4, T * 2, T * 2);
          // Sticky notes
          const stickies = [{ c: '#fbbf24', x: 0, y: 0 }, { c: '#fb923c', x: 22, y: 4 }, { c: '#f87171', x: 8, y: 22 }, { c: '#a3e635', x: 30, y: 18 }];
          for (const s of stickies) {
            ctx!.fillStyle = s.c + '80';
            ctx!.fillRect(rx + T * 4.2 + s.x, ry + T * 0.6 + s.y, 16, 14);
          }
          // Desk
          ctx!.fillStyle = '#7c2d12';
          ctx!.fillRect(rx + T * 1.5, ry + T * 2.2, T * 3, T * 0.4);
          break;
        }
        case 'career-lead': {
          // Resume/briefcase display
          ctx!.fillStyle = '#0d948830';
          ctx!.fillRect(rx + T * 1, ry + T * 0.5, T * 2, T * 1.5);
          // Resume doc lines
          for (let j = 0; j < 5; j++) {
            ctx!.fillStyle = '#5eead480';
            ctx!.fillRect(rx + T * 1.3, ry + T * 0.7 + j * 8, T * 1.2 - j * 6, 2);
          }
          // Briefcase
          ctx!.fillStyle = '#134e4a';
          ctx!.fillRect(rx + T * 4, ry + T * 1.5, T * 1.5, T * 1);
          ctx!.fillStyle = '#0d9488';
          ctx!.fillRect(rx + T * 4.3, ry + T * 1.3, T * 0.9, 6);
          ctx!.fillStyle = '#c9a227';
          ctx!.fillRect(rx + T * 4.6, ry + T * 1.8, 8, 4);
          // Desk
          ctx!.fillStyle = '#115e59';
          ctx!.fillRect(rx + T * 1.5, ry + T * 2.3, T * 3, T * 0.4);
          break;
        }
        case 'standup': {
          // Podium
          ctx!.fillStyle = '#713f12';
          ctx!.fillRect(rx + T * 2.8, ry + T * 1.5, T * 1.4, T * 1.8);
          ctx!.fillStyle = '#854d0e';
          ctx!.fillRect(rx + T * 2.6, ry + T * 1.5, T * 1.8, T * 0.4);
          // Microphone
          ctx!.fillStyle = '#6b7280';
          ctx!.fillRect(rx + T * 3.4, ry + T * 0.5, 3, T * 1);
          ctx!.fillStyle = '#9ca3af';
          ctx!.beginPath();
          ctx!.arc(rx + T * 3.42, ry + T * 0.4, 5, 0, Math.PI * 2);
          ctx!.fill();
          // Spotlight beams
          ctx!.fillStyle = '#fbbf2408';
          ctx!.beginPath();
          ctx!.moveTo(rx + T * 1, ry);
          ctx!.lineTo(rx + T * 2.5, ry + T * 3);
          ctx!.lineTo(rx + T * 4.5, ry + T * 3);
          ctx!.lineTo(rx + T * 6, ry);
          ctx!.closePath();
          ctx!.fill();
          // Audience chairs (small dots)
          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 4; col++) {
              ctx!.fillStyle = '#78350f60';
              ctx!.beginPath();
              ctx!.arc(rx + T * 1.5 + col * T * 1.2, ry + T * 3 + row * 12, 4, 0, Math.PI * 2);
              ctx!.fill();
            }
          }
          break;
        }
        case 'ceo-digest': {
          // Long table
          ctx!.fillStyle = '#475569';
          ctx!.fillRect(rx + T * 1.5, ry + T * 1.5, T * 4, T * 1);
          ctx!.fillStyle = '#64748b20';
          ctx!.fillRect(rx + T * 1.7, ry + T * 1.6, T * 3.6, T * 0.8);
          // Chairs around table
          for (let i = 0; i < 4; i++) {
            ctx!.fillStyle = '#334155';
            ctx!.beginPath();
            ctx!.arc(rx + T * 2 + i * T * 1, ry + T * 1.2, 5, 0, Math.PI * 2);
            ctx!.fill();
            ctx!.beginPath();
            ctx!.arc(rx + T * 2 + i * T * 1, ry + T * 2.8, 5, 0, Math.PI * 2);
            ctx!.fill();
          }
          // Projector screen on wall
          ctx!.fillStyle = '#f1f5f910';
          ctx!.fillRect(rx + T * 2, ry + T * 0.3, T * 3, T * 0.9);
          ctx!.strokeStyle = '#94a3b840';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(rx + T * 2, ry + T * 0.3, T * 3, T * 0.9);
          break;
        }
        case 'cron-center': {
          // Cron monitoring wall — grid of small status tiles
          const tileW = T * 1.6;
          const tileH = T * 1.2;
          const tilesPerRow = 8;
          for (let i = 0; i < 16; i++) {
            const col = i % tilesPerRow;
            const row = Math.floor(i / tilesPerRow);
            const tx = rx + T * 1 + col * (tileW + 8);
            const ty = ry + T * 1.2 + row * (tileH + 8);
            ctx!.fillStyle = '#1e293b';
            ctx!.fillRect(tx, ty, tileW, tileH);
            ctx!.strokeStyle = '#334155';
            ctx!.lineWidth = 0.5;
            ctx!.strokeRect(tx, ty, tileW, tileH);
            // Status LED
            const blinkPhase = (frameCountRef.current + i * 11) % 80;
            const isLit = blinkPhase > 15;
            ctx!.fillStyle = isLit ? (i % 5 === 0 ? '#f85149' : '#3fb950') : '#3fb95030';
            ctx!.beginPath();
            ctx!.arc(tx + 8, ty + tileH / 2, 3, 0, Math.PI * 2);
            ctx!.fill();
            // Label placeholder
            ctx!.fillStyle = '#8b949e50';
            ctx!.fillRect(tx + 16, ty + tileH / 2 - 2, tileW - 24, 4);
          }
          // Title bar
          ctx!.fillStyle = '#6366f130';
          ctx!.fillRect(rx + T * 1, ry + T * 0.4, T * 6, T * 0.6);
          ctx!.fillStyle = '#a5b4fc';
          ctx!.font = 'bold 9px monospace';
          ctx!.textAlign = 'left';
          ctx!.fillText('CRON MONITORING CENTER', rx + T * 1.2, ry + T * 0.8);
          break;
        }
        case 'server-room': {
          // Server racks (3)
          for (let i = 0; i < 3; i++) {
            const sx = rx + T * 0.8 + i * T * 2;
            const sy = ry + T * 0.6;
            ctx!.fillStyle = '#1e293b';
            ctx!.fillRect(sx, sy, T * 1.4, T * 2.8);
            ctx!.strokeStyle = '#334155';
            ctx!.lineWidth = 1;
            ctx!.strokeRect(sx, sy, T * 1.4, T * 2.8);
            // LED rows with animation
            for (let j = 0; j < 8; j++) {
              const blinkPhase = (frameCountRef.current + i * 7 + j * 3) % 60;
              const isLit = blinkPhase > 10;
              if (j % 3 === 0) ctx!.fillStyle = isLit ? '#f85149' : '#f8514930';
              else if (j % 2 === 0) ctx!.fillStyle = isLit ? '#3fb950' : '#3fb95030';
              else ctx!.fillStyle = isLit ? '#58a6ff' : '#58a6ff30';
              ctx!.beginPath();
              ctx!.arc(sx + 6, sy + 8 + j * 10, 2, 0, Math.PI * 2);
              ctx!.fill();
              // Drive slots
              ctx!.fillStyle = '#0f172a';
              ctx!.fillRect(sx + 14, sy + 4 + j * 10, T * 0.7, 6);
            }
          }
          // Cable bundle at bottom
          ctx!.strokeStyle = '#3fb95020';
          ctx!.lineWidth = 2;
          for (let c = 0; c < 3; c++) {
            ctx!.beginPath();
            ctx!.moveTo(rx + T * 1 + c * T * 2, ry + T * 3.4);
            ctx!.bezierCurveTo(
              rx + T * 1.5 + c * T * 1.5, ry + T * 3.8,
              rx + T * 3, ry + T * 3.6 + c * 3,
              rx + T * 5, ry + T * 3.4,
            );
            ctx!.stroke();
          }
          break;
        }
      }
    }

    // ── 렌더 함수들 ────────────────────────────────────────────
    function drawRoom(r: RoomDef, camX: number, camY: number) {
      const rx = r.x * T - camX, ry = r.y * T - camY;
      const rw = r.w * T, rh = r.h * T;

      // Floor based on floorStyle
      switch (r.floorStyle) {
        case 'executive':
          // Dark wood pattern
          ctx!.fillStyle = '#2a1f0e';
          ctx!.fillRect(rx, ry, rw, rh);
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              ctx!.fillStyle = (x + y) % 2 === 0 ? '#33260f08' : '#1f180808';
              ctx!.fillRect(rx + x * T, ry + y * T, T, T);
            }
          }
          // Warm ambient glow
          const grdExec = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.6);
          grdExec.addColorStop(0, '#c9a22708');
          grdExec.addColorStop(1, 'transparent');
          ctx!.fillStyle = grdExec;
          ctx!.fillRect(rx, ry, rw, rh);
          break;
        case 'metal':
          // Metal grid for server room
          ctx!.fillStyle = '#0c0f14';
          ctx!.fillRect(rx, ry, rw, rh);
          ctx!.strokeStyle = '#1e293b';
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
          break;
        case 'stage':
          // Polished stage floor
          ctx!.fillStyle = '#1a1505';
          ctx!.fillRect(rx, ry, rw, rh);
          const grdStage = ctx!.createRadialGradient(rx + rw / 2, ry + rh * 0.4, 0, rx + rw / 2, ry + rh * 0.4, rw * 0.5);
          grdStage.addColorStop(0, '#eab30810');
          grdStage.addColorStop(1, 'transparent');
          ctx!.fillStyle = grdStage;
          ctx!.fillRect(rx, ry, rw, rh);
          break;
        default:
          // Carpet floor with team tint
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(rx, ry, rw, rh);
          // Carpet texture with team color
          ctx!.fillStyle = r.teamColor + '08';
          ctx!.fillRect(rx + T * 0.5, ry + T * 0.5, rw - T, rh - T);
          break;
      }

      // Walls — thicker and more defined
      ctx!.strokeStyle = r.teamColor + '50';
      ctx!.lineWidth = 3;
      ctx!.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

      // Wall top (3D depth) with team color
      ctx!.fillStyle = r.teamColor + '35';
      ctx!.fillRect(rx, ry, rw, 6);

      // Side wall shading
      ctx!.fillStyle = r.teamColor + '12';
      ctx!.fillRect(rx, ry, 4, rh);
      ctx!.fillRect(rx + rw - 4, ry, 4, rh);

      // Door opening (bottom center)
      const doorX = (r.x + Math.floor(r.w / 2)) * T - camX;
      ctx!.fillStyle = '#3a3a52';
      ctx!.fillRect(doorX - T, ry + rh - 6, T * 2, 8);
      // Door frame highlight with team color
      ctx!.fillStyle = r.teamColor + '80';
      ctx!.fillRect(doorX - T, ry + rh - 3, T * 2, 3);

      // Draw unique furniture per room
      drawRoomFurniture(r, rx, ry, rw, rh);

      // Room name plate (inside top)
      ctx!.font = 'bold 11px monospace';
      const plateText = `${r.emoji} ${r.name}`;
      const plateW = ctx!.measureText(plateText).width + 20;
      ctx!.fillStyle = r.teamColor + '25';
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 4);
      ctx!.fill();
      ctx!.strokeStyle = r.teamColor + '40';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 4);
      ctx!.stroke();
      ctx!.fillStyle = '#d0d8e0';
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
      const nx = r.npcX * T - camX + T / 2;
      const ny = r.npcY * T - camY + T / 2;
      const state = npcStatesRef.current[r.id];
      const stColor = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';

      // Shadow
      ctx!.fillStyle = 'rgba(0,0,0,0.35)';
      ctx!.beginPath();
      ctx!.ellipse(nx, ny + 14, 9, 4, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Body (team color)
      ctx!.fillStyle = r.teamColor + '90';
      ctx!.fillRect(nx - 7, ny - 1, 14, 15);
      ctx!.fillStyle = r.teamColor + '30';
      ctx!.fillRect(nx - 7, ny - 1, 4, 15);

      // Head (skin)
      ctx!.fillStyle = '#f0d0a0';
      ctx!.beginPath();
      ctx!.arc(nx, ny - 7, 8, 0, Math.PI * 2);
      ctx!.fill();

      // Hair
      ctx!.fillStyle = '#3a2a1a';
      ctx!.beginPath();
      ctx!.arc(nx, ny - 10, 8, Math.PI, Math.PI * 2);
      ctx!.fill();

      // Eyes
      ctx!.fillStyle = '#222';
      ctx!.fillRect(nx - 3, ny - 8, 2, 2);
      ctx!.fillRect(nx + 2, ny - 8, 2, 2);

      // Mouth
      ctx!.fillStyle = '#c4907060';
      ctx!.fillRect(nx - 1, ny - 4, 3, 1);

      // Status LED with glow
      ctx!.save();
      ctx!.shadowColor = stColor;
      ctx!.shadowBlur = 8;
      ctx!.fillStyle = stColor;
      ctx!.beginPath();
      ctx!.arc(nx, ny - 20, 4, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // LED ring pulse
      const pulse = Math.sin(frameCountRef.current * 0.05) * 0.3 + 0.7;
      ctx!.strokeStyle = stColor + Math.round(pulse * 96).toString(16).padStart(2, '0');
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(nx, ny - 20, 6 + Math.sin(frameCountRef.current * 0.03) * 1.5, 0, Math.PI * 2);
      ctx!.stroke();

      // Name label
      ctx!.fillStyle = '#b0b8c4';
      ctx!.font = 'bold 9px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText(r.name, nx, ny + 26);

      // Status text (current task)
      if (state?.task) {
        const taskLabel = state.task.length > 14 ? state.task.slice(0, 13) + '\u2026' : state.task;
        ctx!.fillStyle = '#8b949e';
        ctx!.font = '8px monospace';
        ctx!.fillText(taskLabel, nx, ny + 36);
      }
    }

    function drawPlayer(camX: number, camY: number) {
      const p = playerRef.current;
      let px: number, py: number;

      if (tweenRef.current.active) {
        const tw = tweenRef.current;
        px = (tw.sx + (tw.tx - tw.sx) * tw.t) * T - camX + T / 2;
        py = (tw.sy + (tw.ty - tw.sy) * tw.t) * T - camY + T / 2;
      } else {
        px = p.x * T - camX + T / 2;
        py = p.y * T - camY + T / 2;
      }

      // Shadow
      ctx!.fillStyle = 'rgba(0,0,0,0.45)';
      ctx!.beginPath();
      ctx!.ellipse(px, py + 14, 9, 4, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Body
      ctx!.fillStyle = '#58a6ff';
      ctx!.fillRect(px - 7, py - 1, 14, 15);
      ctx!.fillStyle = '#58a6ff30';
      ctx!.fillRect(px - 7, py - 1, 4, 15);

      // Head
      ctx!.fillStyle = '#f0d0a0';
      ctx!.beginPath();
      ctx!.arc(px, py - 7, 8, 0, Math.PI * 2);
      ctx!.fill();

      // Hair
      ctx!.fillStyle = '#2a1a0a';
      ctx!.beginPath();
      ctx!.arc(px, py - 10, 8, Math.PI, Math.PI * 2);
      ctx!.fill();

      // Eyes
      ctx!.fillStyle = '#222';
      ctx!.fillRect(px - 3, py - 8, 2, 2);
      ctx!.fillRect(px + 2, py - 8, 2, 2);

      // Name tag glow
      ctx!.save();
      ctx!.shadowColor = '#58a6ff';
      ctx!.shadowBlur = 6;
      ctx!.fillStyle = '#58a6ff';
      ctx!.font = 'bold 10px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('YOU', px, py - 20);
      ctx!.restore();
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
      // Potted plants at corridor intersections
      const plantPositions = [
        { x: 9.5, y: 8 }, { x: 18.5, y: 8 }, { x: 27.5, y: 8 },
        { x: 9.5, y: 16 }, { x: 18.5, y: 16 }, { x: 27.5, y: 16 },
        { x: 9.5, y: 24 }, { x: 18.5, y: 24 }, { x: 27.5, y: 24 },
      ];
      for (const pl of plantPositions) {
        const px = pl.x * T - camX;
        const py = pl.y * T - camY;
        // Pot
        ctx!.fillStyle = '#92400e';
        ctx!.fillRect(px - 5, py, 10, 8);
        ctx!.fillStyle = '#78350f';
        ctx!.fillRect(px - 6, py - 2, 12, 3);
        // Leaves
        ctx!.fillStyle = '#16a34a90';
        ctx!.beginPath();
        ctx!.arc(px, py - 6, 6, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = '#22c55e70';
        ctx!.beginPath();
        ctx!.arc(px - 4, py - 9, 4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.beginPath();
        ctx!.arc(px + 4, py - 8, 5, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Water cooler near lobby area
      const wcx = 1 * T - camX + T / 2;
      const wcy = 8 * T - camY;
      ctx!.fillStyle = '#bae6fd40';
      ctx!.fillRect(wcx - 4, wcy - 10, 8, 10);
      ctx!.fillStyle = '#7dd3fc60';
      ctx!.fillRect(wcx - 4, wcy - 10, 8, 4);
      ctx!.fillStyle = '#64748b';
      ctx!.fillRect(wcx - 5, wcy, 10, 5);

      // Reception sign near entrance
      const signX = 20 * T - camX;
      const signY = 0.2 * T - camY;
      ctx!.fillStyle = '#c9a22730';
      ctx!.beginPath();
      ctx!.roundRect(signX - 60, signY, 120, 18, 4);
      ctx!.fill();
      ctx!.fillStyle = '#c9a227';
      ctx!.font = 'bold 10px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('JARVIS COMPANY HQ', signX, signY + 13);
    }

    function drawMinimap(canvasW: number, canvasH: number) {
      const mmW = 160, mmH = 110;
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

      for (const r of ROOMS) {
        const state = npcStatesRef.current[r.id];
        const color = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
        const isCurrentRoom = r.id === playerRoomId;

        ctx!.fillStyle = isCurrentRoom ? (color + '50') : (color + '20');
        ctx!.fillRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);
        ctx!.strokeStyle = isCurrentRoom ? '#fff' : (color + '60');
        ctx!.lineWidth = isCurrentRoom ? 2 : 1;
        ctx!.strokeRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);

        // Abbreviated room name
        const abbrev = abbrevNames[r.id] || '';
        if (abbrev) {
          ctx!.fillStyle = isCurrentRoom ? '#fff' : '#8b949e';
          ctx!.font = isCurrentRoom ? 'bold 6px monospace' : '5px monospace';
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

      // ── Outer wall border ──
      const wallThick = 4;
      ctx!.fillStyle = '#2d3748';
      // Top wall
      ctx!.fillRect(0 - camX, 0 - camY, COLS * T, wallThick);
      // Bottom wall
      ctx!.fillRect(0 - camX, ROWS * T - wallThick - camY, COLS * T, wallThick);
      // Left wall
      ctx!.fillRect(0 - camX, 0 - camY, wallThick, ROWS * T);
      // Right wall
      ctx!.fillRect(COLS * T - wallThick - camX, 0 - camY, wallThick, ROWS * T);

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
      ctx!.fillText('JARVIS COMPANY HQ', w / 2, 22);

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
