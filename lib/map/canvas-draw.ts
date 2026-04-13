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
import { T, getCronTilePos, CORRIDOR_BRIDGE } from '@/lib/map/rooms';

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
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(mx, my, screenW, screenH);
  ctx.fillStyle = screenColor;
  ctx.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);
  ctx.fillStyle = standColor;
  ctx.fillRect(mx + screenW / 2 - 2, my + screenH, 4, 5);
  ctx.fillRect(mx + screenW / 2 - 5, my + screenH + 4, 10, 3);
}

// ── Helper: draw a potted plant ──
export function drawPlantSmall(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.fillStyle = '#92400e';
  ctx.fillRect(px - 4, py, 8, 7);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(px - 5, py - 1, 10, 3);
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(px, py - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e90';
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
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // L자 데스크 (심플)
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(cx - T * 1.2, cy - T * 0.3, T * 2.4, T * 0.5);
  ctx.fillStyle = '#6a6f78';
  ctx.fillRect(cx - T * 1.2, cy - T * 0.3, T * 2.4, 2);  // 상단 엣지

  // 모니터 (중앙 1개)
  drawMonitor(ctx, cx - T * 0.4, cy - T * 1, T * 0.9, T * 0.5, teamColor + '20', '#3a3e48');
  // 모니터 화면 내용 (상태 표시등 느낌)
  ctx.fillStyle = teamColor + '40';
  ctx.fillRect(cx - T * 0.25, cy - T * 0.85, T * 0.2, T * 0.15);
  ctx.fillRect(cx + T * 0.1, cy - T * 0.85, T * 0.2, T * 0.15);

  // 의자 (뒤쪽)
  ctx.fillStyle = '#3a3d46';
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
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // L자 데스크 (넓은, 진한 그레이로 대비 확보)
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, T * 0.7);
  ctx.fillStyle = '#6a6f78';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, 3); // 상단 엣지
  // L자 세로 파트
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 0.4, T * 1.5);

  // 대형 모니터 (teamColor tint)
  drawMonitor(ctx, rx + T * 2.2, ry + T * 0.4, T * 1.5, T * 0.8, teamColor + '18', '#3a3e48');
  // 모니터 화면 내용
  ctx.fillStyle = teamColor + '40';
  ctx.fillRect(rx + T * 2.4, ry + T * 0.55, T * 0.5, T * 0.25);
  ctx.fillRect(rx + T * 3.1, ry + T * 0.55, T * 0.5, T * 0.25);

  // 가죽 의자 (데스크 뒤)
  ctx.fillStyle = '#3a3d46';
  ctx.beginPath();
  ctx.arc(rx + T * 3.2, ry + T * 2.5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3d46';
  ctx.fillRect(rx + T * 3.2 - 7, ry + T * 2.5 - 12, 14, 8); // 등받이

  // 책장 (우측 벽)
  ctx.fillStyle = '#c0a070';
  ctx.fillRect(rx + T * 5.5, ry + T * 0.5, T * 1, T * 2.5);
  for (let j = 0; j < 3; j++) {
    ctx.fillStyle = '#a88850';
    ctx.fillRect(rx + T * 5.5, ry + T * 0.7 + j * T * 0.8, T * 1, 2); // 선반
    const bkColors = ['#8b4513', '#a0522d', '#d2691e'];
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
    ctx.fillStyle = '#fff';
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
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // 일자 데스크
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.8, T * 5, T * 0.5);
  ctx.fillStyle = '#6a6f78';
  ctx.fillRect(rx + T * 1.5, ry + T * 1.8, T * 5, 2); // 상단 엣지

  // 모니터
  drawMonitor(ctx, rx + T * 2.5, ry + T * 1, T * 1, T * 0.6, teamColor + '18', '#3a3e48');

  // 의자
  ctx.fillStyle = '#3a3d46';
  ctx.beginPath();
  ctx.arc(rx + T * 3.5, ry + T * 2.8, 7, 0, Math.PI * 2);
  ctx.fill();

  if (variant === 'meeting') {
    // 화이트보드 (직사각형 1개)
    ctx.fillStyle = '#f5f5f4';
    ctx.globalAlpha = 0.9;
    ctx.fillRect(rx + T * 5, ry + T * 0.5, T * 1.3, T * 1.5);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#a0a4b0';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + T * 5, ry + T * 0.5, T * 1.3, T * 1.5);
  } else {
    // 서버 랙 2개 (세로 박스 + LED 점)
    for (let i = 0; i < 2; i++) {
      const sx = rx + T * 5 + i * T * 0.8;
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
  // pod(오픈 데스크)는 심플 가구로 통일
  if (r.wallStyle === 'pod') {
    drawSimplePod(ctx, rx, ry, _rw, _rh, r.teamColor);
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
      ctx.fillStyle = '#070a12';
      ctx.fillRect(rx + 1, ry + 1, _rw - 2, _rh - 2);
      // 타일 그리드 (Gather Town 서버룸 스타일)
      ctx.strokeStyle = '#0f1628';
      ctx.lineWidth = 0.5;
      for (let gx = rx; gx < rx + _rw; gx += T) {
        ctx.beginPath(); ctx.moveTo(gx, ry); ctx.lineTo(gx, ry + _rh); ctx.stroke();
      }
      for (let gy = ry; gy < ry + _rh; gy += T) {
        ctx.beginPath(); ctx.moveTo(rx, gy); ctx.lineTo(rx + _rw, gy); ctx.stroke();
      }
      // 바닥 반사광 — 각 워크스테이션 개별 glow (전체 폭 밴드 제거)
      // 개별 그림자는 워크스테이션 렌더링 시 처리

      // ── 워크스테이션 NPC 렌더링 (Gather Town 스타일) ─────────

      cronItems.forEach((cron, i) => {
        const { tx, ty } = getCronTilePos(r, i);
        // 월드 → 스크린 (매 프레임 신선하게 계산)
        const snx = tx * T - (r.x * T - rx) + T / 2;   // rx = r.x*T-camX already
        const sny = ty * T - (r.y * T - ry) + T / 2;

        // 화면 밖이면 skip
        const cw = _rw + rx;
        const ch = _rh + ry;
        if (snx < rx - 40 || snx > cw + 40 || sny < ry - 40 || sny > ch + 40) return;

        const stColor =
          cron.status === 'success' ? '#22c55e' :
          cron.status === 'failed'  ? '#f85149' :
          cron.status === 'running' ? '#58a6ff' :
          cron.status === 'skipped' ? '#d29922' :
          '#374151';

        const pulse = 0.6 + Math.sin(fc * 0.06 + i * 0.8) * 0.4;

        // ── 워크스테이션 본체 (1.5x 확대) ──
        // 바닥 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(snx, sny + 20, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 데스크 표면
        ctx.fillStyle = '#1a2035';
        ctx.fillRect(snx - 27, sny + 3, 54, 14);
        ctx.fillStyle = '#242b42';
        ctx.fillRect(snx - 27, sny + 3, 54, 2); // 데스크 하이라이트

        // 모니터 스탠드
        ctx.fillStyle = '#1e2842';
        ctx.fillRect(snx - 3, sny - 20, 6, 22);

        // 모니터 케이싱
        ctx.fillStyle = '#1a2035';
        ctx.beginPath();
        ctx.roundRect(snx - 24, sny - 44, 48, 28, 2);
        ctx.fill();

        // 모니터 스크린 (상태색 글로우)
        const glowA = Math.round(pulse * 40).toString(16).padStart(2, '0');
        ctx.fillStyle = stColor + glowA;
        ctx.beginPath();
        ctx.roundRect(snx - 22, sny - 42, 44, 24, 1);
        ctx.fill();
        // 스크린 베이스 (어두운 배경)
        ctx.fillStyle = '#080e1a';
        ctx.fillRect(snx - 21, sny - 41, 42, 22);
        // 스크린 내용 (가로 선 효과)
        ctx.fillStyle = stColor + '30';
        for (let sl = 0; sl < 3; sl++) {
          ctx.fillRect(snx - 18, sny - 38 + sl * 6, 14 + (i % 3) * 6, 2);
        }
        // 상태 LED (스크린 우측 상단)
        const ledPulse = Math.round(pulse * 70).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(snx + 16, sny - 38, 4, 0, Math.PI * 2);
        ctx.fillStyle = stColor + ledPulse;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(snx + 16, sny - 38, 3, 0, Math.PI * 2);
        ctx.fillStyle = stColor;
        ctx.fill();

        // 모니터 위 글로우 (상태 halo)
        const haloR = 20 + Math.sin(fc * 0.04 + i * 0.5) * 2;
        ctx.beginPath();
        ctx.arc(snx, sny - 30, haloR, 0, Math.PI * 2);
        ctx.fillStyle = stColor + Math.round(pulse * 18).toString(16).padStart(2, '0');
        ctx.fill();

        // ── 이름 라벨 (데스크 아래) ──
        const displayName = cron.name.length > 20 ? cron.name.slice(0, 19) + '…' : cron.name;
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
        const nw = ctx.measureText(displayName).width + 8;
        // 라벨 배경
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(snx - nw / 2, sny + 20, nw, 16, 2);
        ctx.fill();
        ctx.fillStyle = '#c9d1d9';
        ctx.textAlign = 'center';
        ctx.fillText(displayName, snx, sny + 32);

        // 팀 이모지 (이름 오른쪽, 11px)
        if (cron.teamEmoji) {
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(cron.teamEmoji, snx + nw / 2 + 1, sny + 32);
        }
      });

      // 빈 방 안내
      if (cronItems.length === 0) {
        ctx.fillStyle = '#374151';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('크론 데이터 로딩 중...', rx + _rw / 2, ry + _rh / 2);
      }
      break;
    }
  }
}

// Decorative elements (corridor props, signs, clock, lights)

export function drawDecorations(ctx: CanvasRenderingContext2D, camX: number, camY: number, fc: number) {

  // Potted plants (6개 — 오피스 코너 + 통로 입구)
  const plantPositions = [
    { x: 1.5, y: 1 }, { x: 48, y: 1 },       // 상단 좌우
    { x: 1.5, y: 16 }, { x: 48, y: 16 },      // 하단 좌우
    { x: 49, y: 11 }, { x: 55, y: 11 },        // 통로 입구 양쪽
  ];
  for (const pl of plantPositions) {
    drawPlantSmall(ctx, pl.x * T - camX, pl.y * T - camY);
  }

  // Water cooler #1 (오피스 좌측 복도)
  const wcx = 1 * T - camX + T / 2;
  const wcy = 8 * T - camY;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(wcx - 5, wcy - 2, 10, 12);
  ctx.fillStyle = '#bae6fd50';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 10);
  ctx.fillStyle = '#7dd3fc60';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 4);
  // Cup
  ctx.fillStyle = '#f5f5f430';
  ctx.fillRect(wcx + 6, wcy + 2, 5, 6);

  // Water cooler #2 (오피스 우측 복도)
  const wcx2 = 48 * T - camX + T / 2;
  const wcy2 = 8 * T - camY;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(wcx2 - 5, wcy2 - 2, 10, 12);
  ctx.fillStyle = '#bae6fd50';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 10);
  ctx.fillStyle = '#7dd3fc60';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 4);

  // Vending machine (오피스 우측 하단)
  const vmx = 48 * T - camX;
  const vmy = 18 * T - camY;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(vmx, vmy, T * 1, T * 1.5);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(vmx, vmy, T * 1, T * 1.5);
  // Vending display
  ctx.fillStyle = '#3b82f615';
  ctx.fillRect(vmx + 3, vmy + 3, T - 6, T * 0.6);
  // Drink rows
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const drinkColor = ['#ef4444', '#22c55e', '#3b82f6'][col];
      ctx.fillStyle = drinkColor + '60';
      ctx.fillRect(vmx + 5 + col * 8, vmy + 5 + row * 8, 5, 6);
    }
  }
  // Coin slot
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(vmx + T * 0.7, vmy + T * 0.8, 4, 6);

  // Notice board on corridor wall (top corridor)
  const nbx = 15 * T - camX;
  const nby = 0.3 * T - camY;
  ctx.fillStyle = '#5a3e1b80';
  ctx.fillRect(nbx, nby, T * 2.5, T * 0.8);
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = 1;
  ctx.strokeRect(nbx, nby, T * 2.5, T * 0.8);
  // Colored pins
  const pinColors = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = pinColors[i];
    ctx.beginPath();
    ctx.arc(nbx + 8 + i * 14, nby + 4, 2, 0, Math.PI * 2);
    ctx.fill();
    // Note paper
    ctx.fillStyle = '#f5f5f420';
    ctx.fillRect(nbx + 3 + i * 14, nby + 8, 10, 12);
  }

  // Welcome sign at top with decorative border
  const signX = 25 * T - camX;
  const signY = 0.15 * T - camY;
  ctx.fillStyle = '#c9a22720';
  ctx.beginPath();
  ctx.roundRect(signX - 80, signY, 160, 22, 5);
  ctx.fill();
  ctx.strokeStyle = '#c9a22740';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(signX - 80, signY, 160, 22, 5);
  ctx.stroke();
  // Decorative dots
  ctx.fillStyle = '#c9a22750';
  ctx.beginPath();
  ctx.arc(signX - 72, signY + 11, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(signX + 72, signY + 11, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('\uD83C\uDFE2 JARVIS MAP', signX, signY + 16);

  // Floor arrows in corridors (directional guides)
  const arrowPositions = [
    { x: 5, y: 8, dir: 'right' }, { x: 15, y: 8, dir: 'right' },
    { x: 25, y: 8, dir: 'right' }, { x: 35, y: 8, dir: 'right' },
    { x: 45, y: 8, dir: 'right' },
    { x: 5, y: 16, dir: 'right' }, { x: 15, y: 16, dir: 'right' },
    { x: 25, y: 16, dir: 'right' }, { x: 35, y: 16, dir: 'right' },
    { x: 45, y: 16, dir: 'right' },
  ];
  for (const arr of arrowPositions) {
    const ax = arr.x * T - camX + T / 2;
    const ay = arr.y * T - camY + T / 2;
    ctx.fillStyle = '#4a4d6010';
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
    { x: 0.3, y: 7.5 }, { x: 0.3, y: 16 },
    { x: 49, y: 7.5 }, { x: 49, y: 16 },
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
  const clockY = 0.3 * T - camY;
  // Clock body
  ctx.fillStyle = '#21262d';
  ctx.beginPath();
  ctx.arc(clockX, clockY + 8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9a22760';
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
    { x: 5, y: 8 }, { x: 10, y: 8 }, { x: 15, y: 8 }, { x: 20, y: 8 },
    { x: 25, y: 8 }, { x: 30, y: 8 }, { x: 35, y: 8 }, { x: 40, y: 8 },
    { x: 45, y: 8 },
    { x: 5, y: 16 }, { x: 10, y: 16 }, { x: 15, y: 16 }, { x: 20, y: 16 },
    { x: 25, y: 16 }, { x: 30, y: 16 }, { x: 35, y: 16 }, { x: 40, y: 16 },
    { x: 45, y: 16 },
  ];
  for (const lp of lightPositions) {
    const lx = lp.x * T - camX + T / 2;
    const ly = lp.y * T - camY + T / 2;
    // 바닥 조명 원 (밝은 배경에 맞게 약하게)
    const lightGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, T * 2.2);
    lightGlow.addColorStop(0, 'rgba(200,180,100,0.04)');
    lightGlow.addColorStop(0.4, 'rgba(200,180,100,0.02)');
    lightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = lightGlow;
    ctx.fillRect(lx - T * 2.2, ly - T * 2.2, T * 4.4, T * 4.4);
    // 천장 등기구 표시 (작은 흰 사각형)
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(lx - 6, ly - T * 0.4, 12, 3);
    ctx.fillStyle = 'rgba(255,255,200,0.25)';
    ctx.fillRect(lx - 4, ly - T * 0.4 + 1, 8, 1);
  }

  // Lobby welcome mat near entrance (오피스 입구)
  const matX = 22 * T - camX;
  const matY = 0.8 * T - camY;
  ctx.fillStyle = '#5a3e1b15';
  ctx.beginPath();
  ctx.roundRect(matX, matY, T * 4, T * 0.6, 3);
  ctx.fill();
  ctx.strokeStyle = '#c9a22715';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(matX + 2, matY + 2, T * 4 - 4, T * 0.6 - 4, 2);
  ctx.stroke();

  // ── 연결 통로 장식 (x=50~54, y=6~17) ──
  const bx = CORRIDOR_BRIDGE.x;
  const by = CORRIDOR_BRIDGE.y;
  const bw = CORRIDOR_BRIDGE.w;
  const bh = CORRIDOR_BRIDGE.h;

  // "→ SERVER ROOM" 방향 표지판 (통로 중앙 상단)
  const signCx = (bx + bw / 2) * T - camX;
  const signCy = (by + 0.5) * T - camY;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(signCx - 50, signCy, 100, 16, 3);
  ctx.fill();
  ctx.strokeStyle = '#3b82f640';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(signCx - 50, signCy, 100, 16, 3);
  ctx.stroke();
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('\u2192 SERVER ROOM', signCx, signCy + 12);

  // 양쪽 유리벽 LED 스트립 (파랑 글로우 점)
  const ledCount = Math.floor(bh / 1.5);
  for (let li = 0; li < ledCount; li++) {
    const ledY = (by + 1 + li * 1.5) * T - camY;
    const ledPulseVal = 0.3 + Math.sin(fc * 0.08 + li * 0.6) * 0.3;
    const ledAlpha = Math.round(ledPulseVal * 255).toString(16).padStart(2, '0');
    // 좌측 벽
    const ledLx = bx * T - camX + 3;
    ctx.fillStyle = '#3b82f6' + ledAlpha;
    ctx.beginPath();
    ctx.arc(ledLx, ledY, 2, 0, Math.PI * 2);
    ctx.fill();
    // 우측 벽
    const ledRx = (bx + bw) * T - camX - 3;
    ctx.fillStyle = '#3b82f6' + ledAlpha;
    ctx.beginPath();
    ctx.arc(ledRx, ledY, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
