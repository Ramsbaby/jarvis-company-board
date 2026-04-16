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

// ── Helper: teamColor → tinted shadow color ──
// Warm tones (gold/amber/red/orange) get a warm brown shadow,
// cool tones (green/blue/teal/purple/slate) get a cool blue shadow.
export function getTintedShadow(teamColor: string, alpha = 0.18): string {
  // Parse hex → hue to classify warm vs cool
  const hex = teamColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  // Warm: hue 0-60 (red→yellow) or 330-360 (magenta-red)
  const isWarm = (h >= 0 && h <= 65) || h >= 330;
  return isWarm
    ? `rgba(80,40,0,${alpha})`   // warm brown shadow
    : `rgba(0,30,80,${alpha})`;  // cool blue shadow
}

// ── Helper: draw a small pixel-art chair ──
export function drawChair(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs (4 thin posts)
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(cx - 5, cy + 3, 2, 6);
  ctx.fillRect(cx + 3, cy + 3, 2, 6);
  // Seat base
  ctx.fillStyle = '#2d3340';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - 6, cy - 2, 12, 7, 2);
  else ctx.rect(cx - 6, cy - 2, 12, 7);
  ctx.fill();
  // Seat cushion (team color accent)
  ctx.fillStyle = color + '55';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - 5, cy - 1, 10, 5, 2);
  else ctx.rect(cx - 5, cy - 1, 10, 5);
  ctx.fill();
  // Cushion highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(cx - 5, cy - 1, 10, 1);
  // Back rest
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(cx - 5, cy - 11, 10, 9);
  ctx.fillStyle = color + '35';
  ctx.fillRect(cx - 4, cy - 10, 8, 7);
  // Back highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(cx - 4, cy - 10, 8, 1);
}

// ── Helper: draw a small monitor ──
export function drawMonitor(ctx: CanvasRenderingContext2D, mx: number, my: number, screenW: number, screenH: number, screenColor: string, standColor: string) {
  // Stand shadow (soft ellipse)
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(mx + screenW / 2, my + screenH + 7, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer bezel (dark frame with subtle bevel)
  ctx.fillStyle = '#12161f';
  ctx.fillRect(mx - 2, my - 2, screenW + 4, screenH + 4);
  ctx.fillStyle = '#1a1f2e';
  ctx.fillRect(mx - 1, my - 1, screenW + 2, screenH + 2);
  // Bezel top highlight (light source from above)
  ctx.fillStyle = 'rgba(100,120,150,0.25)';
  ctx.fillRect(mx - 1, my - 2, screenW + 2, 1);

  // Screen bezel
  ctx.fillStyle = '#21262d';
  ctx.fillRect(mx, my, screenW, screenH);

  // Screen content — gradient background (top brighter, bottom darker)
  const screenGrd = ctx.createLinearGradient(mx, my + 2, mx, my + screenH - 2);
  screenGrd.addColorStop(0, screenColor);
  screenGrd.addColorStop(1, '#0a0e17');
  ctx.fillStyle = screenGrd;
  ctx.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);

  // Screen center glow (radial bloom — simulates backlight bleed)
  const sw2 = screenW / 2, sh2 = screenH / 2;
  const glowGrd = ctx.createRadialGradient(mx + sw2, my + sh2, 0, mx + sw2, my + sh2, Math.max(sw2, sh2));
  glowGrd.addColorStop(0, 'rgba(180,210,255,0.12)');
  glowGrd.addColorStop(0.5, 'rgba(100,140,200,0.06)');
  glowGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrd;
  ctx.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);

  // Scanlines (subtle CRT/LCD subpixel feel, every 3px)
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let sy = my + 3; sy < my + screenH - 2; sy += 3) {
    ctx.fillRect(mx + 2, sy, screenW - 4, 1);
  }

  // Reflection streak — brighter diagonal highlight (upper-left corner)
  const reflGrd = ctx.createLinearGradient(mx + 2, my + 2, mx + screenW * 0.4, my + screenH * 0.5);
  reflGrd.addColorStop(0, 'rgba(255,255,255,0.18)');
  reflGrd.addColorStop(0.3, 'rgba(255,255,255,0.06)');
  reflGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = reflGrd;
  ctx.fillRect(mx + 2, my + 2, screenW - 4, screenH - 4);

  // Edge reflection lines (top + left, simulating glass)
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(mx + 2, my + 2, Math.max(3, screenW * 0.35), 1);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(mx + 2, my + 3, 1, Math.max(2, screenH * 0.4));

  // Bottom screen edge glow (light spill onto bezel)
  ctx.fillStyle = 'rgba(100,160,255,0.06)';
  ctx.fillRect(mx + 2, my + screenH - 3, screenW - 4, 2);

  // Stand (metallic gradient)
  const standGrd = ctx.createLinearGradient(mx + screenW / 2 - 3, my + screenH, mx + screenW / 2 + 3, my + screenH);
  standGrd.addColorStop(0, standColor);
  standGrd.addColorStop(0.5, '#4a5568');
  standGrd.addColorStop(1, standColor);
  ctx.fillStyle = standGrd;
  ctx.fillRect(mx + screenW / 2 - 2, my + screenH, 4, 5);
  // Stand base
  ctx.fillStyle = standColor;
  ctx.fillRect(mx + screenW / 2 - 5, my + screenH + 4, 10, 3);
  // Base top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(mx + screenW / 2 - 5, my + screenH + 4, 10, 1);
}

// ── Helper: draw a potted plant (dark corporate — vivid on dark bg) ──
export function drawPlantSmall(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px, py + 8, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pot (terracotta)
  ctx.fillStyle = '#6b3a2a';
  ctx.fillRect(px - 4, py, 8, 7);
  ctx.fillStyle = '#5a2e1f';
  ctx.fillRect(px - 5, py - 1, 10, 3);
  // Pot highlight
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(px - 4, py, 2, 5);
  // Soil top
  ctx.fillStyle = '#2a1a08';
  ctx.fillRect(px - 4, py, 8, 2);
  // Main foliage
  ctx.fillStyle = '#1a6e36';
  ctx.beginPath();
  ctx.arc(px, py - 6, 6, 0, Math.PI * 2);
  ctx.fill();
  // Highlight leaves
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(px - 3, py - 9, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 3, py - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  // Leaf highlight
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(px + 2, py - 9, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

// ── 오픈 데스크 pod용 심플 가구 (데스크 1개 + 모니터 1개 + 의자 1개) ──
function drawSimplePod(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, teamColor: string) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  // ── 오브젝트 그림자 (teamColor tinted) ──
  ctx.save();
  ctx.shadowColor = getTintedShadow(teamColor, 0.45);
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  // ── L자 데스크 — 수평 바 (3-shade wood) ──
  const dW = T * 2.3, dH = T * 0.52;
  const dX = cx - T * 1.15, dY = cy - T * 0.26;
  // top surface
  ctx.fillStyle = '#3a2c18';
  ctx.fillRect(dX, dY, dW, dH);
  // top highlight (앞쪽 엣지 밝음)
  ctx.fillStyle = '#5a4428';
  ctx.fillRect(dX, dY, dW, 2);
  // front edge face (bottom — 앞쪽 면, 가장 어둠)
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(dX, dY + dH - 3, dW, 4);
  // right edge
  ctx.fillStyle = '#2e1e0c';
  ctx.fillRect(dX + dW - 2, dY, 2, dH);

  // ── L자 데스크 — 수직 바 (세로 아암) ──
  const aX = dX, aY = dY + dH - 1;
  const aW = T * 0.48, aH = T * 1.1;
  ctx.fillStyle = '#3a2c18';
  ctx.fillRect(aX, aY, aW, aH);
  ctx.fillStyle = '#5a4428';
  ctx.fillRect(aX, aY, aW, 2);
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(aX + aW - 3, aY, 3, aH);
  ctx.fillStyle = '#2e1e0c';
  ctx.fillRect(aX, aY + aH - 2, aW, 3);

  ctx.restore();

  // ── 메인 모니터 ──
  drawMonitor(ctx, cx - T * 0.42, cy - T * 1.05, T * 0.9, T * 0.55, teamColor + '28', '#2d3340');

  // ── 모니터 화면: IDE 코드 라인 (indent + syntax color) ──
  const codeLines = [
    { indent: 0, w: T * 0.35, color: teamColor + '70' },
    { indent: 2, w: T * 0.50, color: '#22c55e60' },
    { indent: 2, w: T * 0.22, color: '#58a6ff55' },
    { indent: 4, w: T * 0.40, color: '#c9d1d950' },
    { indent: 2, w: T * 0.30, color: teamColor + '50' },
  ];
  for (let li = 0; li < codeLines.length; li++) {
    const cl = codeLines[li];
    ctx.fillStyle = cl.color;
    ctx.fillRect(cx - T * 0.35 + cl.indent, cy - T * 0.94 + li * 4, cl.w, 1.5);
  }
  // Line numbers gutter (very subtle)
  ctx.fillStyle = 'rgba(100,120,160,0.20)';
  ctx.fillRect(cx - T * 0.38, cy - T * 0.96, 1, codeLines.length * 4 + 2);

  // ── 키보드 (데스크 위) ──
  ctx.fillStyle = '#252d3a';
  ctx.fillRect(cx - T * 0.38, cy - T * 0.22, T * 0.75, T * 0.2);
  ctx.fillStyle = '#1a2230';
  ctx.fillRect(cx - T * 0.38, cy - T * 0.22 + T * 0.17, T * 0.75, 2);
  // 키캡 rows
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) {
      ctx.fillStyle = '#2d3845';
      ctx.fillRect(cx - T * 0.35 + col * 5, cy - T * 0.20 + row * 4, 4, 3);
    }
  }

  // ── 머그컵 ──
  const mugX = cx + T * 0.55, mugY = cy - T * 0.14;
  ctx.fillStyle = '#1a2230';
  ctx.beginPath();
  ctx.arc(mugX, mugY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = teamColor + '80';
  ctx.beginPath();
  ctx.arc(mugX, mugY, 3, 0, Math.PI * 2);
  ctx.fill();
  // steam
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(mugX - 1, mugY - 5); ctx.lineTo(mugX - 1, mugY - 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mugX + 1, mugY - 4); ctx.lineTo(mugX + 1, mugY - 8); ctx.stroke();

  // ── 서류 스택 ──
  ctx.fillStyle = '#2a3040';
  ctx.fillRect(cx + T * 0.18, cy - T * 0.18, 10, 7);
  ctx.fillStyle = '#24283a';
  ctx.fillRect(cx + T * 0.18 + 1, cy - T * 0.18 + 1, 10, 7);
  // 텍스트 라인 시뮬
  ctx.fillStyle = '#3a4255';
  for (let pi = 0; pi < 3; pi++) {
    ctx.fillRect(cx + T * 0.18 + 2, cy - T * 0.18 + 2 + pi * 2, 6, 1);
  }

  // ── 의자 (아래쪽 배치) ──
  drawChair(ctx, cx + T * 0.15, cy + T * 0.75, teamColor);
}

// ── Executive Module (대표실/재무실): L자 데스크 + 대형 모니터 + 가죽 의자 + 책장 + 소품 1개 ──
function drawExecutiveFurniture(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, _rw: number, _rh: number,
  teamColor: string, label: string,
) {
  ctx.save();
  ctx.shadowColor = getTintedShadow(teamColor, 0.50);
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  // ── 넓은 L자 메인 데스크 ──
  // 수평 바
  const mDX = rx + T * 1.2, mDY = ry + T * 1.3;
  const mDW = T * 3.8, mDH = T * 0.6;
  ctx.fillStyle = '#3a2c18';
  ctx.fillRect(mDX, mDY, mDW, mDH);
  ctx.fillStyle = '#5a4428';  // top highlight
  ctx.fillRect(mDX, mDY, mDW, 2);
  ctx.fillStyle = '#1a0e04';  // front edge face
  ctx.fillRect(mDX, mDY + mDH - 4, mDW, 5);
  ctx.fillStyle = '#2e1e0c';  // right edge
  ctx.fillRect(mDX + mDW - 3, mDY, 3, mDH);

  // 수직 아암
  const mAX = mDX, mAY = mDY + mDH - 1;
  ctx.fillStyle = '#3a2c18';
  ctx.fillRect(mAX, mAY, T * 0.5, T * 1.5);
  ctx.fillStyle = '#5a4428';
  ctx.fillRect(mAX, mAY, T * 0.5, 2);
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(mAX + T * 0.47, mAY, 3, T * 1.5);
  ctx.fillStyle = '#2e1e0c';
  ctx.fillRect(mAX, mAY + T * 1.47, T * 0.5, 3);

  ctx.restore();

  // ── 울트라와이드 메인 모니터 ──
  drawMonitor(ctx, mDX + T * 0.7, mDY - T * 0.85, T * 1.8, T * 0.75, teamColor + '25', '#2d3340');
  // 화면 내용 (차트/대시보드 느낌)
  const scrX = mDX + T * 0.7 + 4;
  const scrY = mDY - T * 0.85 + 4;
  // 상단 메트릭 바
  ctx.fillStyle = teamColor + '50';
  ctx.fillRect(scrX, scrY, T * 0.5, 3);
  ctx.fillStyle = '#22c55e50';
  ctx.fillRect(scrX + T * 0.55, scrY, T * 0.4, 3);
  // 막대 차트
  const barHeights = [12, 18, 10, 15, 20, 8];
  for (let bi = 0; bi < 6; bi++) {
    ctx.fillStyle = bi % 2 === 0 ? teamColor + '45' : '#22c55e45';
    ctx.fillRect(scrX + bi * 7, scrY + 22 - barHeights[bi], 5, barHeights[bi]);
  }

  // ── 사이드 보조 모니터 ──
  drawMonitor(ctx, mDX + T * 2.7, mDY - T * 0.75, T * 0.9, T * 0.6, teamColor + '20', '#2d3340');

  // ── 키보드 ──
  ctx.fillStyle = '#1e2636';
  ctx.fillRect(mDX + T * 0.9, mDY + 2, T * 1.1, T * 0.22);
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(mDX + T * 0.9, mDY + T * 0.19, T * 1.1, 2);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = '#2a3548';
      ctx.fillRect(mDX + T * 0.92 + col * 5, mDY + 3 + row * 4, 4, 3);
    }
  }

  // ── 명패 / 이름 플레이트 ──
  ctx.save();
  ctx.shadowColor = teamColor + '40';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#c9a22730';
  ctx.fillRect(mDX + T * 1.5, mDY + 3, T * 1.2, 8);
  ctx.strokeStyle = '#c9a22760';
  ctx.lineWidth = 1;
  ctx.strokeRect(mDX + T * 1.5, mDY + 3, T * 1.2, 8);
  ctx.restore();
  ctx.fillStyle = '#c9a227';
  ctx.font = '5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label === '대표' ? 'CEO' : 'CFO', mDX + T * 2.1, mDY + 9);

  // ── 책장 (우측 — 3D 느낌) ──
  const bsX = rx + T * 5.3, bsY = ry + T * 0.4;
  // 책장 본체
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#1e1608';
  ctx.fillRect(bsX, bsY, T * 1.2, T * 2.8);
  ctx.restore();
  ctx.fillStyle = '#2a1e0c';  // top face
  ctx.fillRect(bsX, bsY, T * 1.2, T * 2.8);
  ctx.fillStyle = '#3a2e1a';  // top highlight
  ctx.fillRect(bsX, bsY, T * 1.2, 2);
  ctx.fillStyle = '#0e0a04';  // side shadow
  ctx.fillRect(bsX + T * 1.17, bsY, 3, T * 2.8);
  // 선반 3개
  for (let sh = 0; sh < 3; sh++) {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(bsX + 2, bsY + T * 0.85 + sh * T * 0.9, T * 1.16, 3);
    // 책 스파인 (각 선반 6권)
    const spineColors = ['#7a3020', '#2050a0', '#205030', '#a06010', '#602080', '#2070a0'];
    for (let bk = 0; bk < 6; bk++) {
      ctx.fillStyle = spineColors[(bk + sh * 2) % spineColors.length];
      ctx.fillRect(bsX + 2 + bk * 6, bsY + T * 0.88 + sh * T * 0.9, 5, T * 0.6);
      // 책 상단 하이라이트
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bsX + 2 + bk * 6, bsY + T * 0.88 + sh * T * 0.9, 5, 1);
    }
  }

  // ── 화분 (코너) ──
  drawPlantSmall(ctx, rx + T * 1.0, ry + T * 2.8);

  // ── 임원 의자 (큰 것) ──
  const chX = mDX + T * 1.8, chY = mDY + T * 0.8;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(chX, chY + 10, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(chX - 7, chY + 4, 3, 7);
  ctx.fillRect(chX + 4, chY + 4, 3, 7);
  // seat
  ctx.fillStyle = '#1a2030';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(chX - 8, chY - 3, 16, 9, 3);
  else ctx.rect(chX - 8, chY - 3, 16, 9);
  ctx.fill();
  ctx.fillStyle = teamColor + '40';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(chX - 7, chY - 2, 14, 7, 3);
  else ctx.rect(chX - 7, chY - 2, 14, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(chX - 7, chY - 2, 14, 1);
  // back rest
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(chX - 7, chY - 16, 14, 13);
  ctx.fillStyle = teamColor + '30';
  ctx.fillRect(chX - 6, chY - 15, 12, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(chX - 6, chY - 15, 12, 1);
}

// ── Standard Module (회의실/서버룸): 일자 데스크 + 모니터 + 의자 + 방 소품 1개 ──
function drawStandardFurniture(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, _rw: number, _rh: number,
  teamColor: string, variant: 'meeting' | 'server',
) {
  ctx.save();
  ctx.shadowColor = getTintedShadow(teamColor, 0.45);
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  if (variant === 'meeting') {
    // ── 원형 컨퍼런스 테이블 ──
    const tcx = rx + _rw / 2;
    const tcy = ry + _rh / 2 - T * 0.2;
    const tR = T * 1.3;

    // 테이블 그림자 (teamColor tinted)
    ctx.restore();
    ctx.save();
    ctx.shadowColor = getTintedShadow(teamColor, 0.50);
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    // 테이블 상면 (원형)
    ctx.fillStyle = '#3a2c18';
    ctx.beginPath();
    ctx.arc(tcx, tcy, tR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    // 테이블 상면 중앙 하이라이트
    const tblGrd = ctx.createRadialGradient(tcx - tR * 0.25, tcy - tR * 0.25, 0, tcx, tcy, tR);
    tblGrd.addColorStop(0, 'rgba(120,80,30,0.5)');
    tblGrd.addColorStop(0.5, 'rgba(80,50,15,0.2)');
    tblGrd.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = tblGrd;
    ctx.beginPath();
    ctx.arc(tcx, tcy, tR, 0, Math.PI * 2);
    ctx.fill();
    // 테이블 엣지 라인
    ctx.strokeStyle = '#1a0e04';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tcx, tcy, tR - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#5a4428';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tcx, tcy, tR - 3, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // 테이블 위 소품: 노트북 + 물컵들
    // 노트북
    ctx.fillStyle = '#1e2636';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tcx - 10, tcy - 8, 20, 13, 2);
    else ctx.rect(tcx - 10, tcy - 8, 20, 13);
    ctx.fill();
    ctx.fillStyle = teamColor + '35';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tcx - 9, tcy - 7, 18, 11, 1);
    else ctx.rect(tcx - 9, tcy - 7, 18, 11);
    ctx.fill();
    // 노트북 화면 코드 라인
    for (let li = 0; li < 3; li++) {
      ctx.fillStyle = `rgba(${li===0?'88,166,255':li===1?'34,197,94':'201,162,39'},0.5)`;
      ctx.fillRect(tcx - 8, tcy - 5 + li * 3, 8 + li * 2, 1.5);
    }

    // 물컵 (4개, 테이블 주변)
    const cupAngles = [0.3, 1.2, 2.5, 4.0];
    for (const a of cupAngles) {
      const cpx = tcx + Math.cos(a) * (tR - 8);
      const cpy = tcy + Math.sin(a) * (tR - 8);
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(cpx, cpy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(88,166,255,0.35)';
      ctx.beginPath();
      ctx.arc(cpx, cpy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.save();

    // 의자 4개 (테이블 주변)
    const chairAngles = [Math.PI * 0.5, Math.PI * 1.1, Math.PI * 1.7, Math.PI * 0.0];
    for (const a of chairAngles) {
      const chairX = tcx + Math.cos(a) * (tR + 12);
      const chairY = tcy + Math.sin(a) * (tR + 12);
      drawChair(ctx, chairX, chairY, teamColor);
    }

    // 프로젝터 스크린 (상단 벽)
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    const scrX = rx + _rw * 0.2, scrY = ry + T * 0.5;
    const scrW = _rw * 0.6, scrH = T * 0.9;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(scrX - 2, scrY - 2, scrW + 4, scrH + 4);
    ctx.restore();
    ctx.save();
    // 스크린 내용 (프레젠테이션 느낌)
    const scrGrd = ctx.createLinearGradient(scrX, scrY, scrX + scrW, scrY);
    scrGrd.addColorStop(0, teamColor + '18');
    scrGrd.addColorStop(1, '#0d1117');
    ctx.fillStyle = scrGrd;
    ctx.fillRect(scrX, scrY, scrW, scrH);
    // 슬라이드 제목 라인
    ctx.fillStyle = teamColor + '80';
    ctx.fillRect(scrX + 4, scrY + 4, scrW * 0.5, 3);
    ctx.fillStyle = '#c9d1d960';
    ctx.fillRect(scrX + 4, scrY + 10, scrW * 0.35, 2);
    ctx.fillRect(scrX + 4, scrY + 14, scrW * 0.45, 2);
    // 스크린 테두리
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(scrX, scrY, scrW, scrH);

  } else {
    // ── 서버 랙 4개 ──
    for (let i = 0; i < 4; i++) {
      const sx = rx + T * 0.4 + i * (T * 0.72);
      const sy = ry + T * 0.4;
      const rackH = T * 2.8;
      // 랙 본체 (3-shade)
      ctx.fillStyle = '#141c26';
      ctx.fillRect(sx, sy, T * 0.6, rackH);
      ctx.fillStyle = '#1e2836';  // top highlight
      ctx.fillRect(sx, sy, T * 0.6, 2);
      ctx.fillStyle = '#0a0e17';  // right shadow
      ctx.fillRect(sx + T * 0.57, sy, 3, rackH);
      ctx.fillStyle = '#0a0e17';  // bottom
      ctx.fillRect(sx, sy + rackH - 2, T * 0.6, 3);
      // 랙 유닛 구분선
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 0.5;
      for (let u = 0; u < 8; u++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + u * (rackH / 8));
        ctx.lineTo(sx + T * 0.6, sy + u * (rackH / 8));
        ctx.stroke();
      }
      // LED 상태등 (각 유닛)
      for (let u = 0; u < 7; u++) {
        const ledY = sy + u * (rackH / 8) + rackH / 16;
        const ledColor = u % 3 === 0 ? '#22c55e' : u % 3 === 1 ? '#3b82f6' : '#22c55e';
        // glow
        ctx.fillStyle = ledColor + '30';
        ctx.beginPath();
        ctx.arc(sx + T * 0.12, ledY, 4, 0, Math.PI * 2);
        ctx.fill();
        // dot
        ctx.fillStyle = ledColor;
        ctx.beginPath();
        ctx.arc(sx + T * 0.12, ledY, 2, 0, Math.PI * 2);
        ctx.fill();
        // label (작은 포트 표시)
        ctx.fillStyle = '#2d3340';
        ctx.fillRect(sx + T * 0.25, ledY - 2, T * 0.28, 4);
      }
    }
    // 관리 단말 데스크
    const tdX = rx + _rw - T * 2.3, tdY = ry + T * 1.8;
    ctx.fillStyle = '#3a2c18';
    ctx.fillRect(tdX, tdY, T * 1.8, T * 0.5);
    ctx.fillStyle = '#5a4428';
    ctx.fillRect(tdX, tdY, T * 1.8, 2);
    ctx.fillStyle = '#1a0e04';
    ctx.fillRect(tdX, tdY + T * 0.47, T * 1.8, 3);
    drawMonitor(ctx, tdX + T * 0.35, tdY - T * 0.65, T * 0.9, T * 0.55, '#22c55e25', '#2d3340');
    drawChair(ctx, tdX + T * 0.85, tdY + T * 0.65, '#22c55e');
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
      // ══════════════════════════════════════════════════════════
      // 홀로그래픽 컨트롤 패널 스타일 — 블루프린트 + 서버 랙 믹스
      // ══════════════════════════════════════════════════════════

      // ── 1) 베이스 그라디언트 (상단 밝음 → 하단 어두움, 천장 라이트 시뮬) ──
      const bgGrd = ctx.createLinearGradient(rx, ry, rx, ry + _rh);
      bgGrd.addColorStop(0, '#0e1624');
      bgGrd.addColorStop(0.45, '#070b13');
      bgGrd.addColorStop(1, '#050810');
      ctx.fillStyle = bgGrd;
      ctx.fillRect(rx + 1, ry + 1, _rw - 2, _rh - 2);

      // ── 2) 중앙 웜 라디얼 글로우 (공조 조명 느낌) ──
      const cgX = rx + _rw / 2;
      const cgY = ry + _rh / 2;
      const cgR = Math.max(_rw, _rh) * 0.55;
      const centerGlow = ctx.createRadialGradient(cgX, cgY, 0, cgX, cgY, cgR);
      centerGlow.addColorStop(0, 'rgba(99,102,241,0.15)');
      centerGlow.addColorStop(0.5, 'rgba(88,166,255,0.06)');
      centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(rx + 1, ry + 1, _rw - 2, _rh - 2);

      // ── 3) 블루프린트 그리드 — 세로/가로 얇은 라인 + 주요선 강조 ──
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx + 1, ry + 1, _rw - 2, _rh - 2);
      ctx.clip();
      // minor grid (T 단위)
      ctx.strokeStyle = 'rgba(88,166,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let gx = rx; gx < rx + _rw; gx += T) {
        ctx.beginPath(); ctx.moveTo(gx + 0.5, ry); ctx.lineTo(gx + 0.5, ry + _rh); ctx.stroke();
      }
      for (let gy = ry; gy < ry + _rh; gy += T) {
        ctx.beginPath(); ctx.moveTo(rx, gy + 0.5); ctx.lineTo(rx + _rw, gy + 0.5); ctx.stroke();
      }
      // major grid (5T 단위) — 더 밝음
      ctx.strokeStyle = 'rgba(88,166,255,0.14)';
      ctx.lineWidth = 0.7;
      for (let gx = rx; gx < rx + _rw; gx += T * 5) {
        ctx.beginPath(); ctx.moveTo(gx + 0.5, ry); ctx.lineTo(gx + 0.5, ry + _rh); ctx.stroke();
      }
      for (let gy = ry; gy < ry + _rh; gy += T * 5) {
        ctx.beginPath(); ctx.moveTo(rx, gy + 0.5); ctx.lineTo(rx + _rw, gy + 0.5); ctx.stroke();
      }

      // ── 4) 스캔라인 (2픽셀 간격 — CRT 느낌, 아주 은은하게) ──
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let sy = ry; sy < ry + _rh; sy += 3) {
        ctx.fillRect(rx + 1, sy, _rw - 2, 1);
      }

      // ── 5) 움직이는 스위프 라인 (fc 기반 — 40프레임 주기) ──
      const sweepY = ry + ((fc * 0.8) % _rh);
      const sweepGrd = ctx.createLinearGradient(rx, sweepY - 8, rx, sweepY + 8);
      sweepGrd.addColorStop(0, 'rgba(99,102,241,0)');
      sweepGrd.addColorStop(0.5, 'rgba(99,102,241,0.12)');
      sweepGrd.addColorStop(1, 'rgba(99,102,241,0)');
      ctx.fillStyle = sweepGrd;
      ctx.fillRect(rx + 1, sweepY - 8, _rw - 2, 16);
      ctx.restore();

      // ── 6) 코너 마커 (홀로그램 UI 브래킷) ──
      const cm = 14;
      ctx.strokeStyle = 'rgba(99,102,241,0.7)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      // top-left
      ctx.beginPath();
      ctx.moveTo(rx + 3, ry + 3 + cm); ctx.lineTo(rx + 3, ry + 3); ctx.lineTo(rx + 3 + cm, ry + 3);
      ctx.stroke();
      // top-right
      ctx.beginPath();
      ctx.moveTo(rx + _rw - 3 - cm, ry + 3); ctx.lineTo(rx + _rw - 3, ry + 3); ctx.lineTo(rx + _rw - 3, ry + 3 + cm);
      ctx.stroke();
      // bottom-left
      ctx.beginPath();
      ctx.moveTo(rx + 3, ry + _rh - 3 - cm); ctx.lineTo(rx + 3, ry + _rh - 3); ctx.lineTo(rx + 3 + cm, ry + _rh - 3);
      ctx.stroke();
      // bottom-right
      ctx.beginPath();
      ctx.moveTo(rx + _rw - 3 - cm, ry + _rh - 3); ctx.lineTo(rx + _rw - 3, ry + _rh - 3); ctx.lineTo(rx + _rw - 3, ry + _rh - 3 - cm);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // ── 7) 상단 타이틀 텍스트 ──
      ctx.font = 'bold 9px ui-monospace, "SF Mono", monospace';
      ctx.fillStyle = 'rgba(147,197,253,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText('◈ CRON OPS // REALTIME', rx + 22, ry + 13);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(99,102,241,0.75)';
      ctx.fillText(`[${cronItems.length.toString().padStart(3, '0')} ACTIVE]`, rx + _rw - 22, ry + 13);

      // ══════════════════════════════════════════════════════════
      // 워크스테이션 카드 — 3D 칩 스타일 (드롭섀도 + 이너 그라디언트 + 글로우)
      // ══════════════════════════════════════════════════════════
      cronItems.forEach((cron, i) => {
        const { tx, ty } = getCronTilePos(r, i);
        const snx = tx * T - (r.x * T - rx) + T / 2;
        const sny = ty * T - (r.y * T - ry) + T / 2;

        if (snx < rx - 80 || snx > _rw + rx + 80 || sny < ry - 40 || sny > _rh + ry + 40) return;

        type StatusKey = 'success' | 'failed' | 'running' | 'skipped' | 'unknown';
        const statusConfig: Record<StatusKey, { bgTop: string; bgBot: string; border: string; glow: string; text: string }> = {
          success: { bgTop: '#102a1a', bgBot: '#061208', border: '#22c55e', glow: 'rgba(34,197,94,0.35)', text: '#86efac' },
          failed:  { bgTop: '#2a0e0e', bgBot: '#140505', border: '#f85149', glow: 'rgba(248,81,73,0.40)', text: '#fca5a5' },
          running: { bgTop: '#0e1e35', bgBot: '#050a14', border: '#58a6ff', glow: 'rgba(88,166,255,0.45)', text: '#93c5fd' },
          skipped: { bgTop: '#241a05', bgBot: '#120c02', border: '#d29922', glow: 'rgba(210,153,34,0.35)', text: '#fbbf24' },
          unknown: { bgTop: '#1a2030', bgBot: '#0a0e17', border: '#4b5563', glow: 'rgba(75,85,99,0.20)', text: '#9ca3af' },
        };
        const st = statusConfig[(cron.status as StatusKey)] || statusConfig.unknown;

        const cardW = T * 4.2;
        const cardH = T * 1.0;
        const cx = snx - cardW / 2;
        const cy = sny - cardH / 2;
        const rad = 5;

        // ── 드롭섀도 (소프트 블랙, 아래로 3px) ──
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = st.bgBot;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, rad);
        ctx.fill();
        ctx.restore();

        // ── 외곽 글로우 halo (상태별) ──
        ctx.save();
        ctx.shadowColor = st.glow;
        ctx.shadowBlur = cron.status === 'failed' || cron.status === 'running' ? 8 : 4;
        ctx.strokeStyle = st.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cx + 0.5, cy + 0.5, cardW - 1, cardH - 1, rad);
        ctx.stroke();
        ctx.restore();

        // ── 이너 그라디언트 (상단 밝음 → 하단 어두움, 3D 칩 엣지) ──
        const innerGrd = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
        innerGrd.addColorStop(0, st.bgTop);
        innerGrd.addColorStop(0.6, st.bgBot);
        innerGrd.addColorStop(1, st.bgBot);
        ctx.fillStyle = innerGrd;
        ctx.beginPath();
        ctx.roundRect(cx + 1, cy + 1, cardW - 2, cardH - 2, rad - 1);
        ctx.fill();

        // ── 상단 하이라이트 라인 (베벨 탑) ──
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cx + 1, cy + 1, cardW - 2, cardH - 2, rad - 1);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx + 1, cy + 1, cardW - 2, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(cx + 1, cy + 2, cardW - 2, 1);
        ctx.restore();

        // ── 좌측 상태 바 (세로 색상 바 — 2px 두께) ──
        ctx.fillStyle = st.border;
        ctx.fillRect(cx + 2, cy + 3, 2, cardH - 6);

        // ── 상태 LED 점 (좌측 바 오른쪽, running은 펄스) ──
        const ledX = cx + 10;
        const ledY = cy + cardH / 2;
        if (cron.status === 'running') {
          const pulse = 0.5 + 0.5 * Math.sin(fc * 0.15 + i * 0.3);
          ctx.save();
          ctx.shadowColor = st.border;
          ctx.shadowBlur = 4 + pulse * 4;
          ctx.fillStyle = st.border;
          ctx.beginPath();
          ctx.arc(ledX, ledY, 2.2 + pulse * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.save();
          ctx.shadowColor = st.glow;
          ctx.shadowBlur = 3;
          ctx.fillStyle = st.border;
          ctx.beginPath();
          ctx.arc(ledX, ledY, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // ── 이름 라벨 ──
        const displayName = cron.name.length > 16 ? cron.name.slice(0, 15) + '…' : cron.name;
        ctx.font = 'bold 8px ui-monospace, "SF Mono", monospace';
        ctx.fillStyle = '#e6edf3';
        ctx.textAlign = 'left';
        ctx.fillText(displayName, cx + 16, cy + cardH / 2 - 2);

        // ── 상태 서브 라벨 (이름 아래 작게) ──
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillStyle = st.text;
        const subLabel = cron.status === 'success' ? 'OK' : cron.status === 'failed' ? 'ERR' : cron.status === 'running' ? 'RUN' : cron.status === 'skipped' ? 'SKIP' : '---';
        ctx.fillText(subLabel, cx + 16, cy + cardH / 2 + 6);

        // ── 우측 인덱스 넘버 (#001) ──
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(147,197,253,0.35)';
        ctx.textAlign = 'right';
        ctx.fillText(`#${(i + 1).toString().padStart(3, '0')}`, cx + cardW - 6, cy + cardH / 2 - 2);

        // ── 팀 이모지 (우측, 인덱스 아래) ──
        if (cron.teamEmoji) {
          ctx.font = '7px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(cron.teamEmoji, cx + cardW - 6, cy + cardH / 2 + 6);
        }
      });

      // 빈 방 안내
      if (cronItems.length === 0) {
        ctx.fillStyle = 'rgba(147,197,253,0.6)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('◈ LOADING CRON TELEMETRY ◈', rx + _rw / 2, ry + _rh / 2);
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
  // 카운터 그림자
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  // 카운터 상면 (어두운 목재)
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(px - 10, py - 2, 32, 14);
  // top highlight
  ctx.fillStyle = '#5a3520';
  ctx.fillRect(px - 10, py - 2, 32, 2);
  // front edge face
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(px - 10, py + 10, 32, 4);
  // right edge
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(px + 20, py - 2, 3, 14);

  ctx.restore();

  // 커피 머신 본체 (3-shade metal)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(px - 6, py - 12, 12, 12);
  ctx.restore();
  ctx.fillStyle = '#2a3040';  // top face
  ctx.fillRect(px - 6, py - 12, 12, 12);
  ctx.fillStyle = '#3a4050';  // top highlight
  ctx.fillRect(px - 6, py - 12, 12, 2);
  ctx.fillStyle = '#0d1117';  // right shadow
  ctx.fillRect(px + 5, py - 12, 2, 12);

  // 머신 스크린 (파란 LED — glow)
  ctx.fillStyle = '#58a6ff30';
  ctx.fillRect(px - 5, py - 10, 6, 4);
  ctx.fillStyle = '#58a6ff';
  ctx.fillRect(px - 4, py - 9, 4, 2);
  // 스크린 반사
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px - 4, py - 9, 4, 1);

  // 커피 추출구 (하단)
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(px - 3, py - 4, 6, 3);

  // 커피 컵
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(px - 3, py - 3, 4, 5);
  ctx.fillStyle = '#6b4010';  // 커피
  ctx.fillRect(px - 3, py - 3, 4, 1.5);
  ctx.fillStyle = 'rgba(180,120,60,0.3)';  // 크레마
  ctx.fillRect(px - 3, py - 3, 4, 0.8);

  // 뜨거운 증기
  ctx.strokeStyle = 'rgba(200,220,255,0.4)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(px - 1.5, py - 4);
  ctx.quadraticCurveTo(px, py - 8, px - 1, py - 11);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 1, py - 4);
  ctx.quadraticCurveTo(px + 2, py - 7, px + 1, py - 10);
  ctx.stroke();

  // 사이드 상품 (원두 포장 — 3D)
  ctx.fillStyle = '#4a1e08';
  ctx.fillRect(px + 10, py - 6, 7, 10);
  ctx.fillStyle = '#6a2e10';  // top highlight
  ctx.fillRect(px + 10, py - 6, 7, 2);
  ctx.fillStyle = '#2a0e04';  // right shadow
  ctx.fillRect(px + 15, py - 6, 2, 10);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(px + 11, py - 3, 5, 1);
  ctx.fillStyle = '#c9a22770';
  ctx.fillRect(px + 11, py - 1, 5, 1);
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
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(wcx - 5, wcy - 2, 10, 12);
  ctx.fillStyle = '#58a6ff50';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 10);
  ctx.fillStyle = '#58a6ff70';
  ctx.fillRect(wcx - 4, wcy - 10, 8, 4);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 0.5;
  ctx.strokeRect(wcx - 5, wcy - 2, 10, 12);

  // Water cooler #2 (Row1-Row2 복도 우측)
  const wcx2 = 53 * T - camX + T / 2;
  const wcy2 = 10 * T - camY;
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(wcx2 - 5, wcy2 - 2, 10, 12);
  ctx.fillStyle = '#58a6ff50';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 10);
  ctx.fillStyle = '#58a6ff70';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 4);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 0.5;
  ctx.strokeRect(wcx2 - 5, wcy2 - 2, 10, 12);

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

  // ── 복도 카펫 러너 (다크 네이비 — 고급 호텔 복도 느낌) ──
  const carpetColor = '#1a2240';
  const carpetEdge = '#0f1628';
  for (const corridorY of [10, 18]) {
    for (let cx = 2; cx < 54; cx++) {
      const csx = cx * T - camX;
      const csy = corridorY * T - camY;
      // 러너 바탕 (2타일 높이 × 1타일 폭)
      ctx.fillStyle = carpetColor;
      ctx.fillRect(csx, csy + T * 0.3, T, T * 1.4);
      // 러너 테두리 (좌우 골드 스트라이프)
      ctx.fillStyle = '#c9a22730';
      ctx.fillRect(csx, csy + T * 0.3, T, 1.5);
      ctx.fillRect(csx, csy + T * 1.68, T, 1.5);
      ctx.fillStyle = carpetEdge;
      ctx.fillRect(csx, csy + T * 0.3 + 1.5, T, 1);
      ctx.fillRect(csx, csy + T * 1.67 - 1, T, 1);
      // 미세 다이아몬드 패턴 (4타일마다) — 골드 포인트
      if (cx % 4 === 0) {
        ctx.fillStyle = '#c9a22728';
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
    // Bench shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(bpx + 2, bpy + T * 0.5 + 1, T * 1.5 - 2, 2);
    // Bench seat (dark wood)
    ctx.fillStyle = '#2a1e12';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bpx, bpy, T * 1.5, T * 0.5, 3);
    else ctx.rect(bpx, bpy, T * 1.5, T * 0.5);
    ctx.fill();
    // Seat highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(bpx + 2, bpy + 1, T * 1.5 - 4, 1);
    // Back rest (raised dark)
    ctx.fillStyle = '#1e1510';
    ctx.fillRect(bpx + 2, bpy - 3, T * 1.5 - 4, 4);
    // Seat cushions
    ctx.fillStyle = '#21262d';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bpx + 3, bpy + 2, T * 0.6, T * 0.35, 2);
    else ctx.rect(bpx + 3, bpy + 2, T * 0.6, T * 0.35);
    ctx.fill();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bpx + T * 0.75, bpy + 2, T * 0.6, T * 0.35, 2);
    else ctx.rect(bpx + T * 0.75, bpy + 2, T * 0.6, T * 0.35);
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
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
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

  // Wall clock showing real KST time — Phase 1 대수술 (r 10→22, 황동 베젤, 12 tick, 빨간 초침)
  const clockX = 40 * T - camX;
  const clockY = 3.3 * T - camY;
  const clockR = 22;
  const clockCY = clockY + 16;
  // Outer bezel (황동 테두리)
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(clockX, clockCY, clockR + 2, 0, Math.PI * 2);
  ctx.fill();
  // Clock backing (dark surround glow)
  ctx.save();
  ctx.shadowColor = 'rgba(201,162,39,0.3)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(clockX, clockCY, clockR + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Clock face
  ctx.fillStyle = '#f8f4ea';
  ctx.beginPath();
  ctx.arc(clockX, clockCY, clockR, 0, Math.PI * 2);
  ctx.fill();
  // Hour markers (12개 tick, 3/6/9/12는 더 김)
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r1 = clockR - 3;
    const r2 = clockR - (i % 3 === 0 ? 7 : 5);
    ctx.beginPath();
    ctx.moveTo(clockX + Math.cos(a) * r1, clockCY + Math.sin(a) * r1);
    ctx.lineTo(clockX + Math.cos(a) * r2, clockCY + Math.sin(a) * r2);
    ctx.stroke();
  }
  // Clock hands based on KST time
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const hours = kstNow.getHours() % 12;
  const minutes = kstNow.getMinutes();
  // Hour hand
  const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(clockX, clockCY);
  ctx.lineTo(clockX + Math.cos(hAngle) * 11, clockCY + Math.sin(hAngle) * 11);
  ctx.stroke();
  // Minute hand
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(clockX, clockCY);
  ctx.lineTo(clockX + Math.cos(mAngle) * 16, clockCY + Math.sin(mAngle) * 16);
  ctx.stroke();
  // Second hand (빨간 초침)
  const sAngle = ((fc % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#f85149';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(clockX, clockCY);
  ctx.lineTo(clockX + Math.cos(sAngle) * 19, clockCY + Math.sin(sAngle) * 19);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(clockX, clockCY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'butt';

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
    // 바닥 조명 원 (다크 배경에 warm glow — 더 강하게)
    const lightGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, T * 2.5);
    lightGlow.addColorStop(0, 'rgba(220,190,100,0.18)');
    lightGlow.addColorStop(0.35, 'rgba(200,170,80,0.08)');
    lightGlow.addColorStop(0.7, 'rgba(180,150,60,0.03)');
    lightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = lightGlow;
    ctx.fillRect(lx - T * 2.5, ly - T * 2.5, T * 5, T * 5);
    // 천장 등기구 표시 (밝게)
    ctx.fillStyle = 'rgba(255,255,200,0.20)';
    ctx.fillRect(lx - 6, ly - T * 0.4, 12, 3);
    ctx.fillStyle = 'rgba(255,255,220,0.90)';
    ctx.fillRect(lx - 4, ly - T * 0.4 + 1, 8, 1);
    // 등기구 미세 glow spot
    ctx.fillStyle = 'rgba(255,240,180,0.35)';
    ctx.beginPath();
    ctx.arc(lx, ly - T * 0.38, 2, 0, Math.PI * 2);
    ctx.fill();
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
