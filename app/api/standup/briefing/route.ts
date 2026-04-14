export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';
import { getBriefingSystemMetrics } from '@/lib/map/system-metrics';
import { CRON_LOG, RESULTS_DIR, TASKS_JSON as TASKS_FILE } from '@/lib/jarvis-paths';

/**
 * 스탠드업홀(standup) 브리핑 — 전사 모닝 브리핑
 *
 * 데이터 소스:
 *  - morning-standup / daily-summary / personal-schedule-daily 크론 실행 결과
 *  - ~/.jarvis/results/morning-standup/<YYYY-MM-DD>_<HHMMSS>.md (가장 최신 1건)
 *  - ~/.jarvis/config/tasks.json 에서 morning-standup.schedule 읽어 다음 실행 시각 계산
 *
 * 인프라팀(태스크 #1)의 lib/map/rooms.ts 에서 standup 방의 entityId를
 * 이 엔드포인트로 매핑한다(해당 작업은 Wave 1 마지막에 함께 반영).
 */

const STANDUP_RESULTS_DIR = path.join(RESULTS_DIR, 'morning-standup');

const STANDUP_KEYWORDS = ['morning-standup', 'daily-summary', 'personal-schedule-daily'];

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

function getLatestStandupContent(): { filename: string; excerpt: string } | null {
  try {
    if (!existsSync(STANDUP_RESULTS_DIR)) return null;
    const files = readdirSync(STANDUP_RESULTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    const filename = files[0];
    const content = readFileSync(path.join(STANDUP_RESULTS_DIR, filename), 'utf8');
    return { filename, excerpt: content.slice(0, 1200) };
  } catch { return null; }
}

interface NextRun { schedule: string; nextRunKst: string | null }

/**
 * tasks.json 에서 morning-standup.schedule 을 읽어 다음 실행 시각을 KST 로 계산.
 * 단순 cron 표현식 (`M H * * *` — 매일 고정 시각)만 정확히 계산하고,
 * 복잡한 표현식은 raw schedule 만 노출 (nextRunKst=null).
 */
function getNextStandup(): NextRun {
  const fallback: NextRun = { schedule: '', nextRunKst: null };
  try {
    if (!existsSync(TASKS_FILE)) return fallback;
    const parsed = JSON.parse(readFileSync(TASKS_FILE, 'utf8')) as { tasks?: Array<{ id: string; schedule?: string }> };
    const list = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const standup = list.find(t => t.id === 'morning-standup');
    if (!standup || !standup.schedule) return fallback;
    const schedule = standup.schedule;
    // 단순 매일 cron: "M H * * *"
    const m = schedule.match(/^\s*(\d+)\s+(\d+)\s+\*\s+\*\s+\*\s*$/);
    if (!m) return { schedule, nextRunKst: null };
    const minute = Number(m[1]);
    const hour = Number(m[2]);
    if (!Number.isFinite(minute) || !Number.isFinite(hour)) return { schedule, nextRunKst: null };

    // 현재 KST 시각 계산 → 오늘 또는 내일 (M H) 중 가장 가까운 미래
    const KST_OFFSET_MS = 9 * 3600_000;
    const nowKstMs = Date.now() + KST_OFFSET_MS;
    const nowKst = new Date(nowKstMs);
    const y = nowKst.getUTCFullYear();
    const mo = nowKst.getUTCMonth();
    const d = nowKst.getUTCDate();
    let candidate = Date.UTC(y, mo, d, hour, minute, 0);
    if (candidate <= nowKstMs) candidate += 24 * 3600_000;
    // candidate 는 KST 가상 epoch — ISO 형태로 KST 라벨링
    const c = new Date(candidate);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const nextRunKst = `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())} ${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())} KST`;
    return { schedule, nextRunKst };
  } catch { return fallback; }
}

// ── Route Handler ────────────────────────────────────────────────────────────

interface StandupBriefing {
  type: 'standup';
  id: 'standup';
  name: string;
  title: string;
  avatar: string;
  emoji: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  summary: string;
  recentActivity: Array<{ time: string; task: string; result: string; description: string; icon: string }>;
  lastBoardMinutes: string | null;       // 팝업 호환 — 최신 스탠드업 본문을 이 필드에 담음
  boardMinutesFile: string | null;
  schedule: string;
  nextRunKst: string | null;
  updatedAt: string;
  // 다른 팀장 브리핑과의 UI 일관성을 위한 stats + systemMetrics.
  // 이전엔 standup 만 이 필드가 없어서 팝업의 "24시간 지표" 섹션이 비었다.
  stats?: { total: number; success: number; failed: number; rate: number };
  systemMetrics?: Array<{ label: string; value: number; icon: string; type: 'disk' | 'memory' | 'cpu' }>;
}

let cache: { data: StandupBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const recent = parseRecent(STANDUP_KEYWORDS, 10);
  const latest = getLatestStandupContent();
  const next = getNextStandup();

  const successCount = recent.filter(r => r.result === 'SUCCESS').length;
  const failedCount = recent.filter(r => r.result === 'FAILED').length;
  const skippedCount = recent.filter(r => r.result === 'SKIPPED').length;
  let summary: string;
  if (recent.length === 0) {
    summary = '아직 스탠드업 실행 이력이 없어요.';
  } else if (failedCount > 0) {
    summary = `스탠드업 관련 이벤트 ${recent.length}건 중 ${failedCount}건에서 문제가 있었어요.`;
  } else if (successCount === 0 && skippedCount > 0) {
    summary = `최근 ${recent.length}건 모두 조건이 맞지 않아 건너뛴 상태예요.`;
  } else if (successCount > 0) {
    summary = `오늘 모닝 스탠드업 포함 ${successCount}건이 정상 전송됐어요${skippedCount > 0 ? ` (건너뛴 건 ${skippedCount}건)` : ''}.`;
  } else {
    summary = `최근 ${recent.length}건이 진행중이거나 확인 대기 상태예요.`;
  }

  const titleTime = next.nextRunKst
    ? `다음 실행 ${next.nextRunKst}`
    : next.schedule
      ? `스케줄: ${next.schedule}`
      : '매일 모닝 브리핑';
  const status: 'GREEN' | 'YELLOW' | 'RED' =
    failedCount > 0 ? 'RED'
    : recent.length === 0 || (successCount === 0 && skippedCount > 0) ? 'YELLOW'
    : 'GREEN';

  // recentActivity를 팝업 호환 포맷으로 변환
  const richActivity = recent.map(e => {
    const timeOnly = e.time.includes(' ') ? e.time.split(' ')[1].slice(0, 5) : e.time;
    const resultLower = e.result.toLowerCase();
    const icon = e.result === 'SUCCESS' ? '💚' : e.result === 'FAILED' ? '🔴' : e.result === 'SKIPPED' ? '⏭️' : '🔄';
    const description =
      e.result === 'SUCCESS' ? `${e.task} 완료` :
      e.result === 'FAILED' ? `${e.task} 실패 — ${e.message.slice(0, 80)}` :
      e.result === 'SKIPPED' ? `${e.task} 건너뜀` :
      `${e.task} 진행중`;
    return { time: timeOnly, task: e.task, result: resultLower, description, icon };
  });

  const totalRuns = successCount + failedCount + skippedCount;
  const statsRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;

  const data: StandupBriefing = {
    type: 'standup',
    id: 'standup',
    name: '스탠드업홀',
    title: `전사 모닝 브리핑 — ${titleTime}`,
    avatar: '🎤',
    emoji: '🎤',
    status,
    summary,
    recentActivity: richActivity,
    lastBoardMinutes: latest ? latest.excerpt : null,
    boardMinutesFile: latest ? latest.filename : null,
    schedule: next.schedule,
    nextRunKst: next.nextRunKst,
    updatedAt: new Date().toISOString(),
    // 다른 팀장과의 일관성 — 24h 지표 섹션이 팝업에 노출되도록.
    stats: { total: totalRuns, success: successCount, failed: failedCount, rate: statsRate },
    systemMetrics: getBriefingSystemMetrics(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
