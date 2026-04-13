export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

/**
 * 사장실(president) 브리핑 — 대표님 전용 집무실
 *
 * 데이터 소스:
 *  - CEO 일일 요약 (ceo-daily-digest), 경영 점검 (council-insight) 크론 실행 결과
 *  - 최신 board-minutes (전사 이사회 회의록)
 *
 * 인프라팀(태스크 #1)의 lib/map/rooms.ts 에서 president 방의 entityId를
 * 이 엔드포인트로 매핑한다(해당 작업은 Wave 1 마지막에 함께 반영).
 */

const HOME = homedir();
const JARVIS = path.join(HOME, '.jarvis');
const CRON_LOG = path.join(JARVIS, 'logs', 'cron.log');
const BOARD_MINUTES_DIR = path.join(JARVIS, 'state', 'board-minutes');
// 결과 dir 폴백 — board-minutes 가 비어있을 때 가장 최신 보고서를 본다
const RESULT_FALLBACK_DIRS = [
  path.join(JARVIS, 'results', 'board-meeting'),
  path.join(JARVIS, 'results', 'ceo-daily-digest'),
];

const PRESIDENT_KEYWORDS = ['ceo-daily-digest', 'council-insight', 'board-meeting', 'monthly-review'];

interface CronEntry { time: string; task: string; result: string; message: string }

function readSafe(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

function parseRecent(keywords: string[], limit: number): CronEntry[] {
  const raw = readSafe(CRON_LOG);
  if (!raw) return [];
  const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
  const lines = raw.split('\n').filter(Boolean).slice(-3000);
  const entries: CronEntry[] = [];
  for (const line of lines) {
    const m = line.match(LOG_RE);
    if (!m) continue;
    const [, ts, task, msg] = m;
    if (/^task_\d+_/.test(task)) continue;
    const lower = task.toLowerCase();
    if (!keywords.some(kw => lower.includes(kw))) continue;
    let result = 'unknown';
    if (/\bDONE\b|\bSUCCESS\b/.test(line)) result = 'SUCCESS';
    else if (/FAILED|ERROR|CRITICAL/.test(line)) result = 'FAILED';
    else if (/\bSKIPPED\b/.test(line)) result = 'SKIPPED';
    else if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) result = 'RUNNING';
    if (result !== 'unknown') entries.push({ time: ts, task, result, message: msg.slice(0, 120) });
  }
  return entries.reverse().slice(0, limit);
}

function pickLatestMd(dir: string): { filename: string; full: string } | null {
  try {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    return { filename: files[0], full: path.join(dir, files[0]) };
  } catch { return null; }
}

function getLatestBoardMinutes(): { filename: string; excerpt: string } | null {
  // 1차: board-minutes (전사 회의록)
  let pick = pickLatestMd(BOARD_MINUTES_DIR);
  // 2차: 결과 dir 폴백
  if (!pick) {
    for (const d of RESULT_FALLBACK_DIRS) {
      pick = pickLatestMd(d);
      if (pick) break;
    }
  }
  if (!pick) return null;
  try {
    const content = readFileSync(pick.full, 'utf8');
    const excerpt = content.split('\n').slice(0, 30).join('\n').slice(0, 800);
    return { filename: pick.filename, excerpt };
  } catch { return null; }
}

// ── Route Handler ────────────────────────────────────────────────────────────

interface PresidentBriefing {
  type: 'president';
  id: 'president';
  name: string;
  title: string;
  avatar: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  summary: string;
  recentActivity: CronEntry[];
  lastBoardMinutes: { filename: string; excerpt: string } | null;
  updatedAt: string;
}

let cache: { data: PresidentBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const recent = parseRecent(PRESIDENT_KEYWORDS, 10);
  const boardMinutes = getLatestBoardMinutes();

  const successCount = recent.filter(r => r.result === 'SUCCESS').length;
  const failedCount = recent.filter(r => r.result === 'FAILED').length;
  const skippedCount = recent.filter(r => r.result === 'SKIPPED').length;
  let summary: string;
  if (recent.length === 0) {
    summary = '아직 보고된 CEO·경영 점검 이벤트가 없어요.';
  } else if (failedCount > 0) {
    summary = `최근 ${recent.length}건 중 ${failedCount}건에서 문제가 발생했습니다. 확인이 필요해요.`;
  } else if (successCount === 0 && skippedCount > 0) {
    summary = `최근 ${recent.length}건 모두 비활성/조건 불일치로 건너뛴 상태예요.`;
  } else if (successCount > 0) {
    summary = `최근 CEO·경영 보고 ${successCount}건이 정상 전달됐습니다${skippedCount > 0 ? ` (건너뛴 건 ${skippedCount}건)` : ''}.`;
  } else {
    summary = `최근 ${recent.length}건이 진행중이거나 확인 대기 상태예요.`;
  }

  const status: 'GREEN' | 'YELLOW' | 'RED' =
    failedCount > 0 ? 'RED'
    : recent.length === 0 || (successCount === 0 && skippedCount > 0) ? 'YELLOW'
    : 'GREEN';

  const data: PresidentBriefing = {
    type: 'president',
    id: 'president',
    name: '사장실',
    title: '대표님(이정우) 전용 집무실',
    avatar: '🏛️',
    status,
    summary,
    recentActivity: recent,
    lastBoardMinutes: boardMinutes,
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
