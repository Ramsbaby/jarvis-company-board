export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';
import { BOARD_MINUTES_DIR as MINUTES_DIR } from '@/lib/jarvis-paths';

const BANNER_TTL_MS = MAP_CACHE_TTL_MS * 4; // 60s

type Banner = {
  date: string;
  summary: string;
  fullContent: string;
};

let cache: { value: Banner | null; ts: number } = { value: null, ts: 0 };

function latestMinutesFile(): string | null {
  if (!existsSync(MINUTES_DIR)) return null;
  try {
    const files = readdirSync(MINUTES_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => ({ f, t: statSync(path.join(MINUTES_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files[0] ? path.join(MINUTES_DIR, files[0].f) : null;
  } catch {
    return null;
  }
}

function extractSummary(md: string): string {
  const parts: string[] = [];

  // 크론 성공률
  const cron = md.match(/크론 성공률[^|]*\|\s*(\d+%)\s*\(?([^)]*)\)?/);
  if (cron) {
    const rate = parseInt(cron[1], 10);
    const icon = rate >= 99 ? '✅' : rate >= 95 ? '🟡' : '⚠️';
    parts.push(`크론 ${cron[1]} ${icon}`);
  }

  // TQQQ 현재가
  const tqqq = md.match(/TQQQ 현재가[^|]*\|\s*\$?([\d.]+)/);
  if (tqqq) {
    const price = parseFloat(tqqq[1]);
    const icon = price >= 47 ? '✅' : price >= 40 ? '🟡' : '🔴';
    parts.push(`TQQQ $${tqqq[1]} ${icon}`);
  }

  // 시스템 판정
  const sysJudge = md.match(/시스템 판정:\s*🟢|시스템 판정:\s*🟡|시스템 판정:\s*🔴/);
  if (sysJudge) {
    const emoji = sysJudge[0].slice(-2).trim();
    parts.push(`시스템 ${emoji}`);
  }

  // 디스크
  const disk = md.match(/디스크 사용률[^|]*\|\s*(\d+%)/);
  if (disk) {
    parts.push(`디스크 ${disk[1]}`);
  }

  return parts.length > 0 ? parts.join(' | ') : '요약 추출 실패';
}

function buildBanner(): Banner | null {
  const file = latestMinutesFile();
  if (!file) return null;
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const date = path.basename(file, '.md');
  return {
    date,
    summary: extractSummary(content),
    fullContent: content,
  };
}

export async function GET() {
  const now = Date.now();
  if (cache.value && now - cache.ts < BANNER_TTL_MS) {
    return NextResponse.json(cache.value);
  }
  const banner = buildBanner();
  if (!banner) {
    return NextResponse.json({ error: '회의록 없음' }, { status: 404 });
  }
  cache = { value: banner, ts: now };
  return NextResponse.json(banner);
}
