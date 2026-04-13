/**
 * Pure pixel-art canvas drawing helpers for the Virtual Office map.
 *
 * Extracted from app/company/VirtualOffice.tsx as part of the
 * "VirtualOffice 모듈 분할" refactor. Every function here takes
 * `ctx: CanvasRenderingContext2D` as the first argument (no closure
 * reliance) and reads animation frame / cron state via explicit params.
 *
 * Stateful pieces (drawRoom, drawNPC, drawPlayer, drawMinimap, etc.)
 * stay inline in VirtualOffice.tsx because they chain too many refs
 * and would require deep parameter threading — extracting them was
 * judged higher risk than reward for a pure visual-refactor.
 */
import type { RoomDef, CronItem } from '@/lib/map/rooms';
import { T, getCronTilePos } from '@/lib/map/rooms';

// ── Helper: draw a small pixel-art chair ──
export function drawChair(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color + '80';
  ctx.fillRect(cx - 5, cy - 9, 10, 6);
}

// ── Helper: draw a small monitor ──
export function drawMonitor(ctx: CanvasRenderingContext2D, mx: number, my: number, screenW: number, screenH: number, screenColor: string, standColor: string) {
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(mx, my, screenW, screenH);
  ctx.fillStyle = screenColor;
  ctx.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);
  ctx.fillStyle = standColor;
  ctx.fillRect(mx + screenW / 2 - 2, my + screenH, 4, 5);
  ctx.fillRect(mx + screenW / 2 - 5, my + screenH + 4, 10, 3);
}

// ── Helper: draw a potted plant (dark corporate) ──
export function drawPlantSmall(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(px - 4, py, 8, 7);
  ctx.fillStyle = '#7a6545';
  ctx.fillRect(px - 5, py - 1, 10, 3);
  ctx.fillStyle = '#22804a';
  ctx.beginPath();
  ctx.arc(px, py - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e60';
  ctx.beginPath();
  ctx.arc(px - 3, py - 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 3, py - 7, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ── 오픈 데스크 pod용 심플 가구 (데스크 1개 + 모니터 1개 + 의자 1개) ──
function drawSimplePod(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, teamColor: string) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // L자 데스크 (심플)
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(cx - T * 1.2, cy - T * 0.3, T * 2.4, T * 0.5);
  ctx.fillStyle = '#3a4050';
  ctx.fillRect(cx - T * 1.2, cy - T * 0.3, T * 2.4, 2);  // 상단 엣지

  // 모니터 (중앙 1개)
  drawMonitor(ctx, cx - T * 0.4, cy - T * 1, T * 0.9, T * 0.5, teamColor + '30', '#4a5060');
  // 모니터 화면 내용 (상태 표시등 느낌)
  ctx.fillStyle = teamColor + '50';
  ctx.fillRect(cx - T * 0.25, cy - T * 0.85, T * 0.2, T * 0.15);
  ctx.fillRect(cx + T * 0.1, cy - T * 0.85, T * 0.2, T * 0.15);

  // 의자 (뒤쪽)
  ctx.fillStyle = '#4a5060';
  ctx.beginPath();
  ctx.arc(cx, cy + T * 0.6, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Executive Module (대표실/재무실): L자 데스크 + 대형 모니터 + 가죽 의자 + 책장 + 소품 1개 ──
function drawExecutiveFurniture(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, _rw: number, _rh: number,
  teamColor: string, label: string,
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // L자 데스크 (넓은)
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, T * 0.7);
  ctx.fillStyle = '#3a4050';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, 3); // 상단 엣지
  // L자 세로 파트
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 0.4, T * 1.5);

  // 대형 모니터 (teamColor tint)
  drawMonitor(ctx, rx + T * 2.2, ry + T * 0.4, T * 1.5, T * 0.8, teamColor + '28', '#4a5060');
  // 모니터 화면 내용
  ctx.fillStyle = teamColor + '50';
  ctx.fillRect(rx + T * 2.4, ry + T * 0.55, T * 0.5, T * 0.25);
  ctx.fillRect(rx + T * 3.1, ry + T * 0.55, T * 0.5, T * 0.25);

  // 가죽 의자 (데스크 뒤)
  ctx.fillStyle = '#4a5060';
  ctx.beginPath();
  ctx.arc(rx + T * 3.2, ry + T * 2.5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(rx + T * 3.2 - 7, ry + T * 2.5 - 12, 14, 8); // 등받이

  // 책장 (우측 벽)
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(rx + T * 5.5, ry + T * 0.5, T * 1, T * 2.5);
  for (let j = 0; j < 3; j++) {
    ctx.fillStyle = '#7a6a50';
    ctx.fillRect(rx + T * 5.5, ry + T * 0.7 + j * T * 0.8, T * 1, 2); // 선반
    const bkColors = ['#7a6040', '#8a7050', '#9a8060'];
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = bkColors[k % 3];
      ctx.fillRect(rx + T * 5.65 + k * 12, ry + T * 0.8 + j * T * 0.8, 8, T * 0.55);
    }
  }

  // 방 소품 1개
  if (label === '대표') {
    // 금색 명패
    ctx.fillStyle = '#c9a22760';
    ctx.fillRect(rx + T * 2.5, ry + T * 1.25, T * 1.5, 6);
    ctx.fillStyle = '#2d3340';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, rx + T * 3.25, ry + T * 1.25 + 5);
  } else {
    // 차트 바 1개 (재무)
    ctx.fillStyle = '#10b981';
    ctx.fillRect(rx + T * 2.5, ry + T * 1.0, 3, T * 0.15);
    ctx.fillRect(rx + T * 2.7, ry + T * 0.9, 3, T * 0.25);
    ctx.fillRect(rx + T * 2.9, ry + T * 0.75, 3, T * 0.4);
  }

  ctx.restore();
}

// ── Standard Module (회의실/서버룸): 일자 데스크 + 모니터 + 의자 + 방 소품 1개 ──
function drawStandardFurniture(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, _rw: number, _rh: number,
  teamColor: string, variant: 'meeting' | 'server',
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // 일자 데스크
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.8, T * 5, T * 0.5);
  ctx.fillStyle = '#3a4050';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.8, T * 5, 2); // 상단 엣지

  // 모니터
  drawMonitor(ctx, rx + T * 2.5, ry + T * 1, T * 1, T * 0.6, teamColor + '28', '#4a5060');

  // 의자
  ctx.fillStyle = '#4a5060';
  ctx.beginPath();
  ctx.arc(rx + T * 3.5, ry + T * 2.8, 7, 0, Math.PI * 2);
  ctx.fill();

  if (variant === 'meeting') {
    // 화이트보드 (actual white)
    ctx.fillStyle = '#f5f5f4';
    ctx.globalAlpha = 0.9;
    ctx.fillRect(rx + _rw - T * 2, ry + T * 0.5, T * 1.3, T * 1.5);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#a0a4b0';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + _rw - T * 2, ry + T * 0.5, T * 1.3, T * 1.5);
  } else {
    // 서버 랙 2개 (세로 박스 + LED 점) — 방 내부에 맞게 배치
    for (let i = 0; i < 2; i++) {
      const sx = rx + _rw - T * 1.8 + i * T * 0.8;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(sx, ry + T * 0.5, T * 0.6, T * 2.5);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, ry + T * 0.5, T * 0.6, T * 2.5);
      // LED 점 + 글로우
      for (let j = 0; j < 6; j++) {
        const ledColor = j % 2 === 0 ? '#22c55e' : '#3b82f6';
        const ledCx = sx + T * 0.15;
        const ledCy = ry + T * 0.8 + j * 12;
        // 글로우 (외곽)
        ctx.fillStyle = (j % 2 === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)');
        ctx.beginPath();
        ctx.arc(ledCx, ledCy, 5, 0, Math.PI * 2);
        ctx.fill();
        // LED 코어
        ctx.fillStyle = ledColor;
        ctx.beginPath();
        ctx.arc(ledCx, ledCy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

// ── 룸별 가구 드로잉 ──────────────────────────────────────
export function drawRoomFurniture(
  ctx: CanvasRenderingContext2D,
  r: RoomDef,
  rx: number,
  ry: number,
  _rw: number,
  _rh: number,
  fc: number,
  cronItems: CronItem[],
) {
  // pod(오픈 데스크)는 심플 가구 + 룸별 고유 악센트
  if (r.wallStyle === 'pod') {
    drawSimplePod(ctx, rx, ry, _rw, _rh, r.teamColor);
    const cx = rx + _rw / 2;
    const cy = ry + _rh / 2;
    switch (r.id) {
      case 'infra-lead': {
        // 2 extra small monitors beside main
        drawMonitor(ctx, cx - T * 1.3, cy - T * 0.9, 8, 5, r.teamColor + '30', '#4a5060');
        drawMonitor(ctx, cx + T * 0.7, cy - T * 0.9, 8, 5, r.teamColor + '30', '#4a5060');
        // Cable squiggles
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - T * 0.3 + i * 4, cy - T * 0.4);
          ctx.quadraticCurveTo(cx - T * 0.2 + i * 4, cy - T * 0.1, cx - T * 0.3 + i * 4, cy + T * 0.1);
          ctx.stroke();
        }
        break;
      }
      case 'trend-lead': {
        // News ticker bar
        ctx.fillStyle = r.teamColor + '30';
        ctx.fillRect(cx - T * 1.1, cy - T * 0.3, T * 2.2, 4);
        // 3 ascending bar chart bars
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx + T * 0.6, cy + T * 0.2, 4, -6);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx + T * 0.6 + 6, cy + T * 0.2, 4, -10);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx + T * 0.6 + 12, cy + T * 0.2, 4, -15);
        break;
      }
      case 'record-lead': {
        // Filing cabinet (bottom-right, 3 stacked gray rectangles)
        const fcx = rx + _rw - T * 0.8;
        const fcy = ry + _rh - T * 1.2;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#6a7080' : '#7a8090';
          ctx.fillRect(fcx, fcy + i * 7, 14, 6);
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(fcx + 5, fcy + i * 7 + 2, 4, 2); // handle
        }
        break;
      }
      case 'audit-lead': {
        // Checklist board (upper area)
        const bx = cx - T * 0.5;
        const by = ry + T * 0.2;
        ctx.fillStyle = '#f5f5f4';
        ctx.fillRect(bx, by, T * 1, T * 0.8);
        ctx.strokeStyle = '#a0a4b0';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, T * 1, T * 0.8);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(bx + 6, by + 3 + i * 5, T * 0.6, 1);
          if (i < 2) {
            ctx.fillStyle = '#22c55e';
            ctx.font = '5px sans-serif';
            ctx.fillText('\u2713', bx + 2, by + 6 + i * 5);
          }
        }
        break;
      }
      case 'library': {
        // Small bookshelf (3 colored spines)
        const bsx = rx + T * 0.3;
        const bsy = ry + T * 0.3;
        const spineColors = ['#7a6040', '#8a7050', '#9a8060'];
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = spineColors[i];
          ctx.fillRect(bsx + i * 5, bsy, 4, 12);
        }
        // Reading lamp arc
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bsx + 7, bsy + 14, 8, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(bsx + 7, bsy + 14, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'brand-lead': {
        // 4 small colored circles (palette)
        const palX = rx + _rw - T * 1;
        const palY = ry + T * 0.4;
        const palColors = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = palColors[i];
          ctx.beginPath();
          ctx.arc(palX + (i % 2) * 8, palY + Math.floor(i / 2) * 8, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // Design poster rect
        ctx.fillStyle = r.teamColor + '20';
        ctx.fillRect(palX - 2, palY + 18, 14, 10);
        ctx.strokeStyle = r.teamColor + '60';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(palX - 2, palY + 18, 14, 10);
        break;
      }
      case 'growth-lead': {
        // Larger potted plant
        const ppx = rx + _rw - T * 0.7;
        const ppy = ry + _rh - T * 0.5;
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(ppx - 5, ppy, 10, 8);
        ctx.fillStyle = '#22804a';
        ctx.beginPath();
        ctx.arc(ppx, ppy - 6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22c55e60';
        ctx.beginPath();
        ctx.arc(ppx - 4, ppy - 10, 4, 0, Math.PI * 2);
        ctx.fill();
        // Small book stack
        ctx.fillStyle = '#7a6040';
        ctx.fillRect(rx + T * 0.3, ry + _rh - T * 0.5, 8, 3);
        ctx.fillStyle = '#8a7050';
        ctx.fillRect(rx + T * 0.3, ry + _rh - T * 0.5 + 3, 8, 3);
        break;
      }
      case 'secretary': {
        // Wider reception counter bar
        ctx.fillStyle = '#4a5060';
        ctx.fillRect(cx - T * 1.4, cy + T * 0.3, T * 2.8, T * 0.3);
        ctx.fillStyle = '#3a4050';
        ctx.fillRect(cx - T * 1.4, cy + T * 0.3, T * 2.8, 2);
        // Phone icon (small rect + handset curve)
        ctx.fillStyle = '#6a7080';
        ctx.fillRect(cx + T * 0.8, cy - T * 0.6, 6, 8);
        ctx.strokeStyle = '#4a5060';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx + T * 0.8 + 3, cy - T * 0.6 - 2, 4, Math.PI, 0);
        ctx.stroke();
        break;
      }
    }
    return;
  }

  switch (r.id) {
    case 'president':
    case 'finance':
      drawExecutiveFurniture(ctx, rx, ry, _rw, _rh, r.teamColor, r.id === 'president' ? '대표' : '재무');
      void cronItems;
      break;
    case 'standup':
      drawStandardFurniture(ctx, rx, ry, _rw, _rh, r.teamColor, 'meeting');
      break;
    case 'server-room':
      drawStandardFurniture(ctx, rx, ry, _rw, _rh, r.teamColor, 'server');
      break;
    case 'cron-center': {
      // ── 바닥 — 서버룸 타일 패턴 ──────────────────────────────
      ctx.fillStyle = '#e8eaef';
      ctx.fillRect(rx + 1, ry + 1, _rw - 2, _rh - 2);
      // 타일 그리드 (Gather Town 서버룸 스타일)
      ctx.strokeStyle = '#d0d5dd';
      ctx.lineWidth = 0.5;
      for (let gx = rx; gx < rx + _rw; gx += T) {
        ctx.beginPath(); ctx.moveTo(gx, ry); ctx.lineTo(gx, ry + _rh); ctx.stroke();
      }
      for (let gy = ry; gy < ry + _rh; gy += T) {
        ctx.beginPath(); ctx.moveTo(rx, gy); ctx.lineTo(rx + _rw, gy); ctx.stroke();
      }
      // 바닥 반사광 — 각 워크스테이션 개별 glow (전체 폭 밴드 제거)
      // 개별 그림자는 워크스테이션 렌더링 시 처리

      // ── 크론 워크스테이션 — 카드 그리드 스타일 ─────────────────

      cronItems.forEach((cron, i) => {
        const { tx, ty } = getCronTilePos(r, i);
        const snx = tx * T - (r.x * T - rx) + T / 2;
        const sny = ty * T - (r.y * T - ry) + T / 2;

        // 화면 밖이면 skip
        if (snx < rx - 80 || snx > _rw + rx + 80 || sny < ry - 40 || sny > _rh + ry + 40) return;

        // 상태별 색상
        const statusConfig = {
          success: { bg: '#ecfdf5', border: '#22c55e', text: '#4ade80', label: '성공' },
          failed:  { bg: '#fef2f2', border: '#f85149', text: '#f87171', label: '실패' },
          running: { bg: '#eff6ff', border: '#58a6ff', text: '#93c5fd', label: '실행중' },
          skipped: { bg: '#fffbeb', border: '#d29922', text: '#fbbf24', label: '스킵' },
          unknown: { bg: '#f5f6f8', border: '#374151', text: '#6b7280', label: '-' },
        };
        const st = statusConfig[cron.status] || statusConfig.unknown;

        // 카드 크기
        const cardW = T * 4.2;
        const cardH = T * 1.0;
        const cx = snx - cardW / 2;
        const cy = sny - cardH / 2;

        // 카드 배경 (상태색 배경)
        ctx.fillStyle = st.bg;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.fill();

        // 카드 테두리 (상태색)
        ctx.strokeStyle = st.border + '80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.stroke();

        // 상태 점 (좌측)
        ctx.fillStyle = st.border;
        ctx.beginPath();
        ctx.arc(cx + 8, cy + cardH / 2, 3, 0, Math.PI * 2);
        ctx.fill();

        // 이름 (점 오른쪽)
        const displayName = cron.name.length > 16 ? cron.name.slice(0, 15) + '…' : cron.name;
        ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#2d3340';
        ctx.textAlign = 'left';
        ctx.fillText(displayName, cx + 15, cy + cardH / 2 + 3);

        // 팀 이모지 (우측)
        if (cron.teamEmoji) {
          ctx.font = '7px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(cron.teamEmoji, cx + cardW - 4, cy + cardH / 2 + 3);
        }
      });

      // 빈 방 안내
      if (cronItems.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('크론 데이터 로딩 중...', rx + _rw / 2, ry + _rh / 2);
      }
      break;
    }
  }
}

// Decorative elements (corridor props, signs, clock, lights)

// ── 벽 아트 프레임 (그림 액자) ──
function drawWallArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, style: 'abstract' | 'team' | 'photo') {
  // 액자 프레임
  ctx.fillStyle = '#3a3530';
  ctx.fillRect(cx - 1, cy - 1, w + 2, h + 2);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(cx, cy, w, h);
  ctx.fillStyle = '#8b6f3f';
  ctx.fillRect(cx + 1, cy + 1, w - 2, h - 2);
  // 그림 내부
  if (style === 'abstract') {
    const grd = ctx.createLinearGradient(cx + 2, cy + 2, cx + w - 2, cy + h - 2);
    grd.addColorStop(0, '#ef4444');
    grd.addColorStop(0.5, '#eab308');
    grd.addColorStop(1, '#3b82f6');
    ctx.fillStyle = grd;
    ctx.fillRect(cx + 2, cy + 2, w - 4, h - 4);
    // abstract strokes
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx + 3, cy + 3, 3, h - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx + w - 6, cy + 4, 3, h - 8);
  } else if (style === 'team') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx + 2, cy + 2, w - 4, h - 4);
    // 3 people icons (team photo style)
    for (let i = 0; i < 3; i++) {
      const px = cx + 4 + i * ((w - 6) / 3);
      const py = cy + h / 2;
      ctx.fillStyle = '#e8cfa0';
      ctx.beginPath();
      ctx.arc(px + 2, py - 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ['#22c55e', '#3b82f6', '#ef4444'][i];
      ctx.fillRect(px, py, 4, h / 3);
    }
  } else {
    // photo — scenery
    const grd = ctx.createLinearGradient(cx + 2, cy + 2, cx + 2, cy + h - 2);
    grd.addColorStop(0, '#87ceeb');
    grd.addColorStop(0.5, '#cbd5e1');
    grd.addColorStop(1, '#16a34a');
    ctx.fillStyle = grd;
    ctx.fillRect(cx + 2, cy + 2, w - 4, h - 4);
    // sun
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx + w - 6, cy + 5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 커피 스테이션 ──
function drawCoffeeStation(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // 카운터 (목재)
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(px - 10, py - 2, 32, 14);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(px - 10, py - 2, 32, 2);
  // 커피 머신
  ctx.fillStyle = '#2a2d36';
  ctx.fillRect(px - 6, py - 10, 12, 10);
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(px - 5, py - 9, 10, 3);
  // 머신 스크린 (파란 LED)
  ctx.fillStyle = '#58a6ff';
  ctx.fillRect(px - 4, py - 8, 3, 2);
  // 커피 컵
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(px - 3, py - 3, 3, 4);
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(px - 3, py - 3, 3, 1);
  // 뜨거운 증기
  ctx.strokeStyle = 'rgba(200,220,255,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(px - 1.5, py - 4);
  ctx.quadraticCurveTo(px, py - 7, px - 1, py - 9);
  ctx.stroke();
  // 사이드 상품 (원두 포장)
  ctx.fillStyle = '#78350f';
  ctx.fillRect(px + 10, py - 5, 6, 8);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(px + 11, py - 3, 4, 1);
}

// ── 복사기 ──
function drawPrinter(ctx: CanvasRenderingContext2D, px: number, py: number, fc: number) {
  // 본체
  ctx.fillStyle = '#6a7080';
  ctx.fillRect(px - 8, py - 4, 18, 14);
  // 스캐너 상판
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(px - 8, py - 6, 18, 3);
  // 용지 출구
  ctx.fillStyle = '#2a3240';
  ctx.fillRect(px - 7, py + 2, 16, 2);
  // 용지 (인쇄 중)
  if ((fc % 120) < 60) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 5, py + 3, 12, 3);
    ctx.strokeStyle = '#3a4050';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(px - 5, py + 3, 12, 3);
    // 프린트 라인
    ctx.fillStyle = '#2d3340';
    ctx.fillRect(px - 4, py + 4, 8, 0.5);
  }
  // 상태 LED (녹색 점멸)
  const ledOn = (fc % 30) < 15;
  ctx.fillStyle = ledOn ? '#22c55e' : '#0e4a20';
  ctx.beginPath();
  ctx.arc(px + 7, py - 3, 1, 0, Math.PI * 2);
  ctx.fill();
  // 컨트롤 패널
  ctx.fillStyle = '#58a6ff40';
  ctx.fillRect(px + 2, py - 2, 6, 2);
}

export function drawDecorations(ctx: CanvasRenderingContext2D, camX: number, camY: number, fc: number) {

  // Potted plants (6개 — 오피스 코너 + 로비)
  const plantPositions = [
    { x: 1.5, y: 4 }, { x: 53, y: 4 },       // Row1 좌우
    { x: 1.5, y: 12 }, { x: 53, y: 12 },     // Row2 좌우
    { x: 1.5, y: 18 }, { x: 53, y: 18 },     // 로비 좌우
  ];
  for (const pl of plantPositions) {
    drawPlantSmall(ctx, pl.x * T - camX, pl.y * T - camY);
  }

  // ── 벽 아트 (방 입구 위쪽 복도 벽 — 5개 그림) ──
  const artPieces: Array<{x:number; y:number; style:'abstract'|'team'|'photo'}> = [
    { x: 5,  y: 9.5,  style: 'abstract' },
    { x: 17, y: 9.5,  style: 'team' },
    { x: 29, y: 9.5,  style: 'photo' },
    { x: 41, y: 9.5,  style: 'abstract' },
    { x: 13, y: 17.5, style: 'team' },
    { x: 25, y: 17.5, style: 'photo' },
    { x: 37, y: 17.5, style: 'abstract' },
  ];
  for (const art of artPieces) {
    drawWallArt(ctx, art.x * T - camX, art.y * T - camY, 24, 16, art.style);
  }

  // ── 커피 스테이션 (복도 중앙) ──
  drawCoffeeStation(ctx, 16 * T - camX, 10.8 * T - camY);
  drawCoffeeStation(ctx, 40 * T - camX, 18.8 * T - camY);

  // ── 복사기 (복도 포인트) ──
  drawPrinter(ctx, 10 * T - camX, 18.8 * T - camY, fc);
  drawPrinter(ctx, 48 * T - camX, 10.8 * T - camY, fc);

  // Water cooler #1 (Row1-Row2 복도 좌측)
  const wcx = 1 * T - camX + T / 2;
  const wcy = 10 * T - camY;
  ctx.fillStyle = '#b0b8c4';
  ctx.fillRect(wcx - 5, wcy - 2, 10, 12);
  ctx.fillStyle = '#58a6ff40';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 10);
  ctx.fillStyle = '#58a6ff50';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 4);

  // Water cooler #2 (Row1-Row2 복도 우측)
  const wcx2 = 53 * T - camX + T / 2;
  const wcy2 = 10 * T - camY;
  ctx.fillStyle = '#b0b8c4';
  ctx.fillRect(wcx2 - 5, wcy2 - 2, 10, 12);
  ctx.fillStyle = '#58a6ff40';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 10);
  ctx.fillStyle = '#58a6ff50';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 4);

  // Vending machine (로비 우측)
  const vmx = 53 * T - camX;
  const vmy = 18 * T - camY;
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(vmx, vmy, T * 1, T * 1.5);
  ctx.strokeStyle = '#3a4050';
  ctx.lineWidth = 1;
  ctx.strokeRect(vmx, vmy, T * 1, T * 1.5);
  // Vending display (LED만 포인트)
  ctx.fillStyle = '#3b82f610';
  ctx.fillRect(vmx + 3, vmy + 3, T - 6, T * 0.6);
  // Drink rows (어두운 톤)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const drinkColor = ['#ef4444', '#22c55e', '#3b82f6'][col];
      ctx.fillStyle = drinkColor + '30';
      ctx.fillRect(vmx + 5 + col * 8, vmy + 5 + row * 8, 5, 6);
    }
  }
  // Coin slot
  ctx.fillStyle = '#c9a22780';
  ctx.fillRect(vmx + T * 0.7, vmy + T * 0.8, 4, 6);

  // Digital signage (Row1 위, 미니멀)
  const nbx = 15 * T - camX;
  const nby = 3.3 * T - camY;
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(nbx, nby, T * 2.5, T * 0.8);
  ctx.strokeStyle = '#4a5060';
  ctx.lineWidth = 1;
  ctx.strokeRect(nbx, nby, T * 2.5, T * 0.8);
  // Status LED dots
  const ledColors = ['#3fb950', '#3fb950', '#d29922', '#3b82f6', '#3fb950'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = ledColors[i] + '60';
    ctx.beginPath();
    ctx.arc(nbx + 8 + i * 14, nby + 8, 2, 0, Math.PI * 2);
    ctx.fill();
    // Thin data bar
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(nbx + 3 + i * 14, nby + 14, 10, 6);
  }

  // ── 복도 카펫 러너 (다크 네이비, 미묘한 스트라이프) ──
  const carpetColor = '#e8e0d8';
  const carpetEdge = '#d5cdc5';
  for (const corridorY of [10, 18]) {
    for (let cx = 2; cx < 54; cx++) {
      const csx = cx * T - camX;
      const csy = corridorY * T - camY;
      // 러너 바탕 (2타일 높이 × 1타일 폭)
      ctx.fillStyle = carpetColor;
      ctx.fillRect(csx, csy + T * 0.3, T, T * 1.4);
      // 러너 테두리 (좌우 스트라이프)
      ctx.fillStyle = carpetEdge;
      ctx.fillRect(csx, csy + T * 0.3, T, 2);
      ctx.fillRect(csx, csy + T * 1.68, T, 2);
      // 미세 다이아몬드 패턴 (4타일마다)
      if (cx % 4 === 0) {
        ctx.fillStyle = '#d8d0c8';
        ctx.beginPath();
        ctx.moveTo(csx + T / 2, csy + T * 0.5);
        ctx.lineTo(csx + T * 0.8, csy + T);
        ctx.lineTo(csx + T / 2, csy + T * 1.5);
        ctx.lineTo(csx + T * 0.2, csy + T);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ── 복도 벤치 (모던 다크) ──
  const benchPositions = [
    { x: 8, y: 10.2 }, { x: 20, y: 10.2 }, { x: 32, y: 10.2 }, { x: 44, y: 10.2 },
    { x: 8, y: 11.3 }, { x: 20, y: 11.3 }, { x: 32, y: 11.3 }, { x: 44, y: 11.3 },
    { x: 8, y: 18.2 }, { x: 20, y: 18.2 }, { x: 32, y: 18.2 }, { x: 44, y: 18.2 },
    { x: 8, y: 19.3 }, { x: 20, y: 19.3 }, { x: 32, y: 19.3 }, { x: 44, y: 19.3 },
  ];
  for (const bp of benchPositions) {
    const bpx = bp.x * T - camX;
    const bpy = bp.y * T - camY;
    ctx.fillStyle = '#6a7080';
    ctx.beginPath();
    ctx.roundRect(bpx, bpy, T * 1.5, T * 0.5, 3);
    ctx.fill();
    ctx.fillStyle = '#5a6070';
    ctx.fillRect(bpx + 2, bpy - 2, T * 1.5 - 4, 4);
    ctx.fillStyle = '#9ca3af40';
    ctx.beginPath();
    ctx.roundRect(bpx + 3, bpy + 2, T * 0.6, T * 0.35, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bpx + T * 0.75, bpy + 2, T * 0.6, T * 0.35, 2);
    ctx.fill();
  }

  // ── "JARVIS COMPANY" 로고 영역 (외벽 상단, 크고 명확) ──
  const signX = 27 * T - camX;
  const signY = 3.1 * T - camY;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(signX - 120, signY, 240, 28, 6);
  ctx.fill();
  ctx.strokeStyle = '#c9a22780';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(signX - 120, signY, 240, 28, 6);
  ctx.stroke();
  ctx.strokeStyle = '#c9a22730';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(signX - 116, signY + 3, 232, 22, 4);
  ctx.stroke();
  ctx.fillStyle = '#c9a22770';
  for (const ddx of [-108, 104]) {
    ctx.beginPath();
    ctx.moveTo(signX + ddx, signY + 14);
    ctx.lineTo(signX + ddx + 4, signY + 10);
    ctx.lineTo(signX + ddx + 8, signY + 14);
    ctx.lineTo(signX + ddx + 4, signY + 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('\uD83C\uDFE2 JARVIS COMPANY', signX, signY + 20);

  // Floor arrows in corridors (directional guides)
  const arrowPositions = [
    { x: 5, y: 10, dir: 'right' }, { x: 15, y: 10, dir: 'right' },
    { x: 25, y: 10, dir: 'right' }, { x: 35, y: 10, dir: 'right' },
    { x: 45, y: 10, dir: 'right' },
    { x: 5, y: 18, dir: 'right' }, { x: 15, y: 18, dir: 'right' },
    { x: 25, y: 18, dir: 'right' }, { x: 35, y: 18, dir: 'right' },
    { x: 45, y: 18, dir: 'right' },
  ];
  for (const arr of arrowPositions) {
    const ax = arr.x * T - camX + T / 2;
    const ay = arr.y * T - camY + T / 2;
    ctx.fillStyle = '#00000008';
    ctx.beginPath();
    if (arr.dir === 'right') {
      ctx.moveTo(ax - 6, ay - 3);
      ctx.lineTo(ax + 4, ay);
      ctx.lineTo(ax - 6, ay + 3);
    } else {
      ctx.moveTo(ax + 6, ay - 3);
      ctx.lineTo(ax - 4, ay);
      ctx.lineTo(ax + 6, ay + 3);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Emergency exit signs (green rectangles)
  const exitPositions = [
    { x: 0.3, y: 10 }, { x: 0.3, y: 18 },
    { x: 54, y: 10 }, { x: 54, y: 18 },
  ];
  for (const ep of exitPositions) {
    const ex = ep.x * T - camX;
    const ey = ep.y * T - camY;
    ctx.fillStyle = '#22c55e30';
    ctx.fillRect(ex, ey, T * 0.8, T * 0.4);
    ctx.fillStyle = '#22c55e80';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', ex + T * 0.4, ey + T * 0.28);
  }

  // Wall clock showing real KST time
  const clockX = 40 * T - camX;
  const clockY = 3.3 * T - camY;
  // Clock body
  ctx.fillStyle = '#f0f2f5';
  ctx.beginPath();
  ctx.arc(clockX, clockY + 8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(clockX, clockY + 8, 10, 0, Math.PI * 2);
  ctx.stroke();
  // Clock hands based on KST time
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const hours = kstNow.getHours() % 12;
  const minutes = kstNow.getMinutes();
  // Hour hand
  const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY + 8);
  ctx.lineTo(clockX + Math.cos(hAngle) * 5, clockY + 8 + Math.sin(hAngle) * 5);
  ctx.stroke();
  // Minute hand
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#8b949e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY + 8);
  ctx.lineTo(clockX + Math.cos(mAngle) * 7, clockY + 8 + Math.sin(mAngle) * 7);
  ctx.stroke();
  // Second hand tick
  const sAngle = ((fc % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#f8514960';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY + 8);
  ctx.lineTo(clockX + Math.cos(sAngle) * 8, clockY + 8 + Math.sin(sAngle) * 8);
  ctx.stroke();

  // Ceiling lights in corridors (subtle glow circles on floor, x간격 5타일)
  const lightPositions = [
    { x: 5, y: 10 }, { x: 10, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 10 },
    { x: 25, y: 10 }, { x: 30, y: 10 }, { x: 35, y: 10 }, { x: 40, y: 10 },
    { x: 45, y: 10 },
    { x: 5, y: 18 }, { x: 10, y: 18 }, { x: 15, y: 18 }, { x: 20, y: 18 },
    { x: 25, y: 18 }, { x: 30, y: 18 }, { x: 35, y: 18 }, { x: 40, y: 18 },
    { x: 45, y: 18 },
  ];
  for (const lp of lightPositions) {
    const lx = lp.x * T - camX + T / 2;
    const ly = lp.y * T - camY + T / 2;
    // 바닥 조명 원 (다크 배경에 약한 warm glow)
    const lightGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, T * 2.2);
    lightGlow.addColorStop(0, 'rgba(200,180,100,0.06)');
    lightGlow.addColorStop(0.4, 'rgba(200,180,100,0.03)');
    lightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = lightGlow;
    ctx.fillRect(lx - T * 2.2, ly - T * 2.2, T * 4.4, T * 4.4);
    // 천장 등기구 표시 (작은 등)
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(lx - 6, ly - T * 0.4, 12, 3);
    ctx.fillStyle = 'rgba(255,255,200,0.25)';
    ctx.fillRect(lx - 4, ly - T * 0.4 + 1, 8, 1);
  }

  // Lobby welcome mat near entrance (Row1 위쪽, 다크)
  const matX = 22 * T - camX;
  const matY = 3.5 * T - camY;
  ctx.fillStyle = '#c9a22720';
  ctx.beginPath();
  ctx.roundRect(matX, matY, T * 4, T * 0.6, 3);
  ctx.fill();
  ctx.strokeStyle = '#c9a22740';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(matX + 2, matY + 2, T * 4 - 4, T * 0.6 - 4, 2);
  ctx.stroke();

}
