'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  T, COLS, ROWS, MOVE_SPEED,
  ROOMS, AGENT_TEAM_TO_ROOM, statusExplanation,
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
  const [activeRoom, setActiveRoom] = useState<RoomDef | null>(null);
  const [nearbyRoom, setNearbyRoom] = useState<RoomDef | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatResp, setChatResp] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipRoom, setTooltipRoom] = useState<{ room: RoomDef; x: number; y: number } | null>(null);
  // showMobileHelp removed — D-pad 제거로 불필요
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
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  // 뷰 모드 (맵 / 표) — localStorage 영속화
  const [viewMode, setViewMode] = useState<'map' | 'table'>(() => {
    if (typeof window === 'undefined') return 'map';
    const v = localStorage.getItem('jarvis-map-view-mode');
    return v === 'table' ? 'table' : 'map';
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 게임 상태 refs
  const playerRef = useRef({ x: 25, y: 10 });
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
  const zoomRef = useRef(1.0); // 줌 레벨 (0.55 ~ 2.4) — 초기 100%
  const cronDataRef = useRef<CronItem[]>([]);
  // ── 성능: 바닥 타일 오프스크린 캔버스 캐시 ──
  const floorCacheRef = useRef<HTMLCanvasElement | null>(null);
  // ── 성능: 방 드롭 섀도 그라데이션 캐시 ──
  const shadowCacheRef = useRef<Map<string, { south: CanvasGradient; east: CanvasGradient }>>(new Map());

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
    // briefing은 유지 — 팝업 재오픈 시 기존 대화 + 정보 복원
    // 다른 NPC 클릭 시 briefing이 교체되면서 자연스럽게 초기화됨
    setPopupLoading(false);
    setChatResp('');
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
        // 여러 팀이 같은 룸에 매핑될 때 (ex. growth-lead = growth-team + academy-team):
        // skipped/unknown 상태가 이미 의미 있는 상태(success/failed)를 덮어쓰지 않음
        const existing = states[roomId];
        if (existing && (team.status === 'skipped' || team.status === 'unknown')) continue;
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
          // 데이터가 실제 변경된 경우에만 setState — 불필요한 리렌더(화면 지지직) 방지
          const prev = cronDataRef.current;
          const changed = prev.length !== crons.length
            || crons.some((c, i) => c.id !== prev[i]?.id || c.status !== prev[i]?.status);
          if (changed) setCronData(crons);
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
    setActiveRoom(room);
    setChatResp('');

    const entityId = room.entityId;

    // Server room: fetch Mac Mini metrics + RAG health
    if (room.id === 'server-room') {
      try {
        const [diskRes, botRes, ragRes] = await Promise.all([
          fetch('/api/entity/disk-storage/briefing').catch(() => null),
          fetch('/api/entity/discord-bot/briefing').catch(() => null),
          fetch('/api/entity/rag-memory/briefing').catch(() => null),
        ]);
        const diskData = diskRes?.ok ? await diskRes.json() as BriefingData : null;
        const botData = botRes?.ok ? await botRes.json() as BriefingData : null;
        const ragData = ragRes?.ok ? await ragRes.json() as BriefingData : null;

        const statuses = [diskData?.status, botData?.status, ragData?.status];
        const worstStatus = statuses.includes('RED') ? 'RED'
          : statuses.includes('YELLOW') ? 'YELLOW' : 'GREEN';

        const summaryParts: string[] = [];
        if (diskData?.summary) summaryParts.push(diskData.summary);
        if (botData?.summary) summaryParts.push(botData.summary);
        if (ragData?.summary) summaryParts.push(ragData.summary);

        setBriefing({
          id: room.id, name: room.name, emoji: room.emoji,
          status: worstStatus,
          summary: summaryParts.join(' / ') || room.description,
          roomDescription: room.description,
          stats: diskData?.stats || botData?.stats,
          recentActivity: diskData?.recentActivity || botData?.recentActivity || ragData?.recentActivity,
          alerts: [...(diskData?.alerts || []), ...(botData?.alerts || []), ...(ragData?.alerts || [])],
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
          summary: [
            team.lastTask && team.lastTask !== 'idle'
              ? `**최근 작업** · \`${team.lastTask}\``
              : null,
            team.lastMessage && !['SKIPPED','disabled','START','시작'].some(k => (team.lastMessage||'').includes(k))
              ? `**결과** · ${team.lastMessage}`
              : null,
            team.schedule ? `**스케줄** · ${team.schedule}` : null,
          ].filter(Boolean).join('\n\n') || `**${team.label}** 대기 중`,
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

    // ── 클릭/탭 핸들러 ──
    // pointer 이벤트 대신 click 이벤트 사용:
    //   - touch-action: none 환경에서 click은 탭 직후 즉시 발생 (300ms 지연 없음)
    //   - 브라우저가 탭 vs 드래그를 자동 구분 (드래그 시 click 미발생)
    //   - pointercancel/capture 복잡도 없이 모바일/데스크탑 동일 동작 보장
    const onClick = (e: MouseEvent) => {
      if (popupOpenRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / zoomRef.current;
      const clickY = (e.clientY - rect.top) / zoomRef.current;
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      // 크론 NPC 클릭 체크 — grid-based (proximity overlap 없음)
      const cronRoom = ROOMS.find(r => r.id === 'cron-center');
      if (cronRoom) {
        const crRx = cronRoom.x * T - camX;
        const crRy = cronRoom.y * T - camY;
        const crRw = cronRoom.w * T;
        const crRh = cronRoom.h * T;
        if (clickX >= crRx && clickX < crRx + crRw && clickY >= crRy && clickY < crRy + crRh) {
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
          setCronGridOpen(true);
          // setPopupOpen(true) 호출 금지 — TeamBriefingPopup(zIndex:9999)이 CronGridPopup(1050)을 덮음
          return;
        }
      }

      // NPC 근접 체크 (데스크탑 정밀 클릭)
      for (const r of ROOMS) {
        const nx = r.npcX * T - camX + T / 2;
        const ny = r.npcY * T - camY + T / 2;
        const dist = Math.sqrt((clickX - nx) ** 2 + (clickY - ny) ** 2);
        if (dist < 28) {
          openBriefing(r);
          return;
        }
      }

      // 방 영역 탭 (모바일 — 넓은 터치 타겟)
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
    canvas.addEventListener('click', onClick);

    // Hover tooltip for rooms (데스크탑 마우스 전용)
    const onPointerMove = (e: PointerEvent) => {
      // 터치 디바이스는 hover 툴팁 비활성화
      if (e.pointerType === 'touch') { setTooltipRoom(null); return; }
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

    // ── 줌: 마우스 휠 (커서 위치 기준 중심점 보정) ──────────────
    const ZOOM_MIN = 0.55, ZOOM_MAX = 2.4;
    const onWheel = (e: WheelEvent) => {
      if (popupOpenRef.current) return; // 팝업 열린 동안 캔버스 줌 차단
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      const prevZoom = zoomRef.current;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prevZoom * factor));
      const rect2 = canvas.getBoundingClientRect();
      const mx = e.clientX - rect2.left;
      const my = e.clientY - rect2.top;
      cameraRef.current.x += mx / prevZoom - mx / nextZoom;
      cameraRef.current.y += my / prevZoom - my / nextZoom;
      zoomRef.current = nextZoom;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ── 줌: 핀치 제스처 (모바일 두 손가락) ─────────────────────
    // 핀치 중심점 기준 카메라 보정: 줌 전후 중심점이 같은 월드 좌표를 가리키도록
    let _pinchDist = 0;
    let _pinchMidX = 0;  // 핀치 중심 CSS 픽셀 X
    let _pinchMidY = 0;  // 핀치 중심 CSS 픽셀 Y
    const onTouchStartZoom = (e: TouchEvent) => {
      if (popupOpenRef.current) return;
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _pinchDist = Math.sqrt(dx * dx + dy * dy);
        _pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        _pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    };
    const onTouchMoveZoom = (e: TouchEvent) => {
      if (popupOpenRef.current || e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (_pinchDist > 0) {
        const scaleDelta = dist / _pinchDist;
        const prevZoom = zoomRef.current;
        const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prevZoom * scaleDelta));
        // 핀치 중심점이 줌 전후 동일한 월드 좌표를 가리키도록 카메라 보정
        // 월드 좌표 = (midX / prevZoom + camX) → nextZoom 적용 후 같은 midX 위치 유지
        const rect2 = canvas.getBoundingClientRect();
        const midX = _pinchMidX - rect2.left;
        const midY = _pinchMidY - rect2.top;
        cameraRef.current.x += midX / prevZoom - midX / nextZoom;
        cameraRef.current.y += midY / prevZoom - midY / nextZoom;
        zoomRef.current = nextZoom;
      }
      _pinchDist = dist;
      _pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      _pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
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

      // 오픈 오피스 파드 — 벽 없음, 러그로 팀 구분 (실제 오피스 카펫 느낌)
      if (r.wallStyle === 'pod') {
        // 바닥 베이스 (오피스 카펫 타일)
        ctx!.save();
        ctx!.shadowBlur = 10;
        ctx!.shadowColor = 'rgba(20,30,50,0.10)';
        ctx!.shadowOffsetY = 2;
        ctx!.fillStyle = '#f4f3ee';
        ctx!.fillRect(rx, ry, rw, rh);
        ctx!.restore();
        // 베이스 카펫 직조 패턴
        ctx!.save();
        ctx!.beginPath();
        ctx!.rect(rx, ry, rw, rh);
        ctx!.clip();
        for (let gy = 0; gy < r.h; gy++) {
          for (let gx = 0; gx < r.w; gx++) {
            const tx = rx + gx * T;
            const ty = ry + gy * T;
            ctx!.fillStyle = (gx + gy) % 2 === 0 ? '#f1efe8' : '#edebe2';
            ctx!.fillRect(tx, ty, T, T);
            ctx!.fillStyle = 'rgba(180,170,140,0.10)';
            for (let i = 4; i < T; i += 8) {
              ctx!.fillRect(tx, ty + i, T, 1);
              ctx!.fillRect(tx + i, ty, 1, T);
            }
          }
        }
        ctx!.restore();

        // ── 팀 컬러 러그 (오피스 데스크 존 표시) ──
        const rugMarginX = rw * 0.12;
        const rugMarginY = rh * 0.15;
        const rugX = rx + rugMarginX;
        const rugY = ry + rugMarginY;
        const rugW = rw - rugMarginX * 2;
        const rugH = rh - rugMarginY * 2;

        // 러그 드롭 섀도
        ctx!.save();
        ctx!.shadowColor = 'rgba(30,40,60,0.25)';
        ctx!.shadowBlur = 6;
        ctx!.shadowOffsetX = 2;
        ctx!.shadowOffsetY = 3;
        // 러그 본체 (팀 컬러 베이스)
        ctx!.fillStyle = r.teamColor + 'aa';
        ctx!.fillRect(rugX, rugY, rugW, rugH);
        ctx!.restore();

        // 러그 내부 직조 (체커)
        ctx!.save();
        ctx!.beginPath();
        ctx!.rect(rugX, rugY, rugW, rugH);
        ctx!.clip();
        const weaveSize = 4;
        for (let wy = 0; wy < rugH; wy += weaveSize) {
          for (let wx = 0; wx < rugW; wx += weaveSize) {
            if (((Math.floor(wx / weaveSize) + Math.floor(wy / weaveSize)) % 2) === 0) {
              ctx!.fillStyle = 'rgba(255,255,255,0.12)';
              ctx!.fillRect(rugX + wx, rugY + wy, weaveSize, weaveSize);
            }
          }
        }
        // 러그 가장자리 프린지 (상하)
        ctx!.fillStyle = r.teamColor + 'e0';
        for (let i = 0; i < rugW; i += 3) {
          ctx!.fillRect(rugX + i, rugY - 2, 2, 2);
          ctx!.fillRect(rugX + i, rugY + rugH, 2, 2);
        }
        // 러그 테두리 (어두운 선)
        ctx!.strokeStyle = r.teamColor + 'ff';
        ctx!.lineWidth = 1.5;
        ctx!.strokeRect(rugX + 1, rugY + 1, rugW - 2, rugH - 2);
        // 내부 데코 선 (인셋)
        ctx!.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx!.lineWidth = 0.8;
        ctx!.strokeRect(rugX + 4, rugY + 4, rugW - 8, rugH - 8);
        ctx!.restore();

        // 상태 indicator (LED 점)
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

        // 팀 태그 (밝은 pill)
        const tagText = `${r.emoji} ${r.name}`;
        ctx!.font = 'bold 10px -apple-system, monospace';
        const tagW = ctx!.measureText(tagText).width + 14;
        const tagX = rx + rw / 2 - tagW / 2;
        const tagY = ry + 4;
        ctx!.fillStyle = 'rgba(255,255,255,0.92)';
        ctx!.beginPath();
        ctx!.roundRect(tagX, tagY, tagW, 16, 8);
        ctx!.fill();
        ctx!.fillStyle = r.teamColor;
        ctx!.fillRect(tagX, tagY + 2, 2, 12);
        ctx!.fillStyle = '#2d3340';
        ctx!.textAlign = 'center';
        ctx!.fillText(tagText, rx + rw / 2, tagY + 11);

        // 5. 가구
        drawRoomFurniture(ctx!, r, rx, ry, rw, rh, frameCountRef.current, cronDataRef.current.slice(0, CRON_COLS * CRON_ROWS));
        return;
      }

      // ── Closed room (다크 테마) ──────────────────────────────────
      // 방 드롭 섀도
      ctx!.save();
      ctx!.shadowBlur = 12;
      ctx!.shadowColor = 'rgba(0,0,0,0.08)';
      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(rx, ry, rw, rh);
      ctx!.restore();

      // Floor based on floorStyle (실제 회사처럼 — 게더타운 스타일 디테일)
      switch (r.floorStyle) {
        case 'executive': {
          // 원목 플랭크 바닥 (오피스 임원실 느낌)
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rx, ry, rw, rh);
          ctx!.clip();
          // 베이스
          ctx!.fillStyle = '#e4cd9a';
          ctx!.fillRect(rx, ry, rw, rh);
          // 플랭크 — 2열마다 절반 오프셋
          const plankW = T * 2.2;
          const plankH = T * 0.85;
          const woodTones = ['#e3cc98', '#d9bf86', '#cfb378', '#d6ba84'];
          for (let py = 0; py < rh; py += plankH) {
            const rowIdx = Math.floor(py / plankH);
            const offset = (rowIdx % 2) * (plankW / 2);
            for (let px = -plankW; px < rw + plankW; px += plankW) {
              const x = rx + px + offset;
              const y = ry + py;
              const tone = woodTones[(Math.floor(px / plankW) + rowIdx * 3) % woodTones.length];
              ctx!.fillStyle = tone;
              ctx!.fillRect(x, y, plankW - 1, plankH - 1);
              // 판재 하단 그림자
              ctx!.fillStyle = 'rgba(90,60,20,0.18)';
              ctx!.fillRect(x, y + plankH - 1, plankW, 1);
              // 우측 엣지 라인
              ctx!.fillStyle = 'rgba(90,60,20,0.12)';
              ctx!.fillRect(x + plankW - 1, y, 1, plankH);
              // 결(grain) 2줄 — 부드러운 곡선
              ctx!.strokeStyle = 'rgba(140,90,30,0.20)';
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(x + 2, y + plankH * 0.35);
              ctx!.bezierCurveTo(x + plankW * 0.3, y + plankH * 0.4, x + plankW * 0.7, y + plankH * 0.28, x + plankW - 2, y + plankH * 0.35);
              ctx!.stroke();
              ctx!.beginPath();
              ctx!.moveTo(x + 2, y + plankH * 0.72);
              ctx!.bezierCurveTo(x + plankW * 0.35, y + plankH * 0.78, x + plankW * 0.7, y + plankH * 0.68, x + plankW - 2, y + plankH * 0.72);
              ctx!.stroke();
            }
          }
          // 샹들리에 warm glow (천장 조명 반사)
          const grdExec = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.65);
          grdExec.addColorStop(0, 'rgba(255,220,130,0.25)');
          grdExec.addColorStop(0.4, 'rgba(255,200,90,0.10)');
          grdExec.addColorStop(1, 'rgba(0,0,0,0.08)');
          ctx!.fillStyle = grdExec;
          ctx!.fillRect(rx, ry, rw, rh);
          ctx!.restore();
          break;
        }
        case 'metal': {
          // 서버룸/크론센터 — 레이즈드 플로어 타일 + LED 스트립
          const isCronCenter = r.id === 'cron-center';
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rx, ry, rw, rh);
          ctx!.clip();
          // 어두운 베이스 (데이터센터 분위기)
          ctx!.fillStyle = isCronCenter ? '#e0e5ee' : '#dde2eb';
          ctx!.fillRect(rx, ry, rw, rh);
          // 60cm × 60cm 타일 (T 단위)
          for (let gy = 0; gy < r.h; gy++) {
            for (let gx = 0; gx < r.w; gx++) {
              const tx = rx + gx * T;
              const ty = ry + gy * T;
              const checker = (gx + gy) % 2 === 0;
              // 타일 본체
              ctx!.fillStyle = checker ? '#e6ebf3' : '#dce2eb';
              ctx!.fillRect(tx + 1, ty + 1, T - 2, T - 2);
              // 타일 하이라이트 (좌상)
              ctx!.fillStyle = 'rgba(255,255,255,0.6)';
              ctx!.fillRect(tx + 1, ty + 1, T - 2, 1);
              ctx!.fillRect(tx + 1, ty + 1, 1, T - 2);
              // 타일 그림자 (우하)
              ctx!.fillStyle = 'rgba(90,100,115,0.25)';
              ctx!.fillRect(tx + 1, ty + T - 2, T - 2, 1);
              ctx!.fillRect(tx + T - 2, ty + 1, 1, T - 2);
              // 타일 중앙 4개 나사 (perforation)
              if (!isCronCenter || (gx + gy) % 3 === 0) {
                ctx!.fillStyle = 'rgba(100,110,125,0.5)';
                for (const [px, py] of [[T * 0.2, T * 0.2], [T * 0.8, T * 0.2], [T * 0.2, T * 0.8], [T * 0.8, T * 0.8]] as [number, number][]) {
                  ctx!.beginPath();
                  ctx!.arc(tx + px, ty + py, 0.8, 0, Math.PI * 2);
                  ctx!.fill();
                }
              }
            }
          }
          // LED 스트립 (가장자리) — cron-center만
          if (isCronCenter) {
            ctx!.fillStyle = 'rgba(88,166,255,0.25)';
            ctx!.fillRect(rx + 4, ry + 4, rw - 8, 2);
            ctx!.fillRect(rx + 4, ry + rh - 6, rw - 8, 2);
            // 펄스 glow
            const pulse = 0.3 + 0.2 * Math.sin(frameCountRef.current * 0.05);
            ctx!.fillStyle = `rgba(88,166,255,${pulse})`;
            ctx!.fillRect(rx + 4, ry + 4, rw - 8, 1);
          }
          ctx!.restore();
          break;
        }
        case 'stage': {
          // 마블 바닥 (회의실 로비 느낌)
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rx, ry, rw, rh);
          ctx!.clip();
          // 크림 베이스
          ctx!.fillStyle = '#f5f1e8';
          ctx!.fillRect(rx, ry, rw, rh);
          // 큰 마블 타일 (2×2)
          const mTile = T * 2;
          for (let gy = 0; gy < r.h; gy += 2) {
            for (let gx = 0; gx < r.w; gx += 2) {
              const tx = rx + gx * T;
              const ty = ry + gy * T;
              ctx!.fillStyle = (gx / 2 + gy / 2) % 2 === 0 ? '#f2ede1' : '#ebe5d5';
              ctx!.fillRect(tx + 2, ty + 2, mTile - 4, mTile - 4);
              // 마블 정맥 (veining) — 랜덤이지만 deterministic
              const seed = (gx * 7 + gy * 13) % 100;
              ctx!.strokeStyle = `rgba(180,165,130,${0.12 + (seed % 3) * 0.04})`;
              ctx!.lineWidth = 0.6;
              ctx!.beginPath();
              ctx!.moveTo(tx + 4 + (seed % 12), ty + 6);
              ctx!.bezierCurveTo(
                tx + mTile * 0.4, ty + mTile * 0.3 + (seed % 5),
                tx + mTile * 0.7 - (seed % 7), ty + mTile * 0.6,
                tx + mTile - 6, ty + mTile - 8 + (seed % 8),
              );
              ctx!.stroke();
              // 타일 그림자
              ctx!.fillStyle = 'rgba(170,150,110,0.15)';
              ctx!.fillRect(tx + 2, ty + mTile - 3, mTile - 4, 1);
              ctx!.fillRect(tx + mTile - 3, ty + 2, 1, mTile - 4);
            }
          }
          // 천장 조명 반사 (무대/프레젠테이션 느낌)
          const grdStage = ctx!.createRadialGradient(rx + rw / 2, ry + rh * 0.3, 0, rx + rw / 2, ry + rh * 0.3, rw * 0.6);
          grdStage.addColorStop(0, 'rgba(255,235,150,0.30)');
          grdStage.addColorStop(0.5, 'rgba(255,220,120,0.08)');
          grdStage.addColorStop(1, 'transparent');
          ctx!.fillStyle = grdStage;
          ctx!.fillRect(rx, ry, rw, rh);
          ctx!.restore();
          break;
        }
        default: {
          // 일반 카펫 타일 (코지한 오피스 카펫)
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rx, ry, rw, rh);
          ctx!.clip();
          ctx!.fillStyle = '#f5f4ef';
          ctx!.fillRect(rx, ry, rw, rh);
          // 직조(weave) 패턴 — 체커
          for (let gy = 0; gy < r.h; gy++) {
            for (let gx = 0; gx < r.w; gx++) {
              const tx = rx + gx * T;
              const ty = ry + gy * T;
              ctx!.fillStyle = (gx + gy) % 2 === 0 ? '#eeede8' : '#f0efea';
              ctx!.fillRect(tx, ty, T, T);
              // 직조 라인 (십자)
              ctx!.fillStyle = 'rgba(180,170,140,0.08)';
              for (let i = 4; i < T; i += 8) {
                ctx!.fillRect(tx, ty + i, T, 1);
                ctx!.fillRect(tx + i, ty, 1, T);
              }
            }
          }
          ctx!.restore();
          break;
        }
      }

      // 팀 컬러 바닥 러그 (40% — 확실한 구분)
      const rugPadX = rw * 0.1;
      const rugPadY = rh * 0.1;
      ctx!.fillStyle = r.teamColor + '40';
      ctx!.fillRect(rx + rugPadX, ry + rugPadY, rw - rugPadX * 2, rh - rugPadY * 2);

      // Inner shadow along walls (subtle on bright)
      const innerShadowSize = 8;
      const grdTop = ctx!.createLinearGradient(rx, ry, rx, ry + innerShadowSize);
      grdTop.addColorStop(0, 'rgba(0,0,0,0.04)');
      grdTop.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdTop;
      ctx!.fillRect(rx, ry, rw, innerShadowSize);
      const grdLeft = ctx!.createLinearGradient(rx, ry, rx + innerShadowSize, ry);
      grdLeft.addColorStop(0, 'rgba(0,0,0,0.03)');
      grdLeft.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdLeft;
      ctx!.fillRect(rx, ry, innerShadowSize, rh);
      const grdRight = ctx!.createLinearGradient(rx + rw, ry, rx + rw - innerShadowSize, ry);
      grdRight.addColorStop(0, 'rgba(0,0,0,0.03)');
      grdRight.addColorStop(1, 'transparent');
      ctx!.fillStyle = grdRight;
      ctx!.fillRect(rx + rw - innerShadowSize, ry, innerShadowSize, rh);

      // Room glow based on status
      if (state) {
        const glowColor = state.status === 'green' ? '#3fb950' : state.status === 'red' ? '#f85149' : '#d29922';
        const grdGlow = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.7);
        grdGlow.addColorStop(0, glowColor + '08');
        grdGlow.addColorStop(1, 'transparent');
        ctx!.fillStyle = grdGlow;
        ctx!.fillRect(rx, ry, rw, rh);
      }

      // 벽 + 문 — closed room만 벽 그림, pod는 이미 위에서 return (다크)
      const isClosed = r.wallStyle === 'closed';
      if (isClosed) {
        const WALL = 9; // 두꺼운 벽
        // ── 드롭 섀도 (외부) ──
        ctx!.save();
        ctx!.shadowColor = 'rgba(20,30,50,0.22)';
        ctx!.shadowBlur = 18;
        ctx!.shadowOffsetX = 4;
        ctx!.shadowOffsetY = 6;
        ctx!.fillStyle = '#e0e4ea';
        ctx!.fillRect(rx, ry, rw, rh);
        ctx!.restore();

        // ── 벽 본체 (3D 베벨 스타일) ──
        // Base fill
        ctx!.fillStyle = '#dde2ea';
        ctx!.fillRect(rx, ry, rw, WALL); // top
        ctx!.fillRect(rx, ry + rh - WALL, rw, WALL); // bottom
        ctx!.fillRect(rx, ry, WALL, rh); // left
        ctx!.fillRect(rx + rw - WALL, ry, WALL, rh); // right

        // 천장 표현 — 상단 벽에 더 진한 그림자 그라디언트 (foreground ceiling hint)
        const ceilingGrd = ctx!.createLinearGradient(rx, ry, rx, ry + WALL + 4);
        ceilingGrd.addColorStop(0, 'rgba(80,90,110,0.45)');
        ceilingGrd.addColorStop(0.6, 'rgba(80,90,110,0.18)');
        ceilingGrd.addColorStop(1, 'transparent');
        ctx!.fillStyle = ceilingGrd;
        ctx!.fillRect(rx, ry, rw, WALL + 4);

        // Top highlight (밝은 상단 엣지 — 조명 받은 느낌)
        ctx!.fillStyle = '#ffffff';
        ctx!.fillRect(rx + 1, ry, rw - 2, 1);
        ctx!.fillStyle = 'rgba(245,248,252,0.85)';
        ctx!.fillRect(rx + 1, ry + 1, rw - 2, 1);

        // Left highlight (조명 왼쪽)
        ctx!.fillStyle = 'rgba(245,248,252,0.7)';
        ctx!.fillRect(rx, ry + 1, 1, rh - 2);
        ctx!.fillStyle = 'rgba(235,240,248,0.5)';
        ctx!.fillRect(rx + 1, ry + 2, 1, rh - 4);

        // Right/Bottom shadow (반대쪽)
        ctx!.fillStyle = 'rgba(100,110,130,0.35)';
        ctx!.fillRect(rx + rw - 1, ry + 1, 1, rh - 1);
        ctx!.fillRect(rx + 1, ry + rh - 1, rw - 2, 1);
        ctx!.fillStyle = 'rgba(120,130,150,0.25)';
        ctx!.fillRect(rx + rw - 2, ry + 2, 1, rh - 3);
        ctx!.fillRect(rx + 2, ry + rh - 2, rw - 4, 1);

        // 벽 내부 face (인테리어 벽면 — 밝은 톤)
        ctx!.fillStyle = '#eceff5';
        ctx!.fillRect(rx + 2, ry + 3, rw - 4, WALL - 5); // top 벽 face
        ctx!.fillRect(rx + 2, ry + rh - WALL + 2, rw - 4, WALL - 5);
        ctx!.fillRect(rx + 2, ry + 3, WALL - 5, rh - 6);
        ctx!.fillRect(rx + rw - WALL + 2, ry + 3, WALL - 5, rh - 6);

        // 팀 컬러 스트라이프 (상단 벽 — 회사 아이덴티티)
        ctx!.fillStyle = r.teamColor + 'd0';
        ctx!.fillRect(rx + WALL, ry + 3, rw - WALL * 2, 2);
        ctx!.fillStyle = r.teamColor + '60';
        ctx!.fillRect(rx + WALL, ry + 5, rw - WALL * 2, 1);

        // 내부 테두리 (방 내부 경계선)
        ctx!.strokeStyle = 'rgba(180,190,210,0.4)';
        ctx!.lineWidth = 1;
        ctx!.strokeRect(rx + WALL, ry + WALL, rw - WALL * 2, rh - WALL * 2);

        // 유리창 — 상단 벽 (진짜 유리 느낌: 프레임 + 반사)
        if (r.type !== 'cron') {
          const windowCount = Math.max(1, Math.floor(r.w / 3));
          const windowW = T * 1.4;
          const windowH = WALL - 3;
          for (let i = 0; i < windowCount; i++) {
            const wx = rx + T * 1.3 + i * T * 2.4;
            // 유리창 프레임 (어두운 알루미늄)
            ctx!.fillStyle = '#5a6370';
            ctx!.fillRect(wx - 1, ry + 1, windowW + 2, windowH + 2);
            // 유리 내부 (하늘 반사)
            const glassGrd = ctx!.createLinearGradient(wx, ry + 1, wx, ry + windowH + 1);
            glassGrd.addColorStop(0, 'rgba(135,206,235,0.9)');
            glassGrd.addColorStop(0.5, 'rgba(176,224,230,0.7)');
            glassGrd.addColorStop(1, 'rgba(100,170,210,0.8)');
            ctx!.fillStyle = glassGrd;
            ctx!.fillRect(wx, ry + 2, windowW, windowH);
            // 반사 하이라이트
            ctx!.fillStyle = 'rgba(255,255,255,0.55)';
            ctx!.fillRect(wx + 1, ry + 2, windowW * 0.25, 1);
            ctx!.fillRect(wx + 1, ry + 2, 1, windowH * 0.6);
            // 유리 분할 (머리부분 가로)
            ctx!.fillStyle = 'rgba(80,90,105,0.6)';
            ctx!.fillRect(wx + windowW / 2 - 0.5, ry + 2, 1, windowH);
          }
        }

        // 문 — 하단 중앙 (더 실감)
        const doorX = (r.x + Math.floor(r.w / 2)) * T - camX;
        if (r.type === 'cron') {
          // 크론센터: 좌측 자동문 (슬라이딩)
          const doorY = (r.y + Math.floor(r.h / 2)) * T - camY;
          ctx!.fillStyle = '#4a5060';
          ctx!.fillRect(rx - 2, doorY - T * 1.2, WALL + 3, T * 3);
          // 유리 슬라이딩 도어
          ctx!.fillStyle = 'rgba(88,166,255,0.35)';
          ctx!.fillRect(rx, doorY - T * 1.1, WALL - 1, T * 2.8);
          // 센터 라인 (두 문 사이)
          ctx!.fillStyle = '#2a3240';
          ctx!.fillRect(rx + 2, doorY + T / 2 - 0.5, WALL - 4, 1);
          // LED 상태등 (상단)
          ctx!.fillStyle = '#22c55e';
          ctx!.beginPath();
          ctx!.arc(rx + WALL / 2, doorY - T * 1.0, 1.5, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          // 일반 방: 나무 문 + 금속 손잡이
          const dw = T * 1.5;
          const dy = ry + rh - WALL - 1;
          // 문틀 (어두운 프레임)
          ctx!.fillStyle = '#5a6370';
          ctx!.fillRect(doorX - dw / 2 - 2, dy, dw + 4, WALL + 2);
          // 문 본체 (나무 색상)
          const doorGrd = ctx!.createLinearGradient(doorX - dw / 2, dy, doorX + dw / 2, dy);
          doorGrd.addColorStop(0, '#8b6f3f');
          doorGrd.addColorStop(0.5, '#a08550');
          doorGrd.addColorStop(1, '#7a5e30');
          ctx!.fillStyle = doorGrd;
          ctx!.fillRect(doorX - dw / 2, dy + 1, dw, WALL);
          // 나무결
          ctx!.strokeStyle = 'rgba(60,40,10,0.3)';
          ctx!.lineWidth = 0.5;
          for (let ln = 2; ln < WALL; ln += 3) {
            ctx!.beginPath();
            ctx!.moveTo(doorX - dw / 2 + 2, dy + ln);
            ctx!.lineTo(doorX + dw / 2 - 2, dy + ln);
            ctx!.stroke();
          }
          // 금속 손잡이
          ctx!.fillStyle = '#d4c080';
          ctx!.beginPath();
          ctx!.arc(doorX + dw / 2 - 3, dy + WALL / 2 + 1, 1.2, 0, Math.PI * 2);
          ctx!.fill();
          // 문 이름 플레이트 (팀 컬러)
          ctx!.fillStyle = r.teamColor + 'a0';
          ctx!.fillRect(doorX - dw / 2 + 1, dy + 1, dw - 2, 1);
        }
      } else {
        // ── Pod (오픈 데스크): 벽 없음, 카펫 테두리 + 약한 그림자 (다크) ──
        ctx!.save();
        ctx!.shadowColor = 'rgba(0,0,0,0.06)';
        ctx!.shadowBlur = 6;
        ctx!.shadowOffsetX = 1;
        ctx!.shadowOffsetY = 2;
        ctx!.strokeStyle = r.teamColor + '60';
        ctx!.lineWidth = 3;
        ctx!.beginPath();
        ctx!.roundRect(rx + 2, ry + 2, rw - 4, rh - 4, 4);
        ctx!.stroke();
        ctx!.restore();
        // Pod 내부 글로우 (팀색 은은하게)
        const podGlow = ctx!.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, rw * 0.6);
        podGlow.addColorStop(0, r.teamColor + '12');
        podGlow.addColorStop(1, 'transparent');
        ctx!.fillStyle = podGlow;
        ctx!.fillRect(rx + 4, ry + 4, rw - 8, rh - 8);
        // 카펫 하이라이트 (상단 엣지)
        ctx!.fillStyle = r.teamColor + '10';
        ctx!.fillRect(rx + 4, ry + 2, rw - 8, 2);
      }

      // Draw furniture
      drawRoomFurniture(ctx!, r, rx, ry, rw, rh, frameCountRef.current, cronDataRef.current.slice(0, CRON_COLS * CRON_ROWS));

      // Room name plate (밝은 오피스)
      ctx!.font = 'bold 11px monospace';
      const plateText = `${r.emoji} ${r.name}`;
      const plateW = ctx!.measureText(plateText).width + 20;
      ctx!.fillStyle = 'rgba(255,255,255,0.92)';
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 5);
      ctx!.fill();
      ctx!.strokeStyle = '#d0d5dd';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(rx + rw / 2 - plateW / 2, ry + 10, plateW, 20, 5);
      ctx!.stroke();
      ctx!.fillStyle = '#2d3340';
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
        // 방패 — 신임 팀장 이준혁 (예방 우선)
        ctx!.strokeStyle = '#22c55e';
        ctx!.fillStyle = '#22c55e22';
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo(nx, ny - 20);
        ctx!.lineTo(nx + 8, ny - 16);
        ctx!.lineTo(nx + 8, ny - 10);
        ctx!.quadraticCurveTo(nx + 8, ny - 5, nx, ny - 2);
        ctx!.quadraticCurveTo(nx - 8, ny - 5, nx - 8, ny - 10);
        ctx!.lineTo(nx - 8, ny - 16);
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();
        // 방패 중앙 체크마크
        ctx!.strokeStyle = '#22c55e';
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.moveTo(nx - 3, ny - 10);
        ctx!.lineTo(nx, ny - 7);
        ctx!.lineTo(nx + 4, ny - 14);
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

      // Status text (current task) — 하단 라벨 (항상, 반투명 배경)
      // SKIPPED/disabled/idle은 표시 제외, 크론명 humanize (하이픈→공백)
      const _taskRaw = (state?.task || '').replace(/-/g, ' ').replace(/_/g, ' ');
      const _isSkipped = (state?.activity || '').toLowerCase().includes('skipped')
        || (state?.activity || '').toLowerCase().includes('disabled')
        || (state?.task || '') === 'idle';
      if (state?.task && !_isSkipped) {
        const taskLabel = _taskRaw.length > 14 ? _taskRaw.slice(0, 13) + '\u2026' : _taskRaw;
        ctx!.font = '7px monospace';
        const taskW = ctx!.measureText(taskLabel).width + 6;
        ctx!.fillStyle = 'rgba(0,0,0,0.35)';
        ctx!.beginPath();
        ctx!.roundRect(nx - taskW / 2, ny + 32, taskW, 10, 2);
        ctx!.fill();
        ctx!.fillStyle = '#8b949e';
        ctx!.textAlign = 'center';
        ctx!.fillText(taskLabel, nx, ny + 39);
      }

      // ── NPC 머리 위 현재작업 배지 (플레이어 거리 기반 선명도) ──
      if (state?.task && state.task !== 'idle' && !_isSkipped) {
        const p = playerRef.current;
        const dx = p.x - r.npcX;
        const dy = p.y - r.npcY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 5타일 이내 선명(1.0), 12타일 밖은 0, 사이는 linear
        const clarity = dist <= 5 ? 1 : dist >= 12 ? 0 : 1 - (dist - 5) / 7;
        if (clarity > 0.05) {
          const badgeText = _taskRaw.length > 18 ? _taskRaw.slice(0, 17) + '\u2026' : _taskRaw;
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
      const mmW = 180, mmH = 140;
      // 우하단으로 이동 (구 우상단 → 우하단. 정보 패널이 우상단 차지)
      const mx = canvasW - mmW - 16;
      const my = canvasH - mmH - 16;
      const scale = Math.min(mmW / (COLS * T), mmH / (ROWS * T));

      // Background (다크 오버레이)
      ctx!.fillStyle = 'rgba(0,0,0,0.5)';
      ctx!.beginPath();
      ctx!.roundRect(mx - 4, my - 4, mmW + 8, mmH + 8, 6);
      ctx!.fill();
      ctx!.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(mx - 4, my - 4, mmW + 8, mmH + 8, 6);
      ctx!.stroke();

      // Label
      ctx!.fillStyle = '#ffffff';
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
        if (rId === 'server-room') return '#475569';
        if (rId === 'cron-center') return '#6366f1';
        if (rId === 'infra-lead') return '#22c55e';
        if (rId === 'standup') return '#eab308';
        if (rId === 'secretary') return '#8b5cf6';
        if (rId === 'brand-lead') return '#ea580c';
        if (rId === 'audit-lead') return '#dc2626';
        if (rId === 'record-lead') return '#92702a';
        if (rId === 'trend-lead') return '#3b82f6';
        return '#3b82f6';
      };

      for (const r of ROOMS) {
        const state = npcStatesRef.current[r.id];
        const statusColor = state?.status === 'red' ? '#f85149' : state?.status === 'yellow' ? '#d29922' : '#3fb950';
        const zone = zoneColor(r.id);
        const isCurrentRoom = r.id === playerRoomId;

        ctx!.fillStyle = isCurrentRoom ? (zone + '50') : (zone + '18');
        ctx!.fillRect(mx + r.x * T * scale, my + r.y * T * scale, r.w * T * scale, r.h * T * scale);
        ctx!.strokeStyle = isCurrentRoom ? '#e6edf3' : (zone + '50');
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
          ctx!.fillStyle = isCurrentRoom ? '#1a202c' : '#4a5568';
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
            ctx!.fillStyle = isCurrentRoom ? '#1a202c' : '#4a5568';
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
      // 팝업 열린 동안 5fps로 절전 — backdrop 깜빡임 방지 + CPU 절약
      if (popupOpenRef.current && frameCountRef.current % 12 !== 0) {
        frameCountRef.current++;
        animId = requestAnimationFrame(gameLoop);
        return;
      }
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
        // 신임 팀장 이준혁 부임 1회성 토스트
        if (nearby.id === 'infra-lead' && typeof window !== 'undefined' && !localStorage.getItem('jarvis-infra-new-lead-v1')) {
          zoneToastRef.current = { text: 'SRE실 · 이준혁 신임 팀장 부임', color: '#22c55e', emoji: '🛡️', frame: 0 };
          localStorage.setItem('jarvis-infra-new-lead-v1', '1');
        } else {
          zoneToastRef.current = { text: nearby.name, color: nearby.teamColor, emoji: nearby.emoji || '🏢', frame: 0 };
        }
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

      // Clear (월드 패스 좌표계 — wZ×hZ, 다크)
      ctx!.fillStyle = '#f0f2f5';
      ctx!.fillRect(0, 0, wZ, hZ);

      // ── Outer wall border (다크 테마) ──
      const wallThick = 6;
      ctx!.fillStyle = '#d0d5dd';
      ctx!.fillRect(0 - camX, 0 - camY, COLS * T, wallThick);
      ctx!.fillRect(0 - camX, ROWS * T - wallThick - camY, COLS * T, wallThick);
      ctx!.fillRect(0 - camX, 0 - camY, wallThick, ROWS * T);
      ctx!.fillRect(COLS * T - wallThick - camX, 0 - camY, wallThick, ROWS * T);
      // Wall top highlight
      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(0 - camX, 0 - camY, COLS * T, 2);
      ctx!.fillRect(0 - camX, 0 - camY, 2, ROWS * T);
      // Exterior window pattern on top wall
      for (let wx = 3; wx < COLS - 3; wx += 4) {
        ctx!.fillStyle = '#58a6ff10';
        ctx!.fillRect(wx * T - camX, -camY, T * 2, wallThick);
      }
      // Exterior window pattern on bottom wall
      for (let wx = 3; wx < COLS - 3; wx += 4) {
        ctx!.fillStyle = '#58a6ff10';
        ctx!.fillRect(wx * T - camX, ROWS * T - wallThick - camY, T * 2, wallThick);
      }

      // Floor (corridor with directional pattern) — 오프스크린 캐시 사용
      if (!floorCacheRef.current) {
        const oc = document.createElement('canvas');
        oc.width = COLS * T; oc.height = ROWS * T;
        const fc = oc.getContext('2d')!;
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const sx = x * T, sy = y * T;
            let inRoom = false;
            for (const r of ROOMS) {
              if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { inRoom = true; break; }
            }
            if (inRoom) continue;
            const isOfficeHCorridor = y >= 10 && y <= 11;
            const isLobby = y >= 18 && y <= 19;
            if (isOfficeHCorridor || isLobby) {
              const tileCol = Math.floor(x / 2);
              fc.fillStyle = (tileCol + y) % 2 === 0 ? '#ebedf0' : '#e8eaed';
              fc.fillRect(sx, sy, T, T);
              if ((x * 5 + y * 7) % 11 === 0) {
                fc.strokeStyle = 'rgba(0,0,0,0.03)'; fc.lineWidth = 0.5;
                fc.beginPath(); fc.moveTo(sx + 5, sy + T - 5); fc.lineTo(sx + T - 5, sy + 5); fc.stroke();
              }
              fc.strokeStyle = '#d0d5dd'; fc.lineWidth = 1;
              if (x % 2 === 0) { fc.beginPath(); fc.moveTo(sx, sy); fc.lineTo(sx, sy + T); fc.stroke(); }
              fc.beginPath(); fc.moveTo(sx, sy); fc.lineTo(sx + T, sy); fc.stroke();
              if (y === 10 || y === 11 || y === 18) {
                const refGrd = fc.createLinearGradient(sx, sy, sx, sy + T);
                refGrd.addColorStop(0, 'rgba(100,120,160,0.06)');
                refGrd.addColorStop(0.5, 'rgba(100,120,160,0.03)');
                refGrd.addColorStop(1, 'transparent');
                fc.fillStyle = refGrd; fc.fillRect(sx, sy, T, T);
              }
            } else {
              fc.fillStyle = (x + y) % 2 === 0 ? '#f5f6f8' : '#f0f1f3';
              fc.fillRect(sx, sy, T, T);
              if ((x + y) % 4 === 0) {
                fc.strokeStyle = 'rgba(0,0,0,0.03)'; fc.lineWidth = 0.5;
                fc.beginPath(); fc.moveTo(sx + T * 0.2, sy + T * 0.8); fc.lineTo(sx + T * 0.8, sy + T * 0.2); fc.stroke();
              } else if ((x + y) % 4 === 2) {
                fc.strokeStyle = 'rgba(0,0,0,0.02)'; fc.lineWidth = 0.5;
                fc.beginPath(); fc.moveTo(sx + T * 0.2, sy + T * 0.2); fc.lineTo(sx + T * 0.8, sy + T * 0.8); fc.stroke();
              }
              fc.strokeStyle = '#dde0e630'; fc.lineWidth = 0.3; fc.strokeRect(sx, sy, T, T);
            }
          }
        }
        floorCacheRef.current = oc;
      }
      ctx!.drawImage(floorCacheRef.current, -camX, -camY);

      // ── 발자국 이펙트 ──────────────────────────────────────────
      footstepsRef.current = footstepsRef.current.filter(f => f.life > 0);
      for (const f of footstepsRef.current) {
        f.life--;
        const alpha = (f.life / 28) * 0.5;
        const fx = f.x * T - camX + T / 2;
        const fy = f.y * T - camY + T / 2 + 10;
        ctx!.fillStyle = `rgba(60,120,220,${alpha})`;
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
        if (h >= 23 || h < 6) moodFill = 'rgba(20, 30, 60, 0.15)';       // 심야
        else if (h < 9) moodFill = 'rgba(255, 180, 100, 0.06)';           // 새벽
        else if (h >= 18 && h < 23) moodFill = 'rgba(160, 80, 140, 0.06)'; // 황혼
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

      // ── 방 남쪽 벽 드롭 섀도우 — 캐시된 그라데이션 사용 ──
      for (const r of ROOMS) {
        if (r.type === 'cron') continue;
        const srx = r.x * T - camX;
        const sry = r.y * T - camY;
        const srw = r.w * T;
        const srh = r.h * T;
        let cached = shadowCacheRef.current.get(r.id);
        if (!cached) {
          const isClosed = r.wallStyle === 'closed';
          const sdGrd = ctx!.createLinearGradient(0, 0, 0, T * 1.2);
          sdGrd.addColorStop(0, isClosed ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.05)');
          sdGrd.addColorStop(0.5, isClosed ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)');
          sdGrd.addColorStop(1, 'transparent');
          const seGrd = ctx!.createLinearGradient(0, 0, T * 0.5, 0);
          seGrd.addColorStop(0, 'rgba(0,0,0,0.04)');
          seGrd.addColorStop(1, 'transparent');
          cached = { south: sdGrd, east: seGrd };
          shadowCacheRef.current.set(r.id, cached);
        }
        ctx!.save();
        ctx!.translate(srx + 6, sry + srh);
        ctx!.fillStyle = cached.south;
        ctx!.fillRect(0, 0, srw - 12, T * 1.2);
        ctx!.restore();
        ctx!.save();
        ctx!.translate(srx + srw, sry + 8);
        ctx!.fillStyle = cached.east;
        ctx!.fillRect(0, 0, T * 0.5, srh - 8);
        ctx!.restore();
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

      // ── HUD: Top bar (다크) ──
      const _isMob = w < 768;
      const topBarH = _isMob ? 28 : 40;
      const grad = ctx!.createLinearGradient(0, 0, 0, topBarH);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, topBarH);

      ctx!.fillStyle = '#e6edf3';
      ctx!.font = `bold ${_isMob ? 10 : 12}px monospace`;
      ctx!.textAlign = 'center';
      ctx!.letterSpacing = '3px';
      ctx!.fillText('JARVIS MAP', w / 2, _isMob ? 17 : 22);
      ctx!.letterSpacing = '0px';

      // ── HUD: Bottom bar (다크) ──
      const gradBot = ctx!.createLinearGradient(0, h - 44, 0, h);
      gradBot.addColorStop(0, 'rgba(0,0,0,0)');
      gradBot.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx!.fillStyle = gradBot;
      ctx!.fillRect(0, h - 44, w, 44);

      ctx!.fillStyle = '#8b949e';
      ctx!.font = '11px monospace';
      ctx!.textAlign = 'left';
      if (!_isMob) {
        ctx!.fillText('[WASD/Arrows] 이동   [E/Space] 대화   [ESC] 닫기', 16, h - 14);
      }

      // Time (KST) + 줌 인디케이터
      ctx!.textAlign = 'right';
      ctx!.font = `${_isMob ? 10 : 11}px monospace`;
      const now = new Date();
      ctx!.fillStyle = '#e6edf3';
      ctx!.fillText(now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST', w - 16, h - 14);
      const zoomPct = Math.round(_zoom * 100);
      ctx!.fillStyle = _zoom !== 1 ? '#3b82f6' : '#8b949e';
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
          ctx!.fillStyle = 'rgba(0,0,0,0.5)';
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

      // ── Vignette overlay (다크 테마) ──
      const vigSize = 40;
      const vigTop = ctx!.createLinearGradient(0, 0, 0, vigSize);
      vigTop.addColorStop(0, 'rgba(0,0,0,0.04)');
      vigTop.addColorStop(1, 'transparent');
      ctx!.fillStyle = vigTop;
      ctx!.fillRect(0, 0, w, vigSize);
      const vigBot = ctx!.createLinearGradient(0, h - vigSize, 0, h);
      vigBot.addColorStop(0, 'transparent');
      vigBot.addColorStop(1, 'rgba(0,0,0,0.04)');
      ctx!.fillStyle = vigBot;
      ctx!.fillRect(0, h - vigSize, w, vigSize);

      animId = requestAnimationFrame(gameLoop);
    }

    // Start — 탭 비활성화 시 폴링 중단으로 네트워크/CPU 절약
    loadStatuses();
    let dataInterval = setInterval(loadStatuses, 15000);
    animId = requestAnimationFrame(gameLoop);

    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(dataInterval);
        cancelAnimationFrame(animId);
      } else {
        loadStatuses();
        dataInterval = setInterval(loadStatuses, 15000);
        animId = requestAnimationFrame(gameLoop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(dataInterval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick);
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
  const [chatHistoryOffset, setChatHistoryOffset] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const chatTeamIdRef = useRef<string>('');

  const loadChatHistory = useCallback(async (teamId: string, offset = 0, prepend = false) => {
    try {
      setChatHistoryLoading(true);
      const res = await fetch(`/api/game/chat/${teamId}?offset=${offset}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      if (prepend) {
        setChatMessages(prev => [...msgs, ...prev]);
      } else {
        setChatMessages(msgs);
      }
      setChatHasMore(data.hasMore ?? false);
      setChatHistoryOffset(offset + msgs.length);
    } catch { /* skip */ }
    finally { setChatHistoryLoading(false); }
  }, []);

  const loadMoreHistory = useCallback(() => {
    const teamId = chatTeamIdRef.current;
    if (!teamId || chatHistoryLoading) return;
    loadChatHistory(teamId, chatHistoryOffset, true);
  }, [chatHistoryOffset, chatHistoryLoading, loadChatHistory]);

  useEffect(() => {
    if (briefing) {
      const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
      const teamId = room?.entityId || briefing.id;
      chatTeamIdRef.current = teamId;
      setChatHistoryOffset(0);
      setChatHasMore(false);
      loadChatHistory(teamId, 0, false);
      setChatPanelOpen(true); // 브리핑 로드 시 채팅 패널 자동 오픈
    } else {
      setChatMessages([]);
      setChatHasMore(false);
      setChatHistoryOffset(0);
      chatTeamIdRef.current = '';
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
        body: JSON.stringify({
          teamId,
          message: msg,
          // 사용자가 보고 있는 브리핑 요약을 NPC에게 전달 — 좌우 정보 동기화
          briefingSummary: briefing ? [
            `상태: ${briefing.status}`,
            briefing.summary && `요약: ${briefing.summary}`,
            briefing.stats && `24h 통계: 성공률 ${briefing.stats.rate}% (전체 ${briefing.stats.total}건, 실패 ${briefing.stats.failed}건)`,
            briefing.alerts?.length && `경보: ${briefing.alerts.join(', ')}`,
            briefing.recentActivity?.filter(a => a.result === 'failed').length
              && `최근 실패 활동: ${briefing.recentActivity!.filter(a => a.result === 'failed').map(a => `${a.task}(${a.time})`).join(', ')}`,
            `화면 표시 현황: ${statusExplanation(briefing)}`,
          ].filter(Boolean).join('\n') : undefined,
        }),
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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#e8eaef' }}>
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

      {/* ── 맵/표 토글 + 도움말 (우상단) ── */}
      <div style={{
        position: 'fixed',
        top: isMobile ? 12 : 20,
        right: isMobile ? 12 : 24,
        zIndex: 900,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}>
        <button
          onClick={() => setShowIntro(true)}
          title="도움말"
          style={{
            width: 34, height: 34,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#8b949e',
            fontSize: 15, fontWeight: 800,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'color 0.15s',
          }}
        >?</button>
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: 3,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
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
                  color: active ? '#fff' : '#8b949e',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 우상단 Board 배너 (오늘 회의록 KPI) — 모바일에서 Statusline과 겹침 방지로 숨김 */}
      {viewMode === 'map' && !isMobile && <BoardBanner />}

      {/* 우상단 2차 정보 패널 (예정 크론 + 최근 커밋) — 모바일 숨김 */}
      {viewMode === 'map' && !isMobile && (
        <RightInfoPanels
          isMobile={isMobile}
          onCronClick={(id) => {
            const cron = cronDataRef.current.find(c => c.id === id)
              || cronData.find(c => c.id === id);
            if (cron) {
              setCronPopup(cron);
              setPopupOpen(true);
            } else {
              // cronData에 없는 경우 (LLM 전용 태스크 등) — 크론 센터 그리드를 열어 검색 가능하게
              setCronGridOpen(true);
              setCronSearch(id);
            }
          }}
        />
      )}

      {/* 좌하단 실시간 크론 이벤트 토스트 (SSE) */}
      {viewMode === 'map' && <CronToastStack isMobile={isMobile} />}

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
            background: '#ffffff',
            border: '1px solid #e0e4ea',
            borderTop: '3px solid #c9a227',
            borderRadius: 20,
            padding: isMobile ? '28px 24px 32px' : '36px 44px 40px',
            maxWidth: 520,
            width: isMobile ? '92vw' : '90vw',
            color: '#2d3340',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
          }}>
            {/* 헤더 */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a202c', marginBottom: 6 }}>JARVIS MAP</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                자비스 컴퍼니의 가상 오피스입니다.<br />
                팀장·크론잡을 클릭해 실시간 현황을 확인하세요.
              </div>
            </div>

            {/* 사용 방법 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {[
                { icon: '🕹️', label: isMobile ? '화면 탭으로 이동' : 'WASD / 방향키', desc: '캐릭터 이동' },
                { icon: '⌨️', label: isMobile ? '탭' : '[E] 또는 스페이스', desc: '가까운 팀장에게 말걸기' },
                { icon: '🖱️', label: isMobile ? '탭' : '클릭', desc: '팀장 NPC · 크론 워크스테이션 클릭 → 상세 팝업' },
                { icon: '⏰', label: '크론센터 (하단)', desc: '전사 크론잡 실시간 상태 · 클릭 시 역할·이력 확인' },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: '#f5f6f8',
                  border: '1px solid #e0e4ea', borderRadius: 10,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2d3340' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{desc}</div>
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
                borderRadius: 12, color: '#fff',
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
          background: 'rgba(255,255,255,0.95)',
          color: '#2d3340',
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
          <div style={{ color: '#718096', fontSize: 11, lineHeight: 1.4 }}>
            {tooltipRoom.room.description}
          </div>
        </div>
      )}

      {/* Nearby room indicator */}
      {nearbyRoom && !popupOpen && (
        <div style={{
          position: 'fixed',
          bottom: 54,
          left: '50%', transform: 'translateX(-50%)',
          padding: '8px 18px', borderRadius: 10,
          background: 'rgba(255,255,255,0.92)', color: '#2d3340',
          fontSize: 13, fontFamily: 'monospace', pointerEvents: 'none',
          border: `1px solid ${nearbyRoom.teamColor}50`,
          boxShadow: `0 0 12px ${nearbyRoom.teamColor}20`,
          whiteSpace: 'nowrap',
        }}>
          {nearbyRoom.emoji} {nearbyRoom.name} — {isMobile ? '탭으로 대화' : '[E]키로 대화'}
        </div>
      )}


      {/* ── Team Briefing Popup (크론 상세/그리드 팝업 열려있으면 숨김) ── */}
      <TeamBriefingPopup
        popupOpen={popupOpen && !cronPopup && !cronGridOpen}
        popupLoading={popupLoading}
        briefing={briefing}
        activeRoom={activeRoom}
        isMobile={isMobile}
        cronData={cronData}
        closePopup={closePopup}
        chatPanelOpen={chatPanelOpen}
        setChatPanelOpen={setChatPanelOpen}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        chatHasMore={chatHasMore}
        chatHistoryLoading={chatHistoryLoading}
        loadMoreHistory={loadMoreHistory}
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

      {/* ── Mobile Controls (D-pad 제거 — tap-to-move 전용) ── */}
      <MobileControls />

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
