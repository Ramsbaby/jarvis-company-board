'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  T, COLS, ROWS, MOVE_SPEED,
  ROOMS, AGENT_TEAM_TO_ROOM,
  CRON_COLS, CRON_ROWS,
  CRON_COL_START, CRON_ROW_START, CRON_COL_SPACING, CRON_ROW_SPACING,
  buildCollisionMap, aStarPath,
} from '@/lib/map/rooms';
import type { RoomDef, BriefingData, CronItem, NpcState } from '@/lib/map/rooms';
import { drawRoomFurniture, drawDecorations } from '@/lib/map/canvas-draw';
import TeamBriefingPopup from '@/components/map/TeamBriefingPopup';
import CronGridPopup from '@/components/map/CronGridPopup';
import CronDetailPopup from '@/components/map/CronDetailPopup';
import MobileControls from '@/components/map/MobileControls';
import BoardBanner from '@/components/map/BoardBanner';
import CronToastStack from '@/components/map/CronToastStack';
import Statusline from '@/components/map/Statusline';
import RightInfoPanels from '@/components/map/RightInfoPanels';
import DashboardTable from '@/components/map/DashboardTable';

/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Gather Town Style Virtual Office
   Pure Canvas 2D, no external game engine
   Major UX rewrite: unique room visuals, descriptions, mobile support
   ═══════════════════════════════════════════════════════════════════ */

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
  const [cronData, setCronData] = useState<CronItem[]>([]);
  const [cronPopup, setCronPopup] = useState<CronItem | null>(null);
  const [cronGridOpen, setCronGridOpen] = useState(false);
  const [cronFilter, setCronFilter] = useState<'all'|'success'|'failed'|'other'>('all');
  const [cronSearch, setCronSearch] = useState('');
  // 인트로 — sessionStorage로 영속화 (재마운트 시에도 유지)
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem('jarvis-map-intro-v2') !== '1';
  });
  const [chatPanelOpen, setChatPanelOpen] = useState(false); // 팀장 채팅 패널 (기본 닫힘)
  // 뷰 모드 (맵 / 표) — localStorage 영속화
  const [viewMode, setViewMode] = useState<'map' | 'table'>(() => {
    if (typeof window === 'undefined') return 'map';
    const v = localStorage.getItem('jarvis-map-view-mode');
    return v === 'table' ? 'table' : 'map';
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 게임 상태 refs
  const playerRef = useRef({ x: 20, y: 8 });
  const movingRef = useRef(false);
  const animRef = useRef({ frame: 0, dir: 0, walking: false });
  const tweenRef = useRef({ sx: 0, sy: 0, tx: 0, ty: 0, t: 0, active: false });
  const npcStatesRef = useRef<Record<string, NpcState>>({});
  const keysRef = useRef<Set<string>>(new Set());
  const collisionMap = useRef(buildCollisionMap());
  const pathRef = useRef<{ x: number; y: number }[]>([]); // A* 경로 큐
  const pathTargetRef = useRef<{ x: number; y: number } | null>(null); // 목표 타일 (시각 표시)
  const popupOpenRef = useRef(false);
  // 논리 픽셀 크기 (DPR 보정용) — CSS 좌표계와 일치
  const logicalSizeRef = useRef({ w: 1280, h: 800 });
  // 발자국 이펙트
  const footstepsRef = useRef<{ x: number; y: number; life: number }[]>([]);
  // dustRef 제거됨 (장식 다이어트)
  // 구역 진입 토스트 (캔버스 레이어)
  const zoneToastRef = useRef<{ text: string; color: string; emoji: string; frame: number } | null>(null);
  const lastNearbyIdRef = useRef<string | null>(null);
  const cameraRef = useRef({ x: 0, y: 0 });
  const frameCountRef = useRef(0);
  const historyPushedRef = useRef(false);
  const zoomRef = useRef(1); // 줌 레벨 (0.6 ~ 2.5)
  const cronDataRef = useRef<CronItem[]>([]);

  useEffect(() => { popupOpenRef.current = popupOpen || cronGridOpen; }, [popupOpen, cronGridOpen]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 뷰 모드 변경 시 localStorage 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('jarvis-map-view-mode', viewMode);
  }, [viewMode]);

  // 표 모드에서 행 클릭 → 기존 팝업 로직 재사용
  const handleTableRowClick = useCallback((room: RoomDef, rowBriefing: BriefingData) => {
    setBriefing(rowBriefing);
    setPopupOpen(true);
    setPopupLoading(false);
    setChatResp('');
  }, []);

  // ── 팝업 닫기 ──────────────────────────────────────────────
  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setBriefing(null);
    setPopupLoading(false);
    setChatResp('');
    setChatInput('');
    setCronGridOpen(false);
    setCronPopup(null);
  }, []);

  // cronDataRef 동기화
  useEffect(() => { cronDataRef.current = cronData; }, [cronData]);

  // 팝업 열릴 때 history push
  useEffect(() => {
    if (popupOpen || cronGridOpen) {
      if (!historyPushedRef.current) {
        history.pushState({ popup: true }, '');
        historyPushedRef.current = true;
      }
    } else {
      historyPushedRef.current = false;
    }
  }, [popupOpen, cronGridOpen]);

  // 마운트 시 베이스 히스토리 상태 설정 — 뒤로가기 차단 기반
  useEffect(() => {
    history.replaceState({ jarvisMap: true }, '');
  }, []);

  // popstate (back 버튼/스와이프) — 팝업 닫기 또는 이탈 차단
  useEffect(() => {
    const handlePop = () => {
      if (historyPushedRef.current) {
        // 팝업 열려있으면 닫기
        closePopup();
        historyPushedRef.current = false;
      } else {
        // 팝업 없어도 게임 페이지 이탈 차단 — 상태 재push
        history.pushState({ jarvisMap: true }, '');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [closePopup]);

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

      // Fetch full cron list for cron-center
      try {
        const cronsRes = await fetch('/api/crons');
        if (cronsRes.ok) {
          const cronsJson = await cronsRes.json();
          const crons = (cronsJson.crons || []) as CronItem[];
          setCronData(crons);
          // cron-center 상태 계산 → npcStatesRef에 반영 (states는 이미 commit됐으므로 직접 patch)
          const cronTotal = crons.length;
          const cronFailed = crons.filter(c => c.status === 'failed').length;
          const cronRate = cronTotal > 0 ? (cronTotal - cronFailed) / cronTotal : 1;
          const cronSt = cronRate >= 0.9 ? 'green' : cronRate >= 0.7 ? 'yellow' : 'red';
          npcStatesRef.current = {
            ...npcStatesRef.current,
            'cron-center': {
              status: cronSt,
              task: `${cronTotal}개 크론`,
              activity: `성공률 ${Math.round(cronRate * 100)}%`,
            },
          };
        }
      } catch { /* skip */ }
    } catch { /* retry next interval */ }
  }, []);

  const openBriefing = useCallback(async (room: RoomDef) => {
    // Cron center: open full-screen grid popup of ALL crons (not standard briefing)
    if (room.id === 'cron-center') {
      setCronGridOpen(true);
      // Refresh crons on open
      try {
        const r = await fetch('/api/crons');
        if (r.ok) {
          const j = await r.json();
          setCronData((j.crons || []) as CronItem[]);
        }
      } catch { /* keep current */ }
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
          // metrics → stats 매핑 (entity API는 metrics를 반환하지만 팝업은 stats를 읽음)
          if (data.metrics && !data.stats) {
            data.stats = {
              total: data.metrics.totalToday || 0,
              success: (data.metrics.totalToday || 0) - (data.metrics.failedToday || 0),
              failed: data.metrics.failedToday || 0,
              rate: data.metrics.cronSuccessRate || 0,
            };
          }
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
        // 특수 룸별 rich fallback
        const specialContent: Record<string, Partial<BriefingData>> = {
          'standup': {
            status: 'GREEN',
            summary: '매일 오전 09:15 KST 모닝 브리핑. 전사 시스템 상태 · 오늘 예정 크론 · 주요 이슈를 요약해 Discord #jarvis-ceo 채널로 전송합니다.',
            schedule: '매일 09:15 KST',
          },
          'president': {
            status: 'GREEN',
            summary: '이정우(대표) — AI 경영 데이터와 오너 개인 데이터가 통합된 공간.',
          },
        };
        const special = specialContent[room.id] || {};
        setBriefing({
          id: room.id,
          name: room.name,
          emoji: room.emoji,
          status: special.status || 'YELLOW',
          summary: special.summary || room.description,
          roomDescription: room.description,
          schedule: special.schedule,
          ...special,
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') closePopup();
        return;
      }
      // 키보드 이동 시 클릭-투-무브 경로 취소
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S'].includes(e.key)) {
        pathRef.current = [];
        pathTargetRef.current = null;
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
      const clickX = (e.clientX - rect.left) / zoomRef.current;
      const clickY = (e.clientY - rect.top) / zoomRef.current;
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      // 크론 NPC 클릭 체크 — grid-based (proximity overlap 없음)
      const cronRoom = ROOMS.find(r => r.id === 'cron-center');
      if (cronRoom) {
        // 크론센터 방 전체 화면 영역
        const crRx = cronRoom.x * T - camX;
        const crRy = cronRoom.y * T - camY;
        const crRw = cronRoom.w * T;
        const crRh = cronRoom.h * T;
        if (clickX >= crRx && clickX < crRx + crRw && clickY >= crRy && clickY < crRy + crRh) {
          // 방 내부 상대 좌표 → col/row 계산 (T/2 오프셋 보정 — 워크스테이션 center = tile*T + T/2)
          const relX = clickX - (crRx + CRON_COL_START * T) - T / 2;
          const relY = clickY - (crRy + CRON_ROW_START * T) - T / 2;
          const col = Math.round(relX / (CRON_COL_SPACING * T));
          const row = Math.round(relY / (CRON_ROW_SPACING * T));
          if (col >= 0 && col < CRON_COLS && row >= 0 && row < CRON_ROWS) {
            const idx = row * CRON_COLS + col;
            const cron = cronDataRef.current[idx];
            if (cron) {
              setCronPopup(cron);
              setPopupOpen(true);
              return;
            }
          }
          // 크론센터 방 안이지만 빈 영역 — 크론센터 전체 그리드 열기
          setCronGridOpen(true);
          setPopupOpen(true);
          return;
        }
      }

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

      // 빈 바닥 클릭 → A* 이동
      const tileX = Math.floor((clickX + camX) / T);
      const tileY = Math.floor((clickY + camY) / T);
      if (tileX >= 0 && tileX < COLS && tileY >= 0 && tileY < ROWS && !cMap[tileY][tileX]) {
        const p = playerRef.current;
        const path = aStarPath(p.x, p.y, tileX, tileY, cMap);
        if (path.length > 0) {
          pathRef.current = path;
          pathTargetRef.current = { x: tileX, y: tileY };
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    // Hover tooltip for rooms
    const onPointerMove = (e: PointerEvent) => {
      if (popupOpenRef.current) { setTooltipRoom(null); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / zoomRef.current;
      const my = (e.clientY - rect.top) / zoomRef.current;
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

    // ── 줌: 마우스 휠 ──────────────────────────────────────────
    const ZOOM_MIN = 0.55, ZOOM_MAX = 2.4;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ── 줌: 핀치 제스처 (모바일 두 손가락) ─────────────────────
    let _pinchDist = 0;
    const onTouchStartZoom = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _pinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMoveZoom = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (_pinchDist > 0) {
        const scale = dist / _pinchDist;
        zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * scale));
      }
      _pinchDist = dist;
      e.preventDefault();
    };
    const onTouchEndZoom = () => { _pinchDist = 0; };
    canvas.addEventListener('touchstart', onTouchStartZoom, { passive: true });
    canvas.addEventListener('touchmove', onTouchMoveZoom, { passive: false });
    canvas.addEventListener('touchend', onTouchEndZoom, { passive: true });

    // 더블클릭 → 줌 리셋
    const onDblClick = () => { zoomRef.current = 1; };
    canvas.addEventListener('dblclick', onDblClick);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const lw = Math.round(rect.width);
      const lh = Math.round(rect.height);
      logicalSizeRef.current = { w: lw, h: lh };
      canvas.width = lw * dpr;
      canvas.height = lh * dpr;
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
      const state = npcStatesRef.current[r.id];

      // 오픈 오피스 파드 — closed와 완전히 다른 스타일 (한 눈에 구분되도록)
      if (r.wallStyle === 'pod') {
        // 1. 단일 다크 네이비 바닥 (복도와 동일 베이스, 팀 컬러 stamp 없음)
        ctx!.fillStyle = '#1a1f2e';
        ctx!.fillRect(rx, ry, rw, rh);

        // 2. 팀 컬러 언더글로우 (아주 subtle — 바닥에 은은히 물든 정도)
        const grdTeam = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) * 0.7);
        grdTeam.addColorStop(0, r.teamColor + '14');
        grdTeam.addColorStop(1, 'transparent');
        ctx!.fillStyle = grdTeam;
        ctx!.fillRect(rx, ry, rw, rh);

        // 3. 상태 indicator (LED 점) — 우상단 구석에 점 하나로 축소
        if (state) {
          const stColor = state.status === 'green' ? '#3fb950' : state.status === 'red' ? '#f85149' : '#d29922';
          ctx!.save();
          ctx!.shadowColor = stColor;
          ctx!.shadowBlur = 6;
          ctx!.fillStyle = stColor;
          ctx!.beginPath();
          ctx!.arc(rx + rw - 8, ry + 8, 2.5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }

        // 4. 떠있는 팀 태그 (게임 quest marker 스타일, 상단 중앙 약간 위)
        const tagText = `${r.emoji} ${r.name}`;
        ctx!.font = 'bold 10px -apple-system, monospace';
        const tagW = ctx!.measureText(tagText).width + 14;
        const tagX = rx + rw / 2 - tagW / 2;
        const tagY = ry + 4;
        // 태그 배경 (rounded pill, 단일 다크 네이비)
        ctx!.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx!.beginPath();
        ctx!.roundRect(tagX, tagY, tagW, 16, 8);
        ctx!.fill();
        // 태그 left border (team color accent)
        ctx!.fillStyle = r.teamColor;
        ctx!.fillRect(tagX, tagY + 2, 2, 12);
        // 태그 텍스트
        ctx!.fillStyle = '#e6edf3';
        ctx!.textAlign = 'center';
        ctx!.fillText(tagText, rx + rw / 2, tagY + 11);

        // 5. 가구 (데스크/의자/모니터) — 기존 drawRoomFurniture
        drawRoomFurniture(ctx!, r, rx, ry, rw, rh, frameCountRef.current, cronDataRef.current.slice(0, CRON_COLS * CRON_ROWS));
        return;
      }

      // Closed room — 기존 로직 그대로
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

      // Walls — 단일 그레이 팔레트 (통일성). 팀 컬러는 얇은 inner 액센트로만.
      // 메인 벽
      ctx!.strokeStyle = '#30363d';
      ctx!.lineWidth = 4;
      ctx!.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);
      // 얇은 팀 컬러 inner 액센트 (1px, 방 정체성 표시)
      ctx!.strokeStyle = r.teamColor + '60';
      ctx!.lineWidth = 1;
      ctx!.strokeRect(rx + 5, ry + 5, rw - 10, rh - 10);

      // Wall top (3D depth) — 회색 베이스
      ctx!.fillStyle = '#30363d';
      ctx!.fillRect(rx, ry, rw, 5);
      ctx!.fillStyle = '#484f58';  // 상단 하이라이트
      ctx!.fillRect(rx + 4, ry, rw - 8, 2);

      // Side wall shading (통일 그레이)
      ctx!.fillStyle = '#30363d40';
      ctx!.fillRect(rx, ry, 4, rh);
      ctx!.fillStyle = '#30363d20';
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
      drawRoomFurniture(ctx!, r, rx, ry, rw, rh, frameCountRef.current, cronDataRef.current.slice(0, CRON_COLS * CRON_ROWS));

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
      // cron-center는 개별 크론 NPC 카드로 대체되었으므로 단일 NPC 스킵
      if (r.id === 'cron-center') return;
      const fc = frameCountRef.current;
      const nx = r.npcX * T - camX + T / 2;
      // Idle animation: subtle oscillation +/-1px every 30 frames
      const idleBob = Math.sin(fc * 0.07 + r.npcX * 3) * 1;
      const ny = r.npcY * T - camY + T / 2 + idleBob;
      const state = npcStatesRef.current[r.id];
      const stColor = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
      const isError = state?.status === 'red';

      // Shadow (soft ellipse, bigger for larger sprite)
      ctx!.fillStyle = 'rgba(0,0,0,0.35)';
      ctx!.beginPath();
      ctx!.ellipse(nx, ny + 19, 13, 5, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Arm swing animation (walk cycle)
      const armSwing = Math.sin(fc * 0.1 + r.npcX * 2) * 2;

      // Legs — wider stance with shoe detail
      ctx!.fillStyle = isError ? '#8b3a3a' : '#1a1a2e';
      ctx!.fillRect(nx - 5, ny + 12, 4, 8);     // left leg
      ctx!.fillRect(nx + 1, ny + 12, 4, 8);     // right leg
      // Shoes (darker)
      ctx!.fillStyle = '#0d0d1a';
      ctx!.fillRect(nx - 6, ny + 18, 5, 3);
      ctx!.fillRect(nx + 1, ny + 18, 5, 3);

      // Body (team color shirt) — larger 18×16
      const bodyColor = isError ? '#6b2020' : r.teamColor;
      ctx!.fillStyle = bodyColor + 'd0';
      ctx!.fillRect(nx - 9, ny - 3, 18, 16);
      // Body outline (darker edge for pixel-art pop)
      ctx!.strokeStyle = bodyColor;
      ctx!.lineWidth = 1;
      ctx!.strokeRect(nx - 9, ny - 3, 18, 16);
      // Shirt highlight
      ctx!.fillStyle = '#ffffff12';
      ctx!.fillRect(nx - 9, ny - 3, 6, 16);
      // Collar V
      ctx!.fillStyle = '#0d0d1a';
      ctx!.beginPath();
      ctx!.moveTo(nx - 3, ny - 3);
      ctx!.lineTo(nx, ny + 2);
      ctx!.lineTo(nx + 3, ny - 3);
      ctx!.closePath();
      ctx!.fill();
      // Tie (team accent)
      ctx!.fillStyle = bodyColor;
      ctx!.fillRect(nx - 1, ny + 2, 3, 9);
      ctx!.fillStyle = '#fbbf2480';
      ctx!.fillRect(nx - 1, ny + 2, 1, 9); // tie highlight

      // Arms with swing — slightly offset per frame
      ctx!.fillStyle = '#f0d0a0';
      ctx!.fillRect(nx - 12, ny + armSwing, 4, 11);   // left arm
      ctx!.fillRect(nx + 8,  ny - armSwing, 4, 11);   // right arm
      // Hand dots
      ctx!.fillStyle = '#e0b887';
      ctx!.fillRect(nx - 12, ny + 10 + armSwing, 4, 2);
      ctx!.fillRect(nx + 8,  ny + 10 - armSwing, 4, 2);

      // Head (skin tone circle, bigger)
      ctx!.fillStyle = isError ? '#e0b090' : '#f5d6a8';
      ctx!.beginPath();
      ctx!.arc(nx, ny - 10, 10, 0, Math.PI * 2);
      ctx!.fill();
      // Head outline
      ctx!.strokeStyle = '#b88a5c';
      ctx!.lineWidth = 1;
      ctx!.stroke();

      // Hair (team-colored, fuller)
      const hairColor = r.teamColor;
      ctx!.fillStyle = hairColor;
      ctx!.beginPath();
      ctx!.arc(nx, ny - 13, 10, Math.PI + 0.2, Math.PI * 2 - 0.2);
      ctx!.fill();
      // Hair top bangs
      ctx!.fillRect(nx - 9, ny - 19, 18, 5);
      // Hair side highlights
      ctx!.fillStyle = '#ffffff18';
      ctx!.fillRect(nx - 8, ny - 18, 4, 4);

      // Eyes (bigger, dark with white highlight)
      ctx!.fillStyle = '#1a1a2e';
      ctx!.fillRect(nx - 4, ny - 11, 3, 3);
      ctx!.fillRect(nx + 1, ny - 11, 3, 3);
      // Eye whites
      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(nx - 4, ny - 11, 1, 1);
      ctx!.fillRect(nx + 1, ny - 11, 1, 1);
      // Eyebrows
      ctx!.fillStyle = hairColor;
      ctx!.fillRect(nx - 5, ny - 14, 4, 1);
      ctx!.fillRect(nx + 1, ny - 14, 4, 1);

      // Mouth (smile)
      ctx!.strokeStyle = '#8b4513';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(nx, ny - 6, 2, 0.2, Math.PI - 0.2);
      ctx!.stroke();

      // ── 팀별 액세서리 (head top) ───────────────
      const accessoryY = ny - 22;
      if (r.id === 'president') {
        // 왕관 (gold)
        ctx!.fillStyle = '#fbbf24';
        ctx!.fillRect(nx - 7, accessoryY, 14, 3);
        // 왕관 뿔 3개
        ctx!.fillRect(nx - 6, accessoryY - 3, 2, 3);
        ctx!.fillRect(nx - 1, accessoryY - 4, 2, 4);
        ctx!.fillRect(nx + 4, accessoryY - 3, 2, 3);
        // 왕관 보석
        ctx!.fillStyle = '#f87171';
        ctx!.fillRect(nx - 1, accessoryY + 1, 2, 1);
      } else if (r.id === 'finance') {
        // 안경 (gold frame)
        ctx!.strokeStyle = '#fbbf24';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(nx - 3, ny - 10, 3, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.arc(nx + 3, ny - 10, 3, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(nx, ny - 10);
        ctx!.lineTo(nx, ny - 10);
        ctx!.stroke();
      } else if (r.id === 'infra-lead') {
        // 헤드셋
        ctx!.strokeStyle = '#22c55e';
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(nx, ny - 13, 11, Math.PI, 0);
        ctx!.stroke();
        ctx!.fillStyle = '#22c55e';
        ctx!.fillRect(nx - 11, ny - 13, 3, 4);
        ctx!.fillRect(nx + 8,  ny - 13, 3, 4);
        // 마이크 암
        ctx!.strokeStyle = '#22c55e';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(nx + 10, ny - 10);
        ctx!.lineTo(nx + 6, ny - 6);
        ctx!.stroke();
      } else if (r.id === 'trend-lead') {
        // 안테나
        ctx!.strokeStyle = '#3b82f6';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(nx - 2, accessoryY);
        ctx!.lineTo(nx - 4, accessoryY - 5);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(nx + 2, accessoryY);
        ctx!.lineTo(nx + 4, accessoryY - 5);
        ctx!.stroke();
        ctx!.fillStyle = '#fbbf24';
        ctx!.fillRect(nx - 5, accessoryY - 6, 2, 2);
        ctx!.fillRect(nx + 3, accessoryY - 6, 2, 2);
      } else if (r.id === 'record-lead') {
        // 클립보드 (손에 들고 있는 느낌)
        ctx!.fillStyle = '#8b6914';
        ctx!.fillRect(nx + 10, ny + 3, 6, 8);
        ctx!.fillStyle = '#fef3c7';
        ctx!.fillRect(nx + 11, ny + 4, 4, 6);
        ctx!.fillStyle = '#92702a';
        ctx!.fillRect(nx + 12, ny + 5, 2, 0.5);
        ctx!.fillRect(nx + 12, ny + 7, 2, 0.5);
      } else if (r.id === 'audit-lead') {
        // 돋보기
        ctx!.strokeStyle = '#dc2626';
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(nx + 11, ny, 4, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.strokeStyle = '#8b6914';
        ctx!.beginPath();
        ctx!.moveTo(nx + 13, ny + 2);
        ctx!.lineTo(nx + 16, ny + 5);
        ctx!.stroke();
      } else if (r.id === 'library') {
        // 책 (손에)
        ctx!.fillStyle = '#0ea5e9';
        ctx!.fillRect(nx + 9, ny + 2, 7, 9);
        ctx!.fillStyle = '#0284c7';
        ctx!.fillRect(nx + 9, ny + 2, 7, 1);
        ctx!.fillStyle = '#fff';
        ctx!.fillRect(nx + 11, ny + 5, 3, 1);
        ctx!.fillRect(nx + 11, ny + 7, 3, 1);
      } else if (r.id === 'brand-lead') {
        // 베레 모자
        ctx!.fillStyle = '#ea580c';
        ctx!.beginPath();
        ctx!.ellipse(nx, accessoryY + 1, 10, 3, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = '#c2410c';
        ctx!.beginPath();
        ctx!.arc(nx + 3, accessoryY - 1, 2, 0, Math.PI * 2);
        ctx!.fill();
      } else if (r.id === 'growth-lead') {
        // 새싹
        ctx!.fillStyle = '#14b8a6';
        ctx!.fillRect(nx - 1, accessoryY, 2, 4);
        ctx!.beginPath();
        ctx!.ellipse(nx - 3, accessoryY, 3, 2, 0.3, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.beginPath();
        ctx!.ellipse(nx + 3, accessoryY, 3, 2, -0.3, 0, Math.PI * 2);
        ctx!.fill();
      } else if (r.id === 'standup') {
        // 마이크
        ctx!.fillStyle = '#eab308';
        ctx!.fillRect(nx + 10, ny - 4, 3, 5);
        ctx!.fillStyle = '#ca8a04';
        ctx!.fillRect(nx + 11, ny + 1, 1, 6);
      } else if (r.id === 'secretary') {
        // 보우타이
        ctx!.fillStyle = '#8b5cf6';
        ctx!.beginPath();
        ctx!.moveTo(nx - 4, ny + 1);
        ctx!.lineTo(nx - 2, ny - 1);
        ctx!.lineTo(nx - 2, ny + 3);
        ctx!.closePath();
        ctx!.fill();
        ctx!.beginPath();
        ctx!.moveTo(nx + 4, ny + 1);
        ctx!.lineTo(nx + 2, ny - 1);
        ctx!.lineTo(nx + 2, ny + 3);
        ctx!.closePath();
        ctx!.fill();
      }

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

      // Status text (current task) — 하단 라벨 (항상)
      if (state?.task) {
        const taskLabel = state.task.length > 14 ? state.task.slice(0, 13) + '\u2026' : state.task;
        ctx!.fillStyle = '#8b949e';
        ctx!.font = '7px monospace';
        ctx!.fillText(taskLabel, nx, ny + 39);
      }

      // ── NPC 머리 위 현재작업 배지 (플레이어 거리 기반 선명도) ──
      if (state?.task && state.task !== 'idle') {
        const p = playerRef.current;
        const dx = p.x - r.npcX;
        const dy = p.y - r.npcY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 5타일 이내 선명(1.0), 12타일 밖은 0, 사이는 linear
        const clarity = dist <= 5 ? 1 : dist >= 12 ? 0 : 1 - (dist - 5) / 7;
        if (clarity > 0.05) {
          const badgeText = state.task.length > 18 ? state.task.slice(0, 17) + '\u2026' : state.task;
          ctx!.save();
          ctx!.font = 'bold 9px monospace';
          const badgeW = ctx!.measureText(badgeText).width + 10;
          const badgeH = 14;
          const bubbleY = ny - 32;
          const alpha = Math.round(clarity * 220).toString(16).padStart(2, '0');
          const textAlpha = Math.round(clarity * 255).toString(16).padStart(2, '0');
          // 배경 말풍선
          ctx!.fillStyle = `#161b22${alpha}`;
          ctx!.strokeStyle = `#c9a227${alpha}`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.roundRect(nx - badgeW / 2, bubbleY - badgeH + 2, badgeW, badgeH, 4);
          ctx!.fill();
          ctx!.stroke();
          // 꼬리
          ctx!.beginPath();
          ctx!.moveTo(nx - 3, bubbleY + 2);
          ctx!.lineTo(nx, bubbleY + 6);
          ctx!.lineTo(nx + 3, bubbleY + 2);
          ctx!.closePath();
          ctx!.fillStyle = `#161b22${alpha}`;
          ctx!.fill();
          ctx!.strokeStyle = `#c9a227${alpha}`;
          ctx!.stroke();
          // 텍스트
          ctx!.fillStyle = `#e6edf3${textAlpha}`;
          ctx!.textAlign = 'center';
          ctx!.fillText(badgeText, nx, bubbleY - 2);
          ctx!.restore();
        }
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

    function drawMinimap(canvasW: number, canvasH: number) {
      const mmW = 180, mmH = 130;
      // 우하단으로 이동 (구 우상단 → 우하단. 정보 패널이 우상단 차지)
      const mx = canvasW - mmW - 16;
      const my = canvasH - mmH - 16;
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

      // Rooms with abbreviated names (academy+career → growth, finance/library 신설)
      const abbrevNames: Record<string, string> = {
        'finance': '재무', 'infra-lead': 'INF', 'trend-lead': 'TRD', 'president': '대표',
        'record-lead': 'REC', 'audit-lead': 'AUD', 'library': '라이브', 'brand-lead': 'BRD',
        'growth-lead': '성장', 'standup': 'STU', 'secretary': 'SEC', 'server-room': 'SRV',
        'cron-center': 'CRON',
      };

      // Detect which room the player is in
      const p = playerRef.current;
      const playerRoomId = ROOMS.find(r =>
        p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
      )?.id;

      // Zone color coding
      const zoneColor = (rId: string): string => {
        if (rId === 'president') return '#c9a227';
        if (rId === 'finance') return '#10b981';
        if (rId === 'library') return '#0ea5e9';
        if (rId === 'growth-lead') return '#14b8a6';
        if (rId === 'server-room') return '#64748b';
        if (rId === 'cron-center') return '#6366f1';
        if (rId === 'infra-lead') return '#22c55e';
        if (rId === 'standup') return '#eab308';
        if (rId === 'secretary') return '#8b5cf6';
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

        // 크론센터: 개별 크론 점들 표시
        if (r.id === 'cron-center') {
          const crons = cronDataRef.current;
          const roomPxX = mx + r.x * T * scale;
          const roomPxY = my + r.y * T * scale;
          const roomPxW = r.w * T * scale;
          const roomPxH = r.h * T * scale;
          const dotCols = Math.floor(roomPxW / 5);
          const dotRows = Math.floor(roomPxH / 5);
          const maxDots = dotCols * dotRows;
          const visibleCrons = crons.slice(0, maxDots);
          visibleCrons.forEach((cron, i) => {
            const col = i % dotCols;
            const row = Math.floor(i / dotCols);
            const dotX = roomPxX + 3 + col * 5;
            const dotY = roomPxY + 3 + row * 5;
            const dotColor = cron.status === 'failed' ? '#f85149'
              : cron.status === 'running' ? '#58a6ff'
              : cron.status === 'success' ? '#3fb950'
              : '#6b7280';
            ctx!.fillStyle = dotColor;
            ctx!.beginPath();
            ctx!.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
            ctx!.fill();
          });
          // CRON 레이블은 하단에 작게
          ctx!.fillStyle = isCurrentRoom ? '#fff' : '#a0a8b4';
          ctx!.font = isCurrentRoom ? 'bold 7px monospace' : '6px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText(`CRON (${crons.length})`,
            mx + (r.x + r.w / 2) * T * scale,
            my + (r.y + r.h - 0.5) * T * scale
          );
        } else {
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
      // DPR + Zoom 보정: 월드 렌더링 패스
      const _dpr = window.devicePixelRatio || 1;
      const _zoom = zoomRef.current;
      ctx!.setTransform(_dpr * _zoom, 0, 0, _dpr * _zoom, 0, 0);
      const w = logicalSizeRef.current.w;
      const h = logicalSizeRef.current.h;
      // 줌 적용 후 세계 가시 범위 (논리 픽셀 / zoom = 월드 픽셀)
      const wZ = w / _zoom;
      const hZ = h / _zoom;

      // Movement
      if (!movingRef.current && !popupOpenRef.current && time - lastMove > MOVE_SPEED) {
        const keys = keysRef.current;
        let dx = 0, dy = 0;
        if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) { dx = -1; animRef.current.dir = 1; }
        else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) { dx = 1; animRef.current.dir = 2; }
        else if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) { dy = -1; animRef.current.dir = 3; }
        else if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) { dy = 1; animRef.current.dir = 0; }

        // 클릭-투-무브: 키 입력 없으면 경로 추종
        if (dx === 0 && dy === 0 && pathRef.current.length > 0) {
          const next = pathRef.current[0];
          const p = playerRef.current;
          dx = next.x - p.x;
          dy = next.y - p.y;
          // 방향 설정
          if (dx < 0) animRef.current.dir = 1;
          else if (dx > 0) animRef.current.dir = 2;
          else if (dy < 0) animRef.current.dir = 3;
          else animRef.current.dir = 0;
        }

        if (dx !== 0 || dy !== 0) {
          const p = playerRef.current;
          const nx = p.x + dx, ny = p.y + dy;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !cMap[ny][nx]) {
            // 경로 추종 중이면 현재 스텝 제거
            if (pathRef.current.length > 0 && pathRef.current[0].x === nx && pathRef.current[0].y === ny) {
              pathRef.current = pathRef.current.slice(1);
              if (pathRef.current.length === 0) pathTargetRef.current = null;
            }
            movingRef.current = true;
            tweenRef.current = { sx: p.x, sy: p.y, tx: nx, ty: ny, t: 0, active: true };
            playerRef.current = { x: nx, y: ny };
            animRef.current.walking = true;
            // 발자국 이펙트 추가
            footstepsRef.current.push({ x: p.x, y: p.y, life: 28 });
            if (footstepsRef.current.length > 40) footstepsRef.current.shift();
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
          } else {
            // 충돌로 경로 막힘 → 경로 초기화
            pathRef.current = [];
            pathTargetRef.current = null;
          }
        }
      }

      // Nearby NPC detection
      const nearby = findNearbyRoom();
      setNearbyRoom(nearby);

      // 구역 진입 토스트 트리거
      const nearbyId = nearby?.id ?? null;
      if (nearbyId !== lastNearbyIdRef.current && nearby) {
        zoneToastRef.current = { text: nearby.name, color: nearby.teamColor, emoji: nearby.emoji || '🏢', frame: 0 };
        lastNearbyIdRef.current = nearbyId;
      } else if (!nearby) {
        lastNearbyIdRef.current = null;
      }

      // Camera with smooth lerp
      const p = playerRef.current;
      let cpx = p.x * T, cpy = p.y * T;
      if (tweenRef.current.active) {
        const tw = tweenRef.current;
        cpx = (tw.sx + (tw.tx - tw.sx) * tw.t) * T;
        cpy = (tw.sy + (tw.ty - tw.sy) * tw.t) * T;
      }
      const targetCamX = Math.max(0, Math.min(COLS * T - wZ, cpx - wZ / 2 + T / 2));
      const targetCamY = Math.max(0, Math.min(ROWS * T - hZ, cpy - hZ / 2 + T / 2));
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.12;
      const camX = Math.round(cameraRef.current.x);
      const camY = Math.round(cameraRef.current.y);

      // Clear (월드 패스 좌표계 — wZ×hZ)
      ctx!.fillStyle = '#0d1117';
      ctx!.fillRect(0, 0, wZ, hZ);

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
          if (sx > wZ || sy > hZ || sx + T < 0 || sy + T < 0) continue;

          // Check if inside a room
          let inRoom = false;
          for (const r of ROOMS) {
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
              inRoom = true;
              break;
            }
          }
          if (inRoom) continue; // Room floors are drawn by drawRoom

          // Corridor tiles — 오피스 바닥재 스타일
          const isMainCorridor = (y >= 7 && y <= 9) || (y >= 15 && y <= 17) || (y >= 23 && y <= 25);
          const isVertCorridor = x === 0 || x === 1 || x === 9 || x === 10 || x === 18 || x === 19 || x === 27 || x === 28 || x === 37 || x === 38 || x === 39;
          if (isMainCorridor) {
            // 메인 복도 — 대리석 슬라브 타일 (큰 타일, 그라우트 선)
            const tileW = T * 2, tileH = T;
            const tileCol = Math.floor(x / 2);
            const baseColor = (tileCol + y) % 2 === 0 ? '#2c3050' : '#272b44';
            ctx!.fillStyle = baseColor;
            ctx!.fillRect(sx, sy, T, T);
            // 대리석 무늬 (대각선 선)
            if ((x * 5 + y * 7) % 11 === 0) {
              ctx!.strokeStyle = 'rgba(255,255,255,0.015)';
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(sx + 5, sy + T - 5);
              ctx!.lineTo(sx + T - 5, sy + 5);
              ctx!.stroke();
            }
            // 타일 그라우트 (경계선)
            ctx!.strokeStyle = '#1a1d30';
            ctx!.lineWidth = 0.8;
            if (x % 2 === 0) { ctx!.beginPath(); ctx!.moveTo(sx, sy); ctx!.lineTo(sx, sy + T); ctx!.stroke(); }
            ctx!.beginPath(); ctx!.moveTo(sx, sy); ctx!.lineTo(sx + T, sy); ctx!.stroke();
            // 중앙 행 반사광
            if (y === 8 || y === 16 || y === 24) {
              const refGrd = ctx!.createLinearGradient(sx, sy, sx, sy + T);
              refGrd.addColorStop(0, 'rgba(88,166,255,0.05)');
              refGrd.addColorStop(0.5, 'rgba(88,166,255,0.02)');
              refGrd.addColorStop(1, 'transparent');
              ctx!.fillStyle = refGrd;
              ctx!.fillRect(sx, sy, T, T);
            }
          } else if (isVertCorridor) {
            // 수직 복도 — 세로 목재 플랭크 패턴
            const plankShade = x % 2 === 0 ? '#232640' : '#1f2239';
            ctx!.fillStyle = plankShade;
            ctx!.fillRect(sx, sy, T, T);
            // 플랭크 수직 결 선
            ctx!.strokeStyle = '#181b2d';
            ctx!.lineWidth = 0.6;
            ctx!.beginPath(); ctx!.moveTo(sx, sy); ctx!.lineTo(sx, sy + T); ctx!.stroke();
            // 미세 수평 결
            if (y % 3 === 0) {
              ctx!.fillStyle = 'rgba(255,255,255,0.008)';
              ctx!.fillRect(sx + 3, sy + T / 2, T - 6, 1);
            }
          } else {
            // 일반 오픈 영역 — 헤링본 패턴 (45도 대각선)
            const hbBase = (x + y) % 2 === 0 ? '#212435' : '#1e2132';
            ctx!.fillStyle = hbBase;
            ctx!.fillRect(sx, sy, T, T);
            // 헤링본 대각선 결
            if ((x + y) % 4 === 0) {
              ctx!.strokeStyle = 'rgba(255,255,255,0.012)';
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(sx + T * 0.2, sy + T * 0.8);
              ctx!.lineTo(sx + T * 0.8, sy + T * 0.2);
              ctx!.stroke();
            } else if ((x + y) % 4 === 2) {
              ctx!.strokeStyle = 'rgba(255,255,255,0.008)';
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(sx + T * 0.2, sy + T * 0.2);
              ctx!.lineTo(sx + T * 0.8, sy + T * 0.8);
              ctx!.stroke();
            }
            ctx!.strokeStyle = '#191c2a20';
            ctx!.lineWidth = 0.3;
            ctx!.strokeRect(sx, sy, T, T);
          }
        }
      }

      // ── 발자국 이펙트 ──────────────────────────────────────────
      footstepsRef.current = footstepsRef.current.filter(f => f.life > 0);
      for (const f of footstepsRef.current) {
        f.life--;
        const alpha = (f.life / 28) * 0.35;
        const fx = f.x * T - camX + T / 2;
        const fy = f.y * T - camY + T / 2 + 10;
        ctx!.fillStyle = `rgba(88,166,255,${alpha})`;
        ctx!.beginPath();
        ctx!.ellipse(fx - 3, fy, 2.5, 1.5, -0.3, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.beginPath();
        ctx!.ellipse(fx + 3, fy, 2.5, 1.5, 0.3, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Decorations — 기본 장식(화분/조명/게시판/시계)만 유지
      drawDecorations(ctx!, camX, camY, frameCountRef.current);
      // 과한 장식 비활성: 중앙 아트리움, 카페 코너, 빛줄기, 먼지 파티클
      // (함수는 보존하되 호출 안 함 — 통일성 회복 우선)

      // ── 시간대별 mood overlay (KST) ──
      // 캔버스 전체에 얇은 컬러 레이어로 시간감 부여 (드로잉 완료 후 맨 위)
      {
        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const h = nowKst.getUTCHours();
        let moodFill: string | null = null;
        if (h >= 23 || h < 6) moodFill = 'rgba(20, 30, 60, 0.35)';       // 심야
        else if (h < 9) moodFill = 'rgba(255, 180, 100, 0.10)';           // 새벽
        else if (h >= 18 && h < 23) moodFill = 'rgba(160, 80, 140, 0.12)'; // 황혼
        if (moodFill) {
          const { w: cw, h: ch } = logicalSizeRef.current;
          ctx!.save();
          ctx!.globalCompositeOperation = 'source-over';
          ctx!.fillStyle = moodFill;
          ctx!.fillRect(0, 0, cw, ch);
          ctx!.restore();
        }
      }

      // ── 클릭-투-무브 목표 타일 표시 (게더타운 스타일) ──────────
      const pt = pathTargetRef.current;
      if (pt) {
        const fcNow = frameCountRef.current;
        const ptx = pt.x * T - camX;
        const pty = pt.y * T - camY;
        const pulse = 0.5 + Math.sin(fcNow * 0.15) * 0.5;
        // 타일 배경 글로우
        const tileGrd = ctx!.createRadialGradient(ptx + T / 2, pty + T / 2, 0, ptx + T / 2, pty + T / 2, T * 0.8);
        tileGrd.addColorStop(0, `rgba(88,166,255,${0.18 * pulse})`);
        tileGrd.addColorStop(1, 'transparent');
        ctx!.fillStyle = tileGrd;
        ctx!.fillRect(ptx - T * 0.3, pty - T * 0.3, T * 1.6, T * 1.6);
        // 타일 하이라이트 테두리
        ctx!.strokeStyle = `rgba(88,166,255,${0.5 * pulse})`;
        ctx!.lineWidth = 1.5;
        ctx!.strokeRect(ptx + 3, pty + 3, T - 6, T - 6);
        // 확산 링 (2개)
        for (let ri = 0; ri < 2; ri++) {
          const ringProgress = ((fcNow * 0.04 + ri * 0.5) % 1);
          const ringR = 4 + ringProgress * 14;
          const ringAlpha = (1 - ringProgress) * 0.7;
          ctx!.strokeStyle = `rgba(88,166,255,${ringAlpha})`;
          ctx!.lineWidth = 1.2;
          ctx!.beginPath();
          ctx!.arc(ptx + T / 2, pty + T / 2, ringR, 0, Math.PI * 2);
          ctx!.stroke();
        }
        // 다이아몬드 마커 (X 대신)
        ctx!.fillStyle = `rgba(88,166,255,${0.7 + pulse * 0.3})`;
        const cx2 = ptx + T / 2, cy2 = pty + T / 2;
        const ds = 5 + pulse * 1.5;
        ctx!.beginPath();
        ctx!.moveTo(cx2, cy2 - ds);
        ctx!.lineTo(cx2 + ds, cy2);
        ctx!.lineTo(cx2, cy2 + ds);
        ctx!.lineTo(cx2 - ds, cy2);
        ctx!.closePath();
        ctx!.fill();
        // 경로 잔상 (최근 3칸)
        const pathQueue = pathRef.current.slice(0, 3);
        pathQueue.forEach((step, si) => {
          const sa = 0.12 - si * 0.03;
          const sx2 = step.x * T - camX + T / 2;
          const sy2 = step.y * T - camY + T / 2;
          ctx!.fillStyle = `rgba(88,166,255,${sa})`;
          ctx!.beginPath();
          ctx!.arc(sx2, sy2, 3, 0, Math.PI * 2);
          ctx!.fill();
        });
      }

      // ── 방 남쪽 벽 드롭 섀도우 — 복도 바닥에 투사 (3D 깊이감) ──
      for (const r of ROOMS) {
        if (r.type === 'cron') continue;
        const srx = r.x * T - camX;
        const sry = r.y * T - camY;
        const srw = r.w * T;
        const srh = r.h * T;
        // 남쪽 드롭 섀도
        const sdGrd = ctx!.createLinearGradient(srx, sry + srh, srx, sry + srh + T * 1.2);
        sdGrd.addColorStop(0, 'rgba(0,0,0,0.28)');
        sdGrd.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        sdGrd.addColorStop(1, 'transparent');
        ctx!.fillStyle = sdGrd;
        ctx!.fillRect(srx + 6, sry + srh, srw - 12, T * 1.2);
        // 우측 드롭 섀도 (약함)
        const seGrd = ctx!.createLinearGradient(srx + srw, sry, srx + srw + T * 0.5, sry);
        seGrd.addColorStop(0, 'rgba(0,0,0,0.12)');
        seGrd.addColorStop(1, 'transparent');
        ctx!.fillStyle = seGrd;
        ctx!.fillRect(srx + srw, sry + 8, T * 0.5, srh - 8);
      }

      // Rooms
      for (const r of ROOMS) drawRoom(r, camX, camY);

      // ── 근접 방 Proximity Glow (게더타운 스타일) ───────────────
      if (nearby) {
        const fcG = frameCountRef.current;
        const nr = nearby;
        const grx = nr.x * T - camX, gry = nr.y * T - camY;
        const grw = nr.w * T, grh = nr.h * T;
        const glowPulse = 0.55 + Math.sin(fcG * 0.08) * 0.45;
        // 외곽 글로우 테두리
        ctx!.strokeStyle = nr.teamColor + Math.round(glowPulse * 0x90 + 0x20).toString(16).padStart(2, '0');
        ctx!.lineWidth = 2.5;
        ctx!.shadowColor = nr.teamColor;
        ctx!.shadowBlur = 12 * glowPulse;
        ctx!.strokeRect(grx - 1, gry - 1, grw + 2, grh + 2);
        ctx!.shadowBlur = 0;
        // 문 쪽 바닥 하이라이트 (문은 아래쪽)
        const doorTileX = (nr.x + Math.floor(nr.w / 2)) * T - camX;
        const doorBaseY = (nr.y + nr.h - 1) * T - camY;
        const doorGrd = ctx!.createRadialGradient(doorTileX + T, doorBaseY + T / 2, 0, doorTileX + T, doorBaseY + T / 2, T * 2.5);
        doorGrd.addColorStop(0, nr.teamColor + Math.round(glowPulse * 0x28).toString(16).padStart(2, '0'));
        doorGrd.addColorStop(1, 'transparent');
        ctx!.fillStyle = doorGrd;
        ctx!.fillRect(doorTileX - T * 1.5, doorBaseY, T * 5, T * 3);
        // "E 대화" 아이콘 (문 바로 아래)
        const eIconY = doorBaseY + T * 1.4;
        const eAlpha = 0.5 + glowPulse * 0.5;
        ctx!.save();
        ctx!.shadowColor = nr.teamColor;
        ctx!.shadowBlur = 8 * glowPulse;
        ctx!.fillStyle = `rgba(255,255,255,${eAlpha})`;
        ctx!.font = 'bold 10px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText('[E]', doorTileX + T, eIconY);
        ctx!.restore();
      }

      // Door nameplates
      for (const r of ROOMS) drawDoorNameplate(r, camX, camY);

      // ── Y-sorted 렌더링 (앞쪽 엔티티가 뒤쪽을 가림 — 게더타운 깊이감) ──
      const tw2 = tweenRef.current;
      const playerWorldY = tw2.active
        ? (tw2.sy + (tw2.ty - tw2.sy) * tw2.t) * T
        : playerRef.current.y * T;
      const renderEntities: Array<{ worldY: number; draw: () => void }> = [];
      for (const r of ROOMS) {
        if (r.id === 'cron-center') continue;
        renderEntities.push({ worldY: r.npcY * T, draw: () => drawNPC(r, camX, camY) });
      }
      renderEntities.push({ worldY: playerWorldY, draw: () => drawPlayer(camX, camY) });
      renderEntities.sort((a, b) => a.worldY - b.worldY);
      for (const e of renderEntities) e.draw();

      // Interact prompt
      if (nearby && !popupOpenRef.current) {
        drawInteractPrompt(nearby, camX, camY);
      }

      // ── HUD 패스: 줌 해제 → 화면 좌표계 (w×h) ──────────────
      ctx!.setTransform(_dpr, 0, 0, _dpr, 0, 0);

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

      // Time (KST) + 줌 인디케이터
      ctx!.textAlign = 'right';
      ctx!.font = '11px monospace';
      const now = new Date();
      ctx!.fillStyle = '#c9a227';
      ctx!.fillText(now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST', w - 16, h - 14);
      // 줌 레벨 표시 (1.0x가 아닐 때만 강조)
      const zoomPct = Math.round(_zoom * 100);
      ctx!.fillStyle = _zoom !== 1 ? '#58a6ff' : '#484f58';
      ctx!.fillText(`🔍 ${zoomPct}%`, w - 16, h - 28);

      // Minimap
      drawMinimap(w, h);

      // ── 구역 진입 토스트 (게더타운 "You are in [ZONE]" 스타일) ──
      if (zoneToastRef.current) {
        const zt = zoneToastRef.current;
        zt.frame++;
        const TOAST_IN = 20, TOAST_HOLD = 80, TOAST_OUT = 30;
        const totalLife = TOAST_IN + TOAST_HOLD + TOAST_OUT;
        if (zt.frame > totalLife) {
          zoneToastRef.current = null;
        } else {
          let toastAlpha = 1;
          if (zt.frame < TOAST_IN) toastAlpha = zt.frame / TOAST_IN;
          else if (zt.frame > TOAST_IN + TOAST_HOLD) toastAlpha = 1 - (zt.frame - TOAST_IN - TOAST_HOLD) / TOAST_OUT;
          const slideY = zt.frame < TOAST_IN ? (1 - zt.frame / TOAST_IN) * 20 : 0;
          const toastText = `${zt.emoji} ${zt.text} 구역 진입`;
          ctx!.font = 'bold 12px monospace';
          const toastW = ctx!.measureText(toastText).width + 28;
          const toastH = 32;
          const toastX = w / 2 - toastW / 2;
          const toastY = 52 + slideY;
          // 배경
          ctx!.save();
          ctx!.globalAlpha = toastAlpha;
          ctx!.fillStyle = '#0d1117ee';
          ctx!.beginPath();
          ctx!.roundRect(toastX, toastY, toastW, toastH, 8);
          ctx!.fill();
          ctx!.strokeStyle = zt.color + '60';
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.roundRect(toastX, toastY, toastW, toastH, 8);
          ctx!.stroke();
          // 왼쪽 컬러 바
          ctx!.fillStyle = zt.color;
          ctx!.beginPath();
          ctx!.roundRect(toastX, toastY, 3, toastH, [8, 0, 0, 8]);
          ctx!.fill();
          // 텍스트
          ctx!.fillStyle = '#e6edf3';
          ctx!.textAlign = 'center';
          ctx!.fillText(toastText, w / 2, toastY + toastH / 2 + 4);
          ctx!.restore();
        }
      }

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
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStartZoom);
      canvas.removeEventListener('touchmove', onTouchMoveZoom);
      canvas.removeEventListener('touchend', onTouchEndZoom);
      canvas.removeEventListener('dblclick', onDblClick);
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
      setChatPanelOpen(false); // 새 팀장 열 때 채팅 패널 닫기
    } else {
      setChatMessages([]);
      setChatPanelOpen(false);
    }
  }, [briefing, loadChatHistory]);

  // Chat auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── 메시지 전송 (인앱 대화, Groq SSE 스트리밍) ─────────────
  const chatAbortRef = useRef<AbortController | null>(null);

  const sendMessage = async () => {
    if (!chatInput.trim() || !briefing) return;
    // 이전 스트림이 있으면 abort
    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    setChatLoading(true);
    setChatResp('');
    const msg = chatInput;
    setChatInput('');
    const nowSec = Math.floor(Date.now() / 1000);
    setChatMessages(prev => [
      ...prev,
      { role: 'user', content: msg, created_at: nowSec },
      { role: 'assistant', content: '', created_at: nowSec }, // placeholder for streaming
    ]);

    const appendToken = (token: string) => {
      setChatMessages(prev => {
        if (prev.length === 0) return prev;
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + token };
        }
        return next;
      });
    };

    try {
      const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
      const teamId = room?.entityId || briefing.id;
      const res = await fetch('/api/game/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, message: msg }),
        signal: ac.signal,
      });

      // 429/4xx/5xx는 JSON 에러
      if (!res.ok) {
        let errMsg = '응답 실패';
        try {
          const j = await res.json();
          if (j?.error) errMsg = j.error;
        } catch { /* ignore */ }
        // placeholder 제거
        setChatMessages(prev => prev.filter((_, i) => !(i === prev.length - 1 && _.role === 'assistant' && _.content === '')));
        setChatResp(errMsg);
        setChatLoading(false);
        return;
      }

      if (!res.body) {
        setChatResp('응답 본문이 비어 있습니다');
        setChatLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed = JSON.parse(payload) as {
                token?: string;
                done?: boolean;
                id?: number;
                error?: string;
              };
              if (parsed.error) {
                streamError = parsed.error;
                break outer;
              }
              if (parsed.token) {
                appendToken(parsed.token);
              }
              if (parsed.done) {
                break outer;
              }
            } catch { /* non-json ignore */ }
          }
        }
      }

      if (streamError) {
        setChatResp(streamError);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setChatResp('응답 실패 — 잠시 후 다시 시도해주세요');
      }
    } finally {
      setChatLoading(false);
      if (chatAbortRef.current === ac) chatAbortRef.current = null;
    }
  };

  // 팝업 닫힐 때 진행 중 스트림 중단
  useEffect(() => {
    if (!briefing) {
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
    }
  }, [briefing]);

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0d1117' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: viewMode === 'map' ? 'block' : 'none',
          width: '100vw', height: '100vh', touchAction: 'none',
          // 인터랙터블 요소 호버 시 포인터 커서
          cursor: tooltipRoom ? 'pointer' : 'default',
        }}
      />

      {/* ── 표 모드 ── */}
      {viewMode === 'table' && (
        <DashboardTable isMobile={isMobile} onRowClick={handleTableRowClick} />
      )}

      {/* ── 맵/표 토글 (우상단) ── */}
      <div style={{
        position: 'fixed',
        top: isMobile ? 12 : 20,
        right: isMobile ? 12 : 24,
        zIndex: 900,
        display: 'flex',
        background: 'rgba(13,17,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 3,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
      }}>
        {(['map', 'table'] as const).map(mode => {
          const active = viewMode === mode;
          const label = mode === 'map' ? '🗺️ 맵' : '📊 표';
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              aria-pressed={active}
              style={{
                padding: isMobile ? '6px 10px' : '7px 14px',
                fontSize: isMobile ? 11 : 12,
                fontWeight: 700,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: active ? '#c9a227' : 'transparent',
                color: active ? '#0d1117' : '#8b949e',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 우상단 Board 배너 (오늘 회의록 KPI) */}
      {viewMode === 'map' && <BoardBanner />}

      {/* 우상단 2차 정보 패널 (예정 크론 + 최근 커밋) */}
      {viewMode === 'map' && <RightInfoPanels isMobile={isMobile} />}

      {/* 좌하단 실시간 크론 이벤트 토스트 (SSE) */}
      {viewMode === 'map' && <CronToastStack />}

      {/* 좌상단 통합 statusline (Claude/CPU/RAM/Disk/Cron 24h) */}
      <Statusline isMobile={isMobile} />

      {/* ── 게임 인트로 오버레이 ── */}
      {showIntro && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#0d1117',
            border: '1px solid #30363d',
            borderTop: '3px solid #c9a227',
            borderRadius: 20,
            padding: isMobile ? '28px 24px 32px' : '36px 44px 40px',
            maxWidth: 520,
            width: isMobile ? '92vw' : '90vw',
            color: '#e6edf3',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
          }}>
            {/* 헤더 */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f6fc', marginBottom: 6 }}>JARVIS MAP</div>
              <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6 }}>
                자비스 컴퍼니의 가상 오피스입니다.<br />
                팀장·크론잡을 클릭해 실시간 현황을 확인하세요.
              </div>
            </div>

            {/* 사용 방법 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {[
                { icon: '🕹️', label: isMobile ? 'D-pad' : 'WASD / 방향키', desc: '캐릭터 이동' },
                { icon: '⌨️', label: isMobile ? '탭' : '[E] 또는 스페이스', desc: '가까운 팀장에게 말걸기' },
                { icon: '🖱️', label: isMobile ? '탭' : '클릭', desc: '팀장 NPC · 크론 워크스테이션 클릭 → 상세 팝업' },
                { icon: '⏰', label: '크론센터 (하단)', desc: '전사 크론잡 실시간 상태 · 클릭 시 역할·이력 확인' },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: '#161b22',
                  border: '1px solid #21262d', borderRadius: 10,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#c9d1d9' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#6e7681', marginTop: 1 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                sessionStorage.setItem('jarvis-map-intro-v2', '1');
                setShowIntro(false);
              }}
              style={{
                width: '100%', padding: '14px 0',
                background: '#c9a227', border: 'none',
                borderRadius: 12, color: '#0d1117',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              🏢 오피스 입장
            </button>
          </div>
        </div>
      )}

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
          position: 'fixed',
          bottom: isMobile ? 220 : 54,
          left: '50%', transform: 'translateX(-50%)',
          padding: '8px 18px', borderRadius: 10,
          background: 'rgba(0,0,0,0.8)', color: '#e6edf3',
          fontSize: 13, fontFamily: 'monospace', pointerEvents: 'none',
          border: `1px solid ${nearbyRoom.teamColor}50`,
          boxShadow: `0 0 12px ${nearbyRoom.teamColor}20`,
          whiteSpace: 'nowrap',
        }}>
          {nearbyRoom.emoji} {nearbyRoom.name} — {isMobile ? '탭으로 대화' : '[E]키로 대화'}
        </div>
      )}


      {/* ── Team Briefing Popup ── */}
      <TeamBriefingPopup
        popupOpen={popupOpen}
        popupLoading={popupLoading}
        briefing={briefing}
        isMobile={isMobile}
        cronData={cronData}
        closePopup={closePopup}
        chatPanelOpen={chatPanelOpen}
        setChatPanelOpen={setChatPanelOpen}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatResp={chatResp}
        sendMessage={sendMessage}
        chatEndRef={chatEndRef}
      />

      {/* ── Cron Center Grid Popup ── */}
      {cronGridOpen && (
        <CronGridPopup
          cronData={cronData}
          cronFilter={cronFilter}
          setCronFilter={setCronFilter}
          cronSearch={cronSearch}
          setCronSearch={setCronSearch}
          isMobile={isMobile}
          closePopup={closePopup}
          setCronPopup={setCronPopup}
          setCronGridOpen={setCronGridOpen}
          setPopupOpen={setPopupOpen}
        />
      )}

      {/* ── Cron Tile Detail Popup ── */}
      {cronPopup && (
        <CronDetailPopup
          cronPopup={cronPopup}
          isMobile={isMobile}
          setCronPopup={setCronPopup}
          setPopupOpen={setPopupOpen}
        />
      )}

      {/* ── Mobile Controls ── */}
      <MobileControls
        isMobile={isMobile}
        popupOpen={popupOpen}
        cronGridOpen={cronGridOpen}
        keysRef={keysRef}
        showMobileHelp={showMobileHelp}
        setShowMobileHelp={setShowMobileHelp}
      />

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
