'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Jarvis Company HQ — Gather Town Style Virtual Office
   Pure Canvas 2D, no external game engine
   ═══════════════════════════════════════════════════════════════════ */

const T = 32; // tile size
const COLS = 40;
const ROWS = 26;
const MOVE_SPEED = 130; // ms per tile

// ── 방 정의 ────────────────────────────────────────────────────
interface RoomDef {
  id: string;
  entityId: string; // API entity ID for /api/entity/{id}/briefing
  name: string;
  emoji: string;
  x: number; y: number; w: number; h: number;
  type: 'team' | 'server' | 'meeting';
  npcX: number; npcY: number;
  teamColor: string;
}

const ROOMS: RoomDef[] = [
  // Row 1 (y=2)
  { id: 'ceo',           entityId: 'ceo',           name: 'CEO실',     emoji: '👔', x: 2,  y: 2,  w: 7, h: 5, type: 'meeting', npcX: 5,  npcY: 4,  teamColor: '#c9a227' },
  { id: 'infra-lead',    entityId: 'infra-lead',    name: '인프라팀',  emoji: '🖥️', x: 11, y: 2,  w: 7, h: 5, type: 'team',    npcX: 14, npcY: 4,  teamColor: '#3b82f6' },
  { id: 'trend-lead',    entityId: 'trend-lead',    name: '정보팀',    emoji: '📡', x: 20, y: 2,  w: 7, h: 5, type: 'team',    npcX: 23, npcY: 4,  teamColor: '#06b6d4' },
  { id: 'finance',       entityId: '',              name: '재무팀',    emoji: '📊', x: 29, y: 2,  w: 7, h: 5, type: 'team',    npcX: 32, npcY: 4,  teamColor: '#22c55e' },
  // Row 2 (y=10)
  { id: 'record-lead',   entityId: 'record-lead',   name: '기록팀',    emoji: '📁', x: 2,  y: 10, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 12, teamColor: '#a78bfa' },
  { id: 'audit-lead',    entityId: 'audit-lead',    name: '감사팀',    emoji: '🔒', x: 11, y: 10, w: 7, h: 5, type: 'team',    npcX: 14, npcY: 12, teamColor: '#f97316' },
  { id: 'academy-lead',  entityId: 'academy-lead',  name: '학습팀',    emoji: '📚', x: 20, y: 10, w: 7, h: 5, type: 'team',    npcX: 23, npcY: 12, teamColor: '#ec4899' },
  { id: 'brand-lead',    entityId: 'brand-lead',    name: '브랜드팀',  emoji: '🎨', x: 29, y: 10, w: 7, h: 5, type: 'team',    npcX: 32, npcY: 12, teamColor: '#f43f5e' },
  // Row 3 (y=18)
  { id: 'career-lead',   entityId: 'career-lead',   name: '커리어팀',  emoji: '💼', x: 2,  y: 18, w: 7, h: 5, type: 'team',    npcX: 5,  npcY: 20, teamColor: '#14b8a6' },
  { id: 'standup',       entityId: '',              name: '스탠드업홀', emoji: '🎤', x: 11, y: 18, w: 7, h: 5, type: 'meeting', npcX: 14, npcY: 20, teamColor: '#eab308' },
  { id: 'ceo-digest',    entityId: '',              name: '회의실',    emoji: '🗂️', x: 20, y: 18, w: 7, h: 5, type: 'meeting', npcX: 23, npcY: 20, teamColor: '#94a3b8' },
  { id: 'server-room',   entityId: 'cron-engine',   name: '서버룸',    emoji: '🖥️', x: 29, y: 18, w: 7, h: 5, type: 'server',  npcX: 32, npcY: 20, teamColor: '#64748b' },
];

// agent-live teamId → room id mapping
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
}

// ── NPC 상태 ───────────────────────────────────────────────────
interface NpcState {
  status: 'green' | 'yellow' | 'red';
  task: string;
  activity: string;
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

  useEffect(() => { popupOpenRef.current = popupOpen; }, [popupOpen]);

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

      // server-room additional check via cron-engine
      try {
        const hRes = await fetch('/api/entity/cron-engine/briefing');
        if (hRes.ok) {
          const h = await hRes.json() as BriefingData;
          states['server-room'] = {
            status: h.status === 'GREEN' ? 'green' : h.status === 'RED' ? 'red' : 'yellow',
            task: 'cron-engine', activity: h.summary || '',
          };
        }
      } catch { /* skip */ }

      npcStatesRef.current = states;
    } catch { /* retry next interval */ }
  }, []);

  const openBriefing = useCallback(async (room: RoomDef) => {
    setPopupOpen(true);
    setPopupLoading(true);
    setBriefing(null);
    setChatResp('');

    const entityId = room.entityId;

    // If there's an entity ID, try the entity briefing API first
    if (entityId) {
      try {
        const res = await fetch(`/api/entity/${entityId}/briefing`);
        if (res.ok) {
          const data = await res.json() as BriefingData;
          // Ensure emoji is set
          if (!data.emoji && !data.avatar && !data.icon) {
            data.emoji = room.emoji;
          }
          setBriefing(data);
          setPopupLoading(false);
          return;
        }
      } catch { /* fall through to agent-live */ }
    }

    // Fallback: use agent-live data
    try {
      const res2 = await fetch('/api/agent-live');
      if (!res2.ok) { setPopupLoading(false); return; }
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
          stats: {
            total,
            success: team.successCount24h || 0,
            failed: team.failCount24h || 0,
            rate: total > 0 ? Math.round((team.successCount24h || 0) / total * 100) : 0,
          },
          recentActivity: team.recentCrons || [],
        });
      } else {
        // No data available — show basic info
        setBriefing({
          id: room.id,
          name: room.name,
          emoji: room.emoji,
          status: 'YELLOW',
          summary: '데이터를 불러올 수 없습니다.',
        });
      }
    } catch {
      setBriefing({
        id: room.id,
        name: room.name,
        emoji: room.emoji,
        status: 'YELLOW',
        summary: 'API 연결 실패',
      });
    }

    setPopupLoading(false);
  }, []);

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
      // Don't process game keys if popup input is focused
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

    // ── 렌더 함수들 ────────────────────────────────────────────

    function drawRoom(r: RoomDef, camX: number, camY: number) {
      const rx = r.x * T - camX, ry = r.y * T - camY;
      const rw = r.w * T, rh = r.h * T;

      // Floor
      if (r.type === 'server') {
        ctx!.fillStyle = '#12141e';
      } else if (r.type === 'meeting') {
        ctx!.fillStyle = '#22202e';
      } else {
        ctx!.fillStyle = '#1e1e30';
      }
      ctx!.fillRect(rx, ry, rw, rh);

      // Carpet center
      ctx!.fillStyle = r.teamColor + '10';
      ctx!.fillRect(rx + T, ry + T, rw - T * 2, rh - T * 2);

      // Walls
      ctx!.strokeStyle = '#4a5568';
      ctx!.lineWidth = 2;
      ctx!.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

      // Wall top (3D depth)
      ctx!.fillStyle = '#5a6577';
      ctx!.fillRect(rx, ry, rw, 5);

      // Side wall shading
      ctx!.fillStyle = '#4a556820';
      ctx!.fillRect(rx, ry, 3, rh);
      ctx!.fillRect(rx + rw - 3, ry, 3, rh);

      // Door opening (bottom center)
      const doorX = (r.x + Math.floor(r.w / 2)) * T - camX;
      ctx!.fillStyle = '#3a3a52';
      ctx!.fillRect(doorX - T, ry + rh - 5, T * 2, 7);
      // Door frame highlight
      ctx!.fillStyle = r.teamColor + '60';
      ctx!.fillRect(doorX - T, ry + rh - 2, T * 2, 2);

      // Furniture: desk + monitor
      if (r.type !== 'server') {
        const deskX = (r.x + 2) * T - camX;
        const deskY = (r.y + 1) * T - camY;
        // Desk
        ctx!.fillStyle = '#8b6914';
        ctx!.fillRect(deskX, deskY + 8, T * 2.5, T * 0.5);
        // Desk legs
        ctx!.fillStyle = '#6b5010';
        ctx!.fillRect(deskX + 2, deskY + 8 + T * 0.5, 3, 6);
        ctx!.fillRect(deskX + T * 2.5 - 5, deskY + 8 + T * 0.5, 3, 6);
        // Monitor
        ctx!.fillStyle = '#1a1a2e';
        ctx!.fillRect(deskX + 10, deskY - 2, 20, 14);
        ctx!.fillStyle = r.teamColor + '90';
        ctx!.fillRect(deskX + 12, deskY, 16, 10);
        // Monitor stand
        ctx!.fillStyle = '#333';
        ctx!.fillRect(deskX + 18, deskY + 12, 4, 4);

        // Chair
        ctx!.fillStyle = '#3a3a5a';
        ctx!.beginPath();
        ctx!.arc(deskX + 20, deskY + T + 14, 6, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Server room: racks
      if (r.type === 'server') {
        for (let i = 0; i < 3; i++) {
          const sx = (r.x + 1 + i * 2) * T - camX;
          const sy = (r.y + 1) * T - camY;
          // Rack body
          ctx!.fillStyle = '#1a1a2e';
          ctx!.fillRect(sx, sy, T * 1.3, T * 2.5);
          // Rack border
          ctx!.strokeStyle = '#2a2a4e';
          ctx!.lineWidth = 1;
          ctx!.strokeRect(sx, sy, T * 1.3, T * 2.5);
          // LED rows
          for (let j = 0; j < 6; j++) {
            ctx!.fillStyle = j % 3 === 0 ? '#f85149' : j % 2 === 0 ? '#3fb950' : '#58a6ff';
            ctx!.beginPath();
            ctx!.arc(sx + 6, sy + 8 + j * 12, 2, 0, Math.PI * 2);
            ctx!.fill();
            // Drive slot
            ctx!.fillStyle = '#252540';
            ctx!.fillRect(sx + 14, sy + 4 + j * 12, T * 0.7, 8);
          }
        }
        // Cable bundle
        ctx!.strokeStyle = '#3fb95040';
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo((r.x + 1) * T - camX + 5, (r.y + 1) * T - camY + T * 2.5);
        ctx!.lineTo((r.x + 5) * T - camX + 5, (r.y + 1) * T - camY + T * 2.5);
        ctx!.stroke();
      }

      // Room name plate
      ctx!.fillStyle = r.teamColor + '30';
      const plateW = ctx!.measureText(`${r.emoji} ${r.name}`).width + 16;
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 8, plateW, 18, 4);
      ctx!.fill();

      ctx!.fillStyle = '#c0c8d4';
      ctx!.font = '11px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText(`${r.emoji} ${r.name}`, rx + rw / 2, ry + 22);
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
      // Body highlight
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

      // LED ring
      ctx!.strokeStyle = stColor + '60';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(nx, ny - 20, 6, 0, Math.PI * 2);
      ctx!.stroke();

      // Name label
      ctx!.fillStyle = '#b0b8c4';
      ctx!.font = 'bold 9px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText(r.name, nx, ny + 26);

      // Status text (current task)
      if (state?.task) {
        const taskLabel = state.task.length > 14 ? state.task.slice(0, 13) + '…' : state.task;
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

      // Name tag
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

    function drawMinimap(canvasW: number) {
      const mmW = 150, mmH = 100;
      const mx = canvasW - mmW - 12, my = 36;
      const scale = Math.min(mmW / (COLS * T), mmH / (ROWS * T));

      // Background
      ctx!.fillStyle = 'rgba(13,17,23,0.85)';
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

      // Rooms
      for (const r of ROOMS) {
        const state = npcStatesRef.current[r.id];
        const color = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
        ctx!.fillStyle = color + '30';
        ctx!.fillRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);
        ctx!.strokeStyle = color + '80';
        ctx!.lineWidth = 1;
        ctx!.strokeRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);
      }

      // Player dot
      const p = playerRef.current;
      ctx!.fillStyle = '#58a6ff';
      ctx!.beginPath();
      ctx!.arc(mx + p.x * T * scale + T * scale / 2, my + p.y * T * scale + T * scale / 2, 3, 0, Math.PI * 2);
      ctx!.fill();
      // Player glow
      ctx!.strokeStyle = '#58a6ff80';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(mx + p.x * T * scale + T * scale / 2, my + p.y * T * scale + T * scale / 2, 5, 0, Math.PI * 2);
      ctx!.stroke();
    }

    // ── 게임 루프 ──────────────────────────────────────────────
    function gameLoop(time: number) {
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

      // Floor (checkerboard corridor)
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const sx = x * T - camX, sy = y * T - camY;
          if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
          ctx!.fillStyle = (x + y) % 2 === 0 ? '#3a3a52' : '#353550';
          ctx!.fillRect(sx, sy, T, T);
          // Subtle grid line
          ctx!.strokeStyle = '#2a2a4010';
          ctx!.lineWidth = 0.5;
          ctx!.strokeRect(sx, sy, T, T);
        }
      }

      // Rooms
      for (const r of ROOMS) drawRoom(r, camX, camY);

      // NPCs
      for (const r of ROOMS) drawNPC(r, camX, camY);

      // Player
      drawPlayer(camX, camY);

      // Interact prompt
      if (nearby && !popupOpenRef.current) {
        drawInteractPrompt(nearby, camX, camY);
      }

      // ── HUD: Top bar ──
      const grad = ctx!.createLinearGradient(0, 0, 0, 36);
      grad.addColorStop(0, 'rgba(13,17,23,0.9)');
      grad.addColorStop(1, 'rgba(13,17,23,0)');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, 36);

      ctx!.fillStyle = '#58a6ff';
      ctx!.font = 'bold 14px monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText('🏢 JARVIS COMPANY HQ', w / 2, 22);

      // ── HUD: Bottom bar ──
      const gradBot = ctx!.createLinearGradient(0, h - 40, 0, h);
      gradBot.addColorStop(0, 'rgba(13,17,23,0)');
      gradBot.addColorStop(1, 'rgba(13,17,23,0.9)');
      ctx!.fillStyle = gradBot;
      ctx!.fillRect(0, h - 40, w, 40);

      ctx!.fillStyle = '#8b949e';
      ctx!.font = '11px monospace';
      ctx!.textAlign = 'left';
      ctx!.fillText('[←↑↓→/WASD] 이동   [E/Space] 대화   [ESC] 닫기', 16, h - 12);

      // Time (KST)
      ctx!.textAlign = 'right';
      ctx!.fillStyle = '#58a6ff';
      ctx!.font = '11px monospace';
      const now = new Date();
      ctx!.fillText(now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST', w - 16, h - 12);

      // Minimap
      drawMinimap(w);

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
      setChatResp('❌ 응답 실패');
    }
    setChatLoading(false);
  };

  // ── 상태 색상 ──────────────────────────────────────────────
  const stColor = (s: string) => {
    if (s === 'GREEN') return '#3fb950';
    if (s === 'RED') return '#f85149';
    return '#d29922';
  };

  const statusLabel = (s: string) => {
    if (s === 'GREEN') return '정상';
    if (s === 'RED') return '이상';
    return '주의';
  };

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0d1117' }}>
      {/* Full-viewport canvas — never shrinks */}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh' }}
      />

      {/* Nearby room indicator (non-blocking) */}
      {nearbyRoom && !popupOpen && (
        <div style={{
          position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 8,
          background: 'rgba(0,0,0,0.7)', color: '#e6edf3',
          fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none',
          border: '1px solid #30363d',
        }}>
          {nearbyRoom.emoji} {nearbyRoom.name} — [E]키로 대화
        </div>
      )}

      {/* ── Briefing Popup Overlay ── */}
      {popupOpen && (
        <div
          onClick={closePopup}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420, maxHeight: '85vh',
              background: '#161b22', borderRadius: 12,
              border: '1px solid #30363d',
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
              overflowY: 'auto', padding: '20px 24px',
              color: '#e6edf3', fontFamily: '-apple-system, sans-serif',
            }}
          >
            {popupLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div>로딩 중...</div>
              </div>
            ) : briefing ? (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 36 }}>{briefing.emoji || briefing.avatar || briefing.icon || '👤'}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{briefing.name}</div>
                      {(briefing.title || briefing.description) && (
                        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{briefing.title || briefing.description}</div>
                      )}
                      {briefing.schedule && (
                        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>📅 {briefing.schedule}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={closePopup}
                    style={{
                      background: 'none', border: 'none', color: '#8b949e',
                      cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1,
                    }}
                  >✕</button>
                </div>

                {/* Status badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 16,
                  fontSize: 12, fontWeight: 600,
                  background: stColor(briefing.status) + '18',
                  color: stColor(briefing.status),
                  border: `1px solid ${stColor(briefing.status)}40`,
                }}>
                  ● {statusLabel(briefing.status)}
                </span>

                {/* Summary */}
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ color: '#8b949e', fontSize: 13, margin: '0 0 6px', fontWeight: 600 }}>📌 현재 상태</h4>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{briefing.summary}</p>
                </div>

                {/* Alerts */}
                {briefing.alerts && briefing.alerts.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {briefing.alerts.map((a, i) => (
                      <div key={i} style={{
                        padding: '6px 10px', borderRadius: 6, marginBottom: 4,
                        background: '#f8514920', border: '1px solid #f8514930',
                        fontSize: 11, color: '#f85149',
                      }}>
                        ⚠️ {a}
                      </div>
                    ))}
                  </div>
                )}

                {/* 24h KPI cards */}
                {briefing.stats && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ color: '#8b949e', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>📊 24h 지표</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {([
                        ['성공률', `${briefing.stats.rate}%`, briefing.stats.rate >= 90 ? '#3fb950' : briefing.stats.rate >= 70 ? '#d29922' : '#f85149'],
                        ['성공', String(briefing.stats.success), '#3fb950'],
                        ['실패', String(briefing.stats.failed), briefing.stats.failed > 0 ? '#f85149' : '#8b949e'],
                      ] as [string, string, string][]).map(([label, value, color], i) => (
                        <div key={i} style={{
                          background: '#0d1117', border: '1px solid #21262d',
                          borderRadius: 8, padding: '8px 6px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent activity timeline */}
                {(briefing.recentActivity?.length || briefing.recentEvents?.length) ? (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ color: '#8b949e', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>📋 최근 활동</h4>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {(briefing.recentActivity || briefing.recentEvents || []).slice(0, 10).map((a, i) => {
                        const resultColor =
                          a.result === 'SUCCESS' || a.result === 'success' ? '#3fb950' :
                          a.result === 'FAILED' || a.result === 'failed' ? '#f85149' :
                          '#d29922';
                        return (
                          <div key={i} style={{
                            display: 'flex', gap: 8, padding: '5px 0',
                            fontSize: 11, borderBottom: '1px solid #21262d',
                            alignItems: 'center',
                          }}>
                            <span style={{ color: '#6e7681', minWidth: 42, fontFamily: 'monospace' }}>
                              {(a.time || '').slice(11, 16)}
                            </span>
                            <span style={{
                              color: resultColor, fontWeight: 600, minWidth: 56,
                              fontSize: 10,
                            }}>
                              {a.result}
                            </span>
                            <span style={{
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap', color: '#c9d1d9',
                            }}>
                              {a.task || (a as { event?: string }).event || ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Board minutes */}
                {(briefing.lastBoardMinutes || briefing.boardMinutes) && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ color: '#8b949e', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>📝 최근 보고</h4>
                    <pre style={{
                      background: '#0d1117', border: '1px solid #21262d',
                      borderRadius: 8, padding: 12, fontSize: 10,
                      color: '#8b949e', whiteSpace: 'pre-wrap',
                      maxHeight: 120, overflowY: 'auto',
                      lineHeight: 1.5, margin: 0,
                    }}>
                      {briefing.lastBoardMinutes || briefing.boardMinutes?.content || ''}
                    </pre>
                  </div>
                )}

                {/* 인앱 채팅 */}
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ color: '#8b949e', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>💬 대화하기</h4>
                  {/* 채팅 히스토리 */}
                  <div style={{
                    background: '#0d1117', border: '1px solid #21262d', borderRadius: 8,
                    padding: 10, maxHeight: 200, overflowY: 'auto', marginBottom: 8,
                    minHeight: chatMessages.length > 0 ? 80 : 40,
                  }}>
                    {chatMessages.length === 0 && (
                      <div style={{ fontSize: 11, color: '#484f58', textAlign: 'center', padding: 8 }}>
                        {briefing.name}에게 질문해보세요
                      </div>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: 6,
                      }}>
                        <div style={{
                          maxWidth: '80%', padding: '6px 10px', borderRadius: 10,
                          fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                          background: m.role === 'user' ? '#238636' : '#21262d',
                          color: '#e6edf3',
                        }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ fontSize: 11, color: '#8b949e', padding: 4 }}>응답 작성 중...</div>
                    )}
                  </div>
                  {/* 입력 */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendMessage(); }}
                      placeholder={`${briefing.name}에게 질문...`}
                      style={{
                        flex: 1, background: '#0d1117',
                        border: '1px solid #21262d', borderRadius: 8,
                        padding: '8px 12px', color: '#e6edf3',
                        fontSize: 12, outline: 'none',
                        fontFamily: '-apple-system, sans-serif',
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={chatLoading}
                      style={{
                        background: '#238636', border: 'none',
                        borderRadius: 8, padding: '8px 16px',
                        color: '#fff', fontSize: 12, cursor: 'pointer',
                        fontWeight: 600, opacity: chatLoading ? 0.5 : 1,
                      }}
                    >전송</button>
                  </div>
                  {chatResp && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#f85149' }}>{chatResp}</div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
                데이터를 불러올 수 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
