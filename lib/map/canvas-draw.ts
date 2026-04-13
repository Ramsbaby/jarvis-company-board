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
  switch (r.id) {
    case 'president': {
      // 기존 'ceo' case의 executive 디자인을 president(대표실)가 상속
      // Rug (dark red carpet)
      ctx.fillStyle = '#5a1a1a18';
      ctx.beginPath();
      ctx.roundRect(rx + T * 1.2, ry + T * 1.8, T * 4.5, T * 2.2, 6);
      ctx.fill();
      ctx.strokeStyle = '#c9a22720';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rx + T * 1.3, ry + T * 1.9, T * 4.3, T * 2, 4);
      ctx.stroke();
      // Executive desk (large, dark wood)
      ctx.fillStyle = '#5a3e1b';
      ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, T * 0.7);
      ctx.fillStyle = '#4a2e10';
      ctx.fillRect(rx + T * 1.5, ry + T * 1.2, T * 3.5, 3);
      ctx.fillRect(rx + T * 1.6, ry + T * 1.9, 4, 10);
      ctx.fillRect(rx + T * 4.8, ry + T * 1.9, 4, 10);
      // Large monitor with golden tint
      drawMonitor(ctx, rx + T * 2.2, ry + T * 0.4, T * 1.8, T * 0.9, '#c9a22718', '#333');
      // Screen content: dashboard
      ctx.fillStyle = '#c9a22740';
      ctx.fillRect(rx + T * 2.4, ry + T * 0.55, T * 0.6, T * 0.3);
      ctx.fillRect(rx + T * 3.2, ry + T * 0.55, T * 0.6, T * 0.3);
      ctx.fillStyle = '#c9a22720';
      ctx.fillRect(rx + T * 2.4, ry + T * 0.9, T * 1.4, 4);
      // Nameplate on desk
      ctx.fillStyle = '#c9a22760';
      ctx.fillRect(rx + T * 2.5, ry + T * 1.25, T * 1.5, 6);
      ctx.fillStyle = '#fff';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('대표', rx + T * 3.25, ry + T * 1.25 + 5);
      // Leather chair (behind desk)
      ctx.fillStyle = '#5a3322';
      ctx.beginPath();
      ctx.arc(rx + T * 3.2, ry + T * 2.5, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a2812';
      ctx.fillRect(rx + T * 3.2 - 7, ry + T * 2.5 - 12, 14, 8);
      // Bookshelf on right wall
      ctx.fillStyle = '#3d2a0f';
      ctx.fillRect(rx + T * 5.5, ry + T * 0.5, T * 1, T * 2.5);
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = '#4d3a1f';
        ctx.fillRect(rx + T * 5.5, ry + T * 0.7 + j * T * 0.8, T * 1, 2);
        const bkColors = ['#8b4513', '#a0522d', '#d2691e'];
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = bkColors[k % 3];
          ctx.fillRect(rx + T * 5.65 + k * 12, ry + T * 0.8 + j * T * 0.8, 8, T * 0.55);
        }
      }
      // Plant in corner
      drawPlantSmall(ctx, rx + T * 0.8, ry + T * 3.5);
      // Picture frame on wall
      ctx.strokeStyle = '#c9a22750';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + T * 5.3, ry + T * 3.2, 18, 14);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(rx + T * 5.3 + 2, ry + T * 3.2 + 2, 14, 10);
      ctx.fillStyle = '#22c55e20';
      ctx.fillRect(rx + T * 5.3 + 4, ry + T * 3.2 + 6, 10, 5);
      break;
    }
    case 'infra-lead': {
      // L-shaped desk
      ctx.fillStyle = '#374151';
      ctx.fillRect(rx + T * 0.8, ry + T * 1.4, T * 4.5, T * 0.4);
      ctx.fillRect(rx + T * 0.8, ry + T * 1.4, T * 0.4, T * 1.5);
      // 3 monitors on desk
      for (let i = 0; i < 3; i++) {
        const mmx = rx + T * 1.0 + i * T * 1.4;
        drawMonitor(ctx, mmx, ry + T * 0.5, T * 1.1, T * 0.8, '#22c55e15', '#333');
        // Terminal lines
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = '#22c55e50';
          ctx.fillRect(mmx + 5, ry + T * 0.65 + j * 5, T * 0.5 + ((j * 7 + i * 3) % 12), 2);
        }
      }
      // Chair
      drawChair(ctx, rx + T * 2.8, ry + T * 2.5, '#1f2937');
      // Server rack miniature (right wall)
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(rx + T * 5.5, ry + T * 0.6, T * 0.9, T * 2.5);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 5.5, ry + T * 0.6, T * 0.9, T * 2.5);
      for (let j = 0; j < 6; j++) {
        ctx.fillStyle = j % 2 === 0 ? '#22c55e' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(rx + T * 5.7, ry + T * 0.9 + j * 12, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Whiteboard with diagrams
      ctx.fillStyle = '#f8fafc15';
      ctx.fillRect(rx + T * 5.2, ry + T * 3.2, T * 1.3, T * 0.9);
      ctx.strokeStyle = '#22c55e40';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 5.2, ry + T * 3.2, T * 1.3, T * 0.9);
      // Diagram lines
      ctx.strokeStyle = '#22c55e30';
      ctx.beginPath();
      ctx.moveTo(rx + T * 5.4, ry + T * 3.5);
      ctx.lineTo(rx + T * 5.9, ry + T * 3.4);
      ctx.lineTo(rx + T * 6.2, ry + T * 3.7);
      ctx.stroke();
      // Cable management under desk
      ctx.strokeStyle = '#22c55e15';
      ctx.lineWidth = 1;
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        ctx.moveTo(rx + T * 1.5 + c * T * 1.2, ry + T * 1.8);
        ctx.bezierCurveTo(rx + T * 2 + c * T * 0.5, ry + T * 2.2, rx + T * 0.8, ry + T * 2.5, rx + T * 0.8, ry + T * 2.8);
        ctx.stroke();
      }
      break;
    }
    case 'trend-lead': {
      // Wall-mounted TV (news feeds)
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(rx + T * 1, ry + T * 0.3, T * 5, T * 1.3);
      ctx.fillStyle = '#3b82f618';
      ctx.fillRect(rx + T * 1.1, ry + T * 0.4, T * 4.8, T * 1.1);
      // Chart bars
      const barH = [12, 18, 8, 22, 15, 20, 10, 16];
      for (let i = 0; i < barH.length; i++) {
        ctx.fillStyle = '#3b82f660';
        ctx.fillRect(rx + T * 1.3 + i * 17, ry + T * 1.3 - barH[i], 9, barH[i]);
      }
      // Ticker line with scrolling effect
      const tickerOffset = (fc * 0.5) % (T * 5);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(rx + T * 1, ry + T * 1.6, T * 5, 3);
      ctx.fillStyle = '#93c5fd';
      ctx.font = '6px monospace';
      ctx.textAlign = 'left';
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx + T * 1, ry + T * 1.5, T * 5, 12);
      ctx.clip();
      ctx.fillText('BREAKING: TREND ANALYSIS DATA FEED — LIVE MONITORING', rx + T * 1 - tickerOffset, ry + T * 1.73);
      ctx.fillText('BREAKING: TREND ANALYSIS DATA FEED — LIVE MONITORING', rx + T * 1 - tickerOffset + T * 8, ry + T * 1.73);
      ctx.restore();
      // Multiple screens (2 smaller)
      for (let i = 0; i < 2; i++) {
        const sx = rx + T * 1.2 + i * T * 2.6;
        drawMonitor(ctx, sx, ry + T * 2, T * 1.4, T * 0.7, '#3b82f610', '#334155');
      }
      // Globe icon
      ctx.strokeStyle = '#3b82f640';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx + T * 5.5, ry + T * 2.8, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(rx + T * 5.5, ry + T * 2.8, 5, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx + T * 5.5 - 10, ry + T * 2.8);
      ctx.lineTo(rx + T * 5.5 + 10, ry + T * 2.8);
      ctx.stroke();
      // Desk
      ctx.fillStyle = '#334155';
      ctx.fillRect(rx + T * 1, ry + T * 2.9, T * 4, T * 0.35);
      // Chair
      drawChair(ctx, rx + T * 3, ry + T * 3.5, '#1e293b');
      // Newspaper stack
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(200,200,200,${0.1 + i * 0.05})`;
        ctx.fillRect(rx + T * 5.2, ry + T * 3.6 - i * 3, 16, 10);
      }
      break;
    }
    case 'finance': {
      // Stock chart on wall (larger)
      ctx.fillStyle = '#0f2918';
      ctx.fillRect(rx + T * 0.8, ry + T * 0.3, T * 5.5, T * 1.6);
      ctx.strokeStyle = '#22c55e60';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const pts = [22, 16, 19, 11, 15, 9, 13, 7, 12, 10, 6, 8, 4];
      for (let i = 0; i < pts.length; i++) {
        const px = rx + T * 1 + i * 11;
        const py = ry + T * 0.5 + pts[i];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Candlesticks
      for (let i = 0; i < 8; i++) {
        const isUp = i % 3 !== 1;
        ctx.fillStyle = isUp ? '#22c55e60' : '#ef444460';
        ctx.fillRect(rx + T * 1.1 + i * 18, ry + T * 1.3 + (isUp ? 0 : 4), 7, isUp ? 10 : 7);
      }
      // Dual monitors with charts
      for (let i = 0; i < 2; i++) {
        drawMonitor(ctx, rx + T * 1.2 + i * T * 2.2, ry + T * 2, T * 1.6, T * 0.8, '#16653418', '#1c3324');
        // Mini chart on screen
        ctx.strokeStyle = '#22c55e40';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const smx = rx + T * 1.4 + i * T * 2.2 + j * 8;
          const smy = ry + T * 2.3 + ((j + i) % 3) * 4;
          if (j === 0) ctx.moveTo(smx, smy);
          else ctx.lineTo(smx, smy);
        }
        ctx.stroke();
      }
      // Calculator
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(rx + T * 5, ry + T * 2.5, 14, 18);
      ctx.fillStyle = '#22c55e30';
      ctx.fillRect(rx + T * 5 + 2, ry + T * 2.5 + 2, 10, 5);
      for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
          ctx.fillStyle = '#33333360';
          ctx.fillRect(rx + T * 5 + 2 + bc * 4, ry + T * 2.5 + 9 + br * 3, 3, 2);
        }
      }
      // Filing cabinet
      ctx.fillStyle = '#374151';
      ctx.fillRect(rx + T * 5.5, ry + T * 1.2, T * 0.8, T * 1.8);
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(rx + T * 5.6, ry + T * 1.4 + j * 16, T * 0.6, 12);
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(rx + T * 5.85, ry + T * 1.4 + j * 16 + 4, 6, 3);
      }
      // Safe
      ctx.fillStyle = '#374151';
      ctx.fillRect(rx + T * 0.6, ry + T * 3, T * 0.8, T * 0.8);
      ctx.strokeStyle = '#6b728080';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 0.6, ry + T * 3, T * 0.8, T * 0.8);
      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.arc(rx + T * 1, ry + T * 3.4, 4, 0, Math.PI * 2);
      ctx.fill();
      // Desk
      ctx.fillStyle = '#1c3324';
      ctx.fillRect(rx + T * 1, ry + T * 2.9, T * 4, T * 0.35);
      drawChair(ctx, rx + T * 3, ry + T * 3.5, '#14532d');
      break;
    }
    case 'record-lead': {
      // Tall bookshelves on left wall
      for (let shelf = 0; shelf < 2; shelf++) {
        const sx = rx + T * 0.5 + shelf * T * 1.5;
        ctx.fillStyle = '#6b5514';
        ctx.fillRect(sx, ry + T * 0.4, T * 1.2, T * 3.2);
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = '#8b6914';
          ctx.fillRect(sx, ry + T * 0.6 + j * T * 0.8, T * 1.2, 2);
          const colors = ['#a0522d', '#8b4513', '#d2691e', '#cd853f'];
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = colors[(k + shelf) % 4];
            ctx.fillRect(sx + 3 + k * 10, ry + T * 0.7 + j * T * 0.8, 7, T * 0.55);
          }
        }
      }
      // Tall bookshelves on right wall
      ctx.fillStyle = '#6b5514';
      ctx.fillRect(rx + T * 5.2, ry + T * 0.4, T * 1.2, T * 3.2);
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = '#8b6914';
        ctx.fillRect(rx + T * 5.2, ry + T * 0.6 + j * T * 0.8, T * 1.2, 2);
        const colors = ['#cd853f', '#a0522d', '#8b4513'];
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = colors[k];
          ctx.fillRect(rx + T * 5.35 + k * 10, ry + T * 0.7 + j * T * 0.8, 7, T * 0.55);
        }
      }
      // Filing cabinets (center-left)
      for (let i = 0; i < 2; i++) {
        const cx = rx + T * 3.5 + i * T * 0.9;
        ctx.fillStyle = '#78601f';
        ctx.fillRect(cx, ry + T * 0.5, T * 0.7, T * 2);
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = '#92702a40';
          ctx.fillRect(cx + 2, ry + T * 0.7 + j * 16, T * 0.7 - 4, 12);
          ctx.fillStyle = '#c9a227';
          ctx.fillRect(cx + T * 0.25, ry + T * 0.7 + j * 16 + 4, 5, 3);
        }
      }
      // Archive boxes stacked
      const boxColors = ['#8b7355', '#a08060', '#9b8b6b'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = boxColors[i];
        ctx.fillRect(rx + T * 3.6, ry + T * 2.8 + i * 8, 18, 7);
        ctx.strokeStyle = '#00000020';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(rx + T * 3.6, ry + T * 2.8 + i * 8, 18, 7);
      }
      // Desk with lamp
      ctx.fillStyle = '#6b5514';
      ctx.fillRect(rx + T * 2.5, ry + T * 2.5, T * 2, T * 0.35);
      // Desk lamp
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(rx + T * 4.2, ry + T * 2.2);
      ctx.lineTo(rx + T * 4.35, ry + T * 1.8);
      ctx.lineTo(rx + T * 4.5, ry + T * 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(rx + T * 4.33, ry + T * 2.2, 3, T * 0.3);
      // Light glow
      ctx.fillStyle = '#fbbf2408';
      ctx.beginPath();
      ctx.arc(rx + T * 4.35, ry + T * 2.5, 20, 0, Math.PI * 2);
      ctx.fill();
      drawChair(ctx, rx + T * 3.5, ry + T * 3.2, '#5a4a1a');
      break;
    }
    case 'audit-lead': {
      // Security monitors (3x grid) on wall
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const smx = rx + T * 0.8 + col * T * 1.7;
          const smy = ry + T * 0.4 + row * T * 0.9;
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(smx, smy, T * 1.4, T * 0.7);
          ctx.fillStyle = '#dc262610';
          ctx.fillRect(smx + 2, smy + 2, T * 1.4 - 4, T * 0.7 - 4);
          // Scan line animation
          const scanY = ((fc * 0.3 + col * 20 + row * 30) % (T * 0.7));
          ctx.fillStyle = '#dc262608';
          ctx.fillRect(smx + 2, smy + scanY, T * 1.4 - 4, 2);
          // Grid lines (security cam feel)
          ctx.strokeStyle = '#dc262618';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(smx + T * 0.7, smy);
          ctx.lineTo(smx + T * 0.7, smy + T * 0.7);
          ctx.moveTo(smx, smy + T * 0.35);
          ctx.lineTo(smx + T * 1.4, smy + T * 0.35);
          ctx.stroke();
        }
      }
      // Shield icon
      ctx.fillStyle = '#dc262620';
      ctx.beginPath();
      const shX = rx + T * 5.5, shY = ry + T * 1;
      ctx.moveTo(shX, shY - 10);
      ctx.lineTo(shX + 12, shY - 3);
      ctx.lineTo(shX + 12, shY + 8);
      ctx.lineTo(shX, shY + 14);
      ctx.lineTo(shX - 12, shY + 8);
      ctx.lineTo(shX - 12, shY - 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#dc262660';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shX - 5, shY + 1);
      ctx.lineTo(shX, shY + 6);
      ctx.lineTo(shX + 7, shY - 3);
      ctx.stroke();
      // Clipboard rack
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#92702a80';
        ctx.fillRect(rx + T * 5.8, ry + T * 2 + i * 14, 12, 10);
        ctx.fillStyle = '#f5f5f420';
        ctx.fillRect(rx + T * 5.8 + 1, ry + T * 2 + i * 14 + 2, 10, 6);
      }
      // Emergency light (blinking red)
      const emergBlink = Math.sin(fc * 0.1) > 0;
      ctx.fillStyle = emergBlink ? '#f8514980' : '#f8514920';
      ctx.beginPath();
      ctx.arc(rx + T * 6, ry + T * 3.8, 4, 0, Math.PI * 2);
      ctx.fill();
      // Desk
      ctx.fillStyle = '#4a1414';
      ctx.fillRect(rx + T * 1, ry + T * 2.5, T * 4, T * 0.35);
      drawChair(ctx, rx + T * 3, ry + T * 3.3, '#3b1111');
      break;
    }
    case 'academy-lead': {
      // Library shelves (tall, both walls)
      for (let side = 0; side < 2; side++) {
        const shX = side === 0 ? rx + T * 0.5 : rx + T * 5;
        ctx.fillStyle = '#4c1d95';
        ctx.fillRect(shX, ry + T * 0.4, T * 1.3, T * 3.2);
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = '#6b21a8';
          ctx.fillRect(shX, ry + T * 0.6 + j * T * 0.75, T * 1.3, 2);
          const colors = ['#a855f7', '#c084fc', '#7c3aed', '#d8b4fe', '#6366f1'];
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = colors[(k + side + j) % 5] + '80';
            ctx.fillRect(shX + 3 + k * 12, ry + T * 0.7 + j * T * 0.75, 9, T * 0.5);
          }
        }
      }
      // Blackboard on wall
      ctx.fillStyle = '#1a3326';
      ctx.fillRect(rx + T * 2, ry + T * 0.3, T * 2.8, T * 1.2);
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + T * 2, ry + T * 0.3, T * 2.8, T * 1.2);
      // Chalk writing
      ctx.fillStyle = '#ffffff30';
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('E = mc²', rx + T * 2.2, ry + T * 0.7);
      ctx.fillText('λ → 0', rx + T * 2.2, ry + T * 1);
      ctx.fillRect(rx + T * 3.5, ry + T * 0.5, T * 0.8, 1);
      ctx.fillRect(rx + T * 3.5, ry + T * 0.8, T * 0.6, 1);
      // Reading desk
      ctx.fillStyle = '#581c87';
      ctx.fillRect(rx + T * 2, ry + T * 1.8, T * 3, T * 0.4);
      // Open book on desk
      ctx.fillStyle = '#f5f5f420';
      ctx.fillRect(rx + T * 2.8, ry + T * 1.6, T * 0.6, T * 0.4);
      ctx.fillRect(rx + T * 3.5, ry + T * 1.6, T * 0.6, T * 0.4);
      ctx.fillStyle = '#9333ea20';
      for (let l = 0; l < 3; l++) {
        ctx.fillRect(rx + T * 2.9, ry + T * 1.65 + l * 4, T * 0.4, 1);
        ctx.fillRect(rx + T * 3.6, ry + T * 1.65 + l * 4, T * 0.4, 1);
      }
      // Study lamp
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(rx + T * 4.5, ry + T * 1.5);
      ctx.lineTo(rx + T * 4.65, ry + T * 1.1);
      ctx.lineTo(rx + T * 4.8, ry + T * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(rx + T * 4.63, ry + T * 1.5, 3, T * 0.3);
      ctx.fillStyle = '#fbbf2408';
      ctx.beginPath();
      ctx.arc(rx + T * 4.65, ry + T * 1.8, 18, 0, Math.PI * 2);
      ctx.fill();
      // Globe
      ctx.strokeStyle = '#9333ea50';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx + T * 2.5, ry + T * 3, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(rx + T * 2.5, ry + T * 3, 4, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(rx + T * 2.5 - 3, ry + T * 3 + 8, 6, 4);
      drawChair(ctx, rx + T * 3.5, ry + T * 2.8, '#3b0764');
      break;
    }
    case 'brand-lead': {
      // Mood board on wall (large)
      ctx.fillStyle = '#f5f5f412';
      ctx.fillRect(rx + T * 3.5, ry + T * 0.3, T * 2.8, T * 2.2);
      ctx.strokeStyle = '#ea580c40';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 3.5, ry + T * 0.3, T * 2.8, T * 2.2);
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
        ctx.fillStyle = s.c + '60';
        ctx.fillRect(rx + T * 3.5 + s.x, ry + T * 0.4 + s.y, s.w, s.h);
      }
      // Color palette on wall
      ctx.fillStyle = '#ea580c20';
      ctx.beginPath();
      ctx.ellipse(rx + T * 2, ry + T * 0.8, 16, 12, -0.3, 0, Math.PI * 2);
      ctx.fill();
      const pColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = pColors[i];
        ctx.beginPath();
        ctx.arc(rx + T * 1.6 + i * 6, ry + T * 0.7 + (i % 2) * 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Design table
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(rx + T * 1, ry + T * 2.2, T * 3.5, T * 0.5);
      // Color swatches on desk
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = pColors[i] + '80';
        ctx.fillRect(rx + T * 1.2 + i * 12, ry + T * 2.1, 8, 8);
      }
      // iMac-style monitor
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(rx + T * 2, ry + T * 1.2, T * 1.5, T * 0.9);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(rx + T * 2 + 2, ry + T * 1.2 + 2, T * 1.5 - 4, T * 0.7);
      ctx.fillStyle = '#ea580c18';
      ctx.fillRect(rx + T * 2 + 4, ry + T * 1.25, T * 1.5 - 8, T * 0.6);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(rx + T * 2.6, ry + T * 2.1, 8, 5);
      ctx.fillRect(rx + T * 2.4, ry + T * 2.13, T * 0.5, 3);
      // Plants
      drawPlantSmall(ctx, rx + T * 0.7, ry + T * 3.5);
      drawPlantSmall(ctx, rx + T * 5.8, ry + T * 3.5);
      drawChair(ctx, rx + T * 2.5, ry + T * 3, '#6b2a0a');
      break;
    }
    case 'career-lead': {
      // Interview table (center)
      ctx.fillStyle = '#115e59';
      ctx.fillRect(rx + T * 2, ry + T * 1.5, T * 3, T * 0.8);
      ctx.fillStyle = '#0d9488';
      ctx.fillRect(rx + T * 2 + 2, ry + T * 1.5 + 2, T * 3 - 4, T * 0.8 - 4);
      // Two chairs facing each other
      drawChair(ctx, rx + T * 3.5, ry + T * 1, '#0d9488');
      drawChair(ctx, rx + T * 3.5, ry + T * 2.8, '#0d9488');
      // Resume display on wall
      ctx.fillStyle = '#0d948818';
      ctx.fillRect(rx + T * 0.8, ry + T * 0.4, T * 1.8, T * 2);
      ctx.strokeStyle = '#5eead440';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 0.8, ry + T * 0.4, T * 1.8, T * 2);
      // Resume lines
      ctx.fillStyle = '#5eead440';
      ctx.fillRect(rx + T * 1, ry + T * 0.6, T * 1.2, 3);
      for (let j = 0; j < 6; j++) {
        ctx.fillStyle = '#5eead420';
        ctx.fillRect(rx + T * 1, ry + T * 0.85 + j * 7, T * 1.4 - j * 4, 2);
      }
      // Portfolio display on right wall
      ctx.fillStyle = '#0d948818';
      ctx.fillRect(rx + T * 4.5, ry + T * 0.4, T * 2, T * 1.5);
      ctx.strokeStyle = '#5eead430';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 4.5, ry + T * 0.4, T * 2, T * 1.5);
      // Portfolio cards
      for (let i = 0; i < 4; i++) {
        const col = i % 2, row = Math.floor(i / 2);
        ctx.fillStyle = '#5eead418';
        ctx.fillRect(rx + T * 4.7 + col * 24, ry + T * 0.6 + row * 20, 20, 16);
      }
      // Briefcase
      ctx.fillStyle = '#134e4a';
      ctx.fillRect(rx + T * 5, ry + T * 2.5, T * 1.2, T * 0.8);
      ctx.fillStyle = '#0d9488';
      ctx.fillRect(rx + T * 5.2, ry + T * 2.3, T * 0.8, 5);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(rx + T * 5.45, ry + T * 2.75, 6, 3);
      drawPlantSmall(ctx, rx + T * 0.7, ry + T * 3.5);
      break;
    }
    case 'standup': {
      // Projector screen on wall
      ctx.fillStyle = '#f1f5f910';
      ctx.fillRect(rx + T * 1.5, ry + T * 0.3, T * 4, T * 1.2);
      ctx.strokeStyle = '#eab30830';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 1.5, ry + T * 0.3, T * 4, T * 1.2);
      // Podium
      ctx.fillStyle = '#713f12';
      ctx.fillRect(rx + T * 3, ry + T * 1.8, T * 1.2, T * 1.5);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(rx + T * 2.8, ry + T * 1.8, T * 1.6, T * 0.35);
      // Microphone stand
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(rx + T * 3.5, ry + T * 0.8, 2, T * 1);
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(rx + T * 3.52, ry + T * 0.7, 5, 0, Math.PI * 2);
      ctx.fill();
      // Spotlight beams
      ctx.fillStyle = '#fbbf2406';
      ctx.beginPath();
      ctx.moveTo(rx + T * 2, ry);
      ctx.lineTo(rx + T * 2.5, ry + T * 3);
      ctx.lineTo(rx + T * 4.5, ry + T * 3);
      ctx.lineTo(rx + T * 5, ry);
      ctx.closePath();
      ctx.fill();
      // 3 rows of audience chairs
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const cx = rx + T * 1.2 + col * T * 1;
          const cy = ry + T * 3 + row * 10;
          ctx.fillStyle = '#78350f50';
          ctx.fillRect(cx - 3, cy - 3, 6, 6);
          ctx.fillStyle = '#78350f30';
          ctx.fillRect(cx - 3, cy - 6, 6, 3);
        }
      }
      break;
    }
    case 'ceo-digest': {
      // Long conference table
      ctx.fillStyle = '#475569';
      ctx.fillRect(rx + T * 1.2, ry + T * 1.5, T * 4.5, T * 1.2);
      ctx.fillStyle = '#64748b15';
      ctx.fillRect(rx + T * 1.4, ry + T * 1.6, T * 4.1, T * 1);
      // 6 chairs (3 per side)
      for (let i = 0; i < 3; i++) {
        drawChair(ctx, rx + T * 2 + i * T * 1.2, ry + T * 1.1, '#334155');
        drawChair(ctx, rx + T * 2 + i * T * 1.2, ry + T * 3.1, '#334155');
      }
      // Projector screen on wall
      ctx.fillStyle = '#f1f5f910';
      ctx.fillRect(rx + T * 1.5, ry + T * 0.2, T * 4, T * 0.9);
      ctx.strokeStyle = '#94a3b830';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 1.5, ry + T * 0.2, T * 4, T * 0.9);
      // Whiteboard
      ctx.fillStyle = '#f8fafc10';
      ctx.fillRect(rx + T * 5.8, ry + T * 0.8, T * 0.8, T * 1.5);
      ctx.strokeStyle = '#64748b40';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 5.8, ry + T * 0.8, T * 0.8, T * 1.5);
      // Marker dots
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(rx + T * 6, ry + T * 2.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(rx + T * 6.15, ry + T * 2.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(rx + T * 6.3, ry + T * 2.5, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
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

        // ── 워크스테이션 본체 ──
        // 바닥 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(snx, sny + 14, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 데스크 표면
        ctx.fillStyle = '#1a2035';
        ctx.fillRect(snx - 18, sny + 2, 36, 10);
        ctx.fillStyle = '#242b42';
        ctx.fillRect(snx - 18, sny + 2, 36, 2); // 데스크 하이라이트

        // 모니터 스탠드
        ctx.fillStyle = '#1e2842';
        ctx.fillRect(snx - 2, sny - 14, 4, 16);

        // 모니터 케이싱
        ctx.fillStyle = '#1a2035';
        ctx.beginPath();
        ctx.roundRect(snx - 16, sny - 30, 32, 20, 2);
        ctx.fill();

        // 모니터 스크린 (상태색 글로우)
        const glowA = Math.round(pulse * 40).toString(16).padStart(2, '0');
        ctx.fillStyle = stColor + glowA;
        ctx.beginPath();
        ctx.roundRect(snx - 14, sny - 28, 28, 16, 1);
        ctx.fill();
        // 스크린 베이스 (어두운 배경)
        ctx.fillStyle = '#080e1a';
        ctx.fillRect(snx - 13, sny - 27, 26, 14);
        // 스크린 내용 (가로 선 효과)
        ctx.fillStyle = stColor + '30';
        for (let sl = 0; sl < 3; sl++) {
          ctx.fillRect(snx - 11, sny - 25 + sl * 4, 10 + (i % 3) * 4, 1);
        }
        // 상태 LED (스크린 우측 상단)
        const ledPulse = Math.round(pulse * 70).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(snx + 10, sny - 25, 3, 0, Math.PI * 2);
        ctx.fillStyle = stColor + ledPulse;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(snx + 10, sny - 25, 2, 0, Math.PI * 2);
        ctx.fillStyle = stColor;
        ctx.fill();

        // 모니터 위 글로우 (상태 halo)
        const haloR = 14 + Math.sin(fc * 0.04 + i * 0.5) * 2;
        ctx.beginPath();
        ctx.arc(snx, sny - 20, haloR, 0, Math.PI * 2);
        ctx.fillStyle = stColor + Math.round(pulse * 18).toString(16).padStart(2, '0');
        ctx.fill();

        // ── 이름 라벨 (데스크 아래) ──
        const displayName = cron.name.length > 12 ? cron.name.slice(0, 11) + '…' : cron.name;
        ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, sans-serif';
        const nw = ctx.measureText(displayName).width + 6;
        // 라벨 배경
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(snx - nw / 2, sny + 14, nw, 11, 2);
        ctx.fill();
        ctx.fillStyle = '#c9d1d9';
        ctx.textAlign = 'center';
        ctx.fillText(displayName, snx, sny + 22);

        // 팀 이모지 (이름 오른쪽, 8px)
        if (cron.teamEmoji) {
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(cron.teamEmoji, snx + nw / 2 + 1, sny + 22);
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
    case 'server-room': {
      // 4 server racks with blinking LEDs
      for (let i = 0; i < 4; i++) {
        const sx = rx + T * 0.6 + i * T * 1.6;
        const sy = ry + T * 0.5;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sx, sy, T * 1.2, T * 2.8);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, T * 1.2, T * 2.8);
        // Rack label
        ctx.fillStyle = '#64748b60';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`R${i + 1}`, sx + T * 0.6, sy + 8);
        // LED rows with blinking animation
        for (let j = 0; j < 8; j++) {
          const blinkPhase = (fc + i * 7 + j * 3) % 60;
          const isLit = blinkPhase > 10;
          if (j % 3 === 0) ctx.fillStyle = isLit ? '#f85149' : '#f8514920';
          else if (j % 2 === 0) ctx.fillStyle = isLit ? '#3fb950' : '#3fb95020';
          else ctx.fillStyle = isLit ? '#58a6ff' : '#58a6ff20';
          ctx.beginPath();
          ctx.arc(sx + 6, sy + 14 + j * 10, 2, 0, Math.PI * 2);
          ctx.fill();
          // Drive slots
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(sx + 14, sy + 10 + j * 10, T * 0.5, 5);
        }
      }
      // Cable trays (overhead)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + T * 0.5, ry + T * 3.4);
      ctx.lineTo(rx + T * 6.5, ry + T * 3.4);
      ctx.stroke();
      // Cables
      ctx.strokeStyle = '#3fb95018';
      ctx.lineWidth = 1;
      for (let c = 0; c < 5; c++) {
        ctx.beginPath();
        ctx.moveTo(rx + T * 0.8 + c * T * 1.4, ry + T * 3.2);
        ctx.bezierCurveTo(
          rx + T * 1 + c * T * 1, ry + T * 3.6,
          rx + T * 3, ry + T * 3.5 + c * 2,
          rx + T * 5.5, ry + T * 3.4
        );
        ctx.stroke();
      }
      // AC unit on wall
      ctx.fillStyle = '#64748b40';
      ctx.fillRect(rx + T * 5.3, ry + T * 0.5, T * 1.2, T * 0.6);
      ctx.strokeStyle = '#94a3b840';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + T * 5.3, ry + T * 0.5, T * 1.2, T * 0.6);
      // AC vent lines
      for (let v = 0; v < 3; v++) {
        ctx.fillStyle = '#94a3b830';
        ctx.fillRect(rx + T * 5.4, ry + T * 0.6 + v * 5, T * 1, 2);
      }
      // Monitoring screen
      drawMonitor(ctx, rx + T * 5.2, ry + T * 1.5, T * 1.3, T * 0.8, '#3fb95010', '#475569');
      // Screen content
      ctx.fillStyle = '#3fb95040';
      ctx.font = '5px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('CPU:OK', rx + T * 5.35, ry + T * 1.75);
      ctx.fillText('MEM:OK', rx + T * 5.35, ry + T * 1.95);
      ctx.fillText('DISK:OK', rx + T * 5.35, ry + T * 2.1);
      break;
    }
  }
}

// Decorative elements (corridor props, signs, clock, lights)
/**
 * Ambient atmosphere — 움직이는 먼지 파티클 + 천장 조명 빛줄기.
 * 게임 루프에서 매 프레임 호출. 퍼시스턴트 파티클 상태는 particles 인자로 전달.
 */
export interface DustParticle {
  x: number;      // world coords (tile units)
  y: number;
  vx: number;     // tile/frame
  vy: number;
  life: number;   // 0~1
}

export function initDustParticles(count: number, cols: number, rows: number): DustParticle[] {
  const particles: DustParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * cols,
      y: Math.random() * rows,
      vx: (Math.random() - 0.5) * 0.004,
      vy: -0.002 - Math.random() * 0.003,
      life: Math.random(),
    });
  }
  return particles;
}

export function updateAndDrawDust(
  ctx: CanvasRenderingContext2D,
  particles: DustParticle[],
  camX: number,
  camY: number,
  cols: number,
  rows: number,
) {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.002;
    if (p.life <= 0 || p.y < 0 || p.x < 0 || p.x > cols || p.y > rows) {
      p.x = Math.random() * cols;
      p.y = rows + 0.5;
      p.life = 0.6 + Math.random() * 0.4;
      p.vx = (Math.random() - 0.5) * 0.004;
      p.vy = -0.002 - Math.random() * 0.003;
    }
    const sx = p.x * T - camX;
    const sy = p.y * T - camY;
    const alpha = Math.min(0.4, p.life * 0.35);
    ctx.fillStyle = `rgba(255, 240, 200, ${alpha})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
}

export function drawLightShafts(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  fc: number,
) {
  // 천장 조명 위치에서 대각 아래 방향 빛줄기
  const shaftSources = [
    { x: 10, y: 8 }, { x: 20, y: 8 }, { x: 30, y: 8 },
    { x: 10, y: 16 }, { x: 20, y: 16 }, { x: 30, y: 16 },
  ];
  const pulse = 0.7 + Math.sin(fc * 0.02) * 0.3;
  for (const s of shaftSources) {
    const sx = s.x * T - camX;
    const sy = s.y * T - camY;
    const grad = ctx.createLinearGradient(sx, sy, sx + T * 2, sy + T * 3);
    grad.addColorStop(0, `rgba(255, 245, 210, ${0.035 * pulse})`);
    grad.addColorStop(0.5, `rgba(255, 245, 210, ${0.018 * pulse})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx - T * 0.3, sy);
    ctx.lineTo(sx + T * 0.3, sy);
    ctx.lineTo(sx + T * 2.4, sy + T * 3);
    ctx.lineTo(sx + T * 1.4, sy + T * 3);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * 중앙 로비 카페 코너 — 소파 2개 + 원탁 + 커피 머신
 * 위치: 대략 x=18~20, y=12 (맵 중앙 열 corridor)
 */
export function drawCafeCorner(ctx: CanvasRenderingContext2D, camX: number, camY: number, fc: number) {
  const baseX = 18 * T - camX;
  const baseY = 12.5 * T - camY;

  // 카페 카펫 (둥근 바닥)
  ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
  ctx.beginPath();
  ctx.ellipse(baseX + T, baseY + T * 0.8, T * 2.5, T * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(baseX + T, baseY + T * 0.8, T * 2.5, T * 1.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 원탁 (원형 테이블)
  ctx.fillStyle = '#3a2e1c';
  ctx.beginPath();
  ctx.ellipse(baseX + T, baseY + T * 0.8, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a4424';
  ctx.beginPath();
  ctx.ellipse(baseX + T, baseY + T * 0.8 - 2, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // 커피 컵 위
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(baseX + T - 3, baseY + T * 0.8 - 4, 3, 3);
  ctx.fillStyle = '#6b3410';
  ctx.fillRect(baseX + T - 2, baseY + T * 0.8 - 3, 1, 1);
  // 스팀 (애니메이션)
  const steamY = baseY + T * 0.8 - 5 + Math.sin(fc * 0.1) * 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(baseX + T - 2, steamY - 3, 1, 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(baseX + T - 2, steamY - 5, 1, 2);

  // 좌측 소파
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(baseX - 6, baseY + T * 0.6, 14, 10, 3);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillRect(baseX - 4, baseY + T * 0.6 + 2, 10, 6);
  // 쿠션
  ctx.fillStyle = '#8b5cf640';
  ctx.beginPath();
  ctx.arc(baseX, baseY + T * 0.6 + 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // 우측 소파
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(baseX + T * 1.7, baseY + T * 0.6, 14, 10, 3);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillRect(baseX + T * 1.7 + 2, baseY + T * 0.6 + 2, 10, 6);
  ctx.fillStyle = '#8b5cf640';
  ctx.beginPath();
  ctx.arc(baseX + T * 1.7 + 7, baseY + T * 0.6 + 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // 커피 머신 (배경 뒤쪽)
  const cmx = baseX + T - 8;
  const cmy = baseY - 4;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cmx, cmy, 16, 14);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cmx + 2, cmy + 2, 12, 5);
  // LED 표시등 (깜빡임)
  const ledOn = Math.sin(fc * 0.1) > 0;
  ctx.fillStyle = ledOn ? '#22c55e' : '#166534';
  ctx.fillRect(cmx + 12, cmy + 3, 2, 2);
  // 커피 입 (아래)
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cmx + 6, cmy + 10, 4, 3);

  // 카페 표지 (위)
  ctx.fillStyle = 'rgba(139, 92, 246, 0.6)';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('☕ LOUNGE', baseX + T, baseY - 10);
}

export function drawDecorations(ctx: CanvasRenderingContext2D, camX: number, camY: number, fc: number) {

  // Potted plants at corridor intersections
  const plantPositions = [
    { x: 9.5, y: 8 }, { x: 18.5, y: 8 }, { x: 27.5, y: 8 },
    { x: 9.5, y: 16 }, { x: 18.5, y: 16 }, { x: 27.5, y: 16 },
    { x: 9.5, y: 24 }, { x: 18.5, y: 24 }, { x: 27.5, y: 24 },
    { x: 37, y: 8 }, { x: 37, y: 16 },
  ];
  for (const pl of plantPositions) {
    drawPlantSmall(ctx, pl.x * T - camX, pl.y * T - camY);
  }

  // Water cooler
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

  // Water cooler #2 (right side)
  const wcx2 = 38 * T - camX + T / 2;
  const wcy2 = 16 * T - camY;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(wcx2 - 5, wcy2 - 2, 10, 12);
  ctx.fillStyle = '#bae6fd50';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 10);
  ctx.fillStyle = '#7dd3fc60';
  ctx.fillRect(wcx2 - 4, wcy2 - 10, 8, 4);

  // Vending machine (near server room area)
  const vmx = 38 * T - camX;
  const vmy = 22 * T - camY;
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
  const nbx = 10 * T - camX;
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
  const signX = 20 * T - camX;
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
    { x: 25, y: 8, dir: 'right' }, { x: 35, y: 8, dir: 'left' },
    { x: 5, y: 16, dir: 'right' }, { x: 15, y: 16, dir: 'right' },
    { x: 25, y: 16, dir: 'right' }, { x: 35, y: 16, dir: 'left' },
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
    { x: 0.3, y: 7.5 }, { x: 0.3, y: 15.5 }, { x: 0.3, y: 23.5 },
    { x: 38.5, y: 7.5 },
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
  const clockX = 30 * T - camX;
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
    // 바닥 조명 원 (더 풍부한 글로우)
    const lightGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, T * 2.2);
    lightGlow.addColorStop(0, 'rgba(255,255,220,0.06)');
    lightGlow.addColorStop(0.4, 'rgba(255,255,200,0.03)');
    lightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = lightGlow;
    ctx.fillRect(lx - T * 2.2, ly - T * 2.2, T * 4.4, T * 4.4);
    // 천장 등기구 표시 (작은 흰 사각형)
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(lx - 6, ly - T * 0.4, 12, 3);
    ctx.fillStyle = 'rgba(255,255,200,0.25)';
    ctx.fillRect(lx - 4, ly - T * 0.4 + 1, 8, 1);
  }

  // Lobby welcome mat near entrance (top center corridor)
  const matX = 18 * T - camX;
  const matY = 1 * T - camY;
  ctx.fillStyle = '#5a3e1b15';
  ctx.beginPath();
  ctx.roundRect(matX, matY, T * 4, T * 0.6, 3);
  ctx.fill();
  ctx.strokeStyle = '#c9a22715';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(matX + 2, matY + 2, T * 4 - 4, T * 0.6 - 4, 2);
  ctx.stroke();
}
