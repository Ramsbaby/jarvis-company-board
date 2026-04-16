export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
/**
 * 오늘 남은 예정 크론 목록 (현재 시각 이후 가장 가까운 5개)
 * 출력: tasks.json의 schedule 필드 파싱 → 다음 실행 계산 → 우측 패널 카드
 */

import { type TaskDef, getTasksFile } from '@/lib/task-types';

interface UpcomingItem {
  id: string;
  name: string;
  nextRun: string;       // ISO KST
  minutesUntil: number;
  priority: string;
  humanTime: string;     // "15:30" 형식
}

// ── cron expression → 다음 실행 시각 (KST 기준, 오늘/내일만 단순 케이스) ──
function nextRunKst(expr: string): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, dom, mon, dow] = parts;

  // KST 현재
  const KST_OFFSET_MS = 9 * 3600_000;
  const nowKstMs = Date.now() + KST_OFFSET_MS;
  const nowKst = new Date(nowKstMs);
  const y = nowKst.getUTCFullYear();
  const mo = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  const curDow = nowKst.getUTCDay(); // 0=일

  // 단순 정각 케이스: M H * * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && mon === '*') {
    const M = parseInt(min), H = parseInt(hour);

    // 요일 제한 파싱
    let allowedDows: number[] | null = null;
    if (dow !== '*') {
      if (dow === '1-5') allowedDows = [1, 2, 3, 4, 5];
      else if (dow === '0,6' || dow === '6,0') allowedDows = [0, 6];
      else if (/^\d(,\d)*$/.test(dow)) allowedDows = dow.split(',').map(Number);
      else return null;
    }

    // 오늘 또는 내일(최대 7일) 중 가장 가까운 미래
    for (let offset = 0; offset < 7; offset++) {
      const candidateKstMs = Date.UTC(y, mo, d + offset, H, M, 0);
      const candidateDow = (curDow + offset) % 7;
      if (candidateKstMs <= nowKstMs) continue;
      if (allowedDows && !allowedDows.includes(candidateDow)) continue;
      if (dom !== '*' && parseInt(dom) !== (new Date(candidateKstMs).getUTCDate())) continue;
      return new Date(candidateKstMs - KST_OFFSET_MS);
    }
    return null;
  }

  // 매 N분: */N * * * *
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const step = parseInt(everyMin[1]);
    const nextMin = Math.ceil((nowKst.getUTCMinutes() + 1) / step) * step;
    let nextHour = nowKst.getUTCHours();
    let nextDayOffset = 0;
    let finalMin = nextMin;
    if (nextMin >= 60) {
      finalMin = 0;
      nextHour += 1;
      if (nextHour >= 24) {
        nextHour = 0;
        nextDayOffset = 1;
      }
    }
    const candidateKstMs = Date.UTC(y, mo, d + nextDayOffset, nextHour, finalMin, 0);
    return new Date(candidateKstMs - KST_OFFSET_MS);
  }

  // 정각 단위 H 범위: M H1-H2 * * *
  if (/^\d+$/.test(min) && /^\d+-\d+$/.test(hour)) {
    const M = parseInt(min);
    const [h1, h2] = hour.split('-').map(Number);
    for (let offset = 0; offset <= 1; offset++) {
      for (let h = h1; h <= h2; h++) {
        const candidateKstMs = Date.UTC(y, mo, d + offset, h, M, 0);
        if (candidateKstMs > nowKstMs) return new Date(candidateKstMs - KST_OFFSET_MS);
      }
    }
  }

  return null;
}

// ── 캐시 ──
let cache: { data: UpcomingItem[]; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ upcoming: cache.data });
  }

  try {
    const tasks = getTasksFile().tasks;

    const KST_OFFSET_MS = 9 * 3600_000;
    const items: UpcomingItem[] = [];

    for (const t of tasks) {
      if (t.enabled === false) continue;
      if (!t.schedule) continue;
      const next = nextRunKst(t.schedule);
      if (!next) continue;
      const minutesUntil = Math.round((next.getTime() - Date.now()) / 60_000);
      if (minutesUntil < 0 || minutesUntil > 24 * 60) continue; // 미래 24h 이내만

      const kstDate = new Date(next.getTime() + KST_OFFSET_MS);
      const hh = kstDate.getUTCHours().toString().padStart(2, '0');
      const mm = kstDate.getUTCMinutes().toString().padStart(2, '0');

      items.push({
        id: t.id,
        name: t.name || t.id,
        nextRun: next.toISOString(),
        minutesUntil,
        priority: t.priority || 'normal',
        humanTime: `${hh}:${mm}`,
      });
    }

    // 가장 가까운 순 정렬 + 상위 6개
    items.sort((a, b) => a.minutesUntil - b.minutesUntil);
    const top = items.slice(0, 6);
    cache = { data: top, ts: Date.now() };
    return NextResponse.json({ upcoming: top });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, upcoming: [] }, { status: 500 });
  }
}
