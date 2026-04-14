export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { homedir } from 'os';
import path from 'path';

const CRON_LOG = path.join(homedir(), '.jarvis', 'logs', 'cron.log');

// ── 캐시 (30초 TTL) ──────────────────────────────────────────────────────────
let cache: { data: AgentLiveResponse; ts: number } | null = null;
const CACHE_TTL = 30_000;

// ── 팀 정의 ──────────────────────────────────────────────────────────────────
interface TeamDef {
  label: string;
  emoji: string;
  schedule: string;
  keywords: string[];
}

const TEAMS: Record<string, TeamDef> = {
  'infra-lead': {
    label: '인프라팀장',
    emoji: '⚙️',
    schedule: '매일 09:00',
    keywords: ['system-doctor', 'sync-system-metrics', 'health', 'disk', 'glances', 'aggregate-metrics', 'scorecard-enforcer'],
  },
  'trend-team': {
    label: '전략기획실장',
    emoji: '📡',
    schedule: '평일 07:30',
    keywords: ['trend', 'market-alert', 'github-monitor', 'news', 'tqqq', 'stock', 'calendar-alert'],
  },
  'audit-team': {
    label: 'QA실장',
    emoji: '🔍',
    schedule: '매일 23:00',
    keywords: ['audit', 'cron-failure', 'kpi', 'e2e', 'regression', 'doc-sync'],
  },
  'record-team': {
    label: '데이터실장',
    emoji: '🗄️',
    schedule: '매일 23:50',
    keywords: ['record-daily', 'memory', 'rag', 'session-sum', 'compact', 'index'],
  },
  'brand-team': {
    label: '마케팅실장',
    emoji: '📣',
    schedule: '매주 화 08:00',
    keywords: ['brand', 'openclaw', 'stars', 'blog', 'oss', 'github-star'],
  },
  'growth-team': {
    label: '인재개발실장',
    emoji: '🚀',
    schedule: '월 09:00',
    keywords: ['commitment', 'growth', 'career', 'job', 'resume', 'interview', 'isg'],
  },
  'academy-team': {
    label: '학습팀장',
    emoji: '📚',
    schedule: '일 20:00',
    keywords: ['academy', 'learning', 'study', 'lecture', 'boram'],
  },
  'bot-system': {
    label: '봇 시스템',
    emoji: '🤖',
    schedule: '상시',
    keywords: ['daily-restart', 'watchdog', 'bot-health', 'jarvis-coder', 'dev-task', 'board'],
  },
};

// ── 크론 로그 상태 타입 ──────────────────────────────────────────────────────
type CronStatus = 'success' | 'failed' | 'skipped' | 'running' | 'unknown';

interface CronEntry {
  task: string;
  status: CronStatus;
  message: string;
  timestamp: string; // ISO
  teamId: string;
}

interface TeamActivity {
  teamId: string;
  label: string;
  emoji: string;
  schedule: string;
  status: CronStatus;
  lastTask: string;
  lastMessage: string;
  lastAt: string | null;
  successCount24h: number;
  failCount24h: number;
  recentCrons: CronEntry[];
}

interface AgentLiveResponse {
  teams: TeamActivity[];
  unassigned: CronEntry[];
  generatedAt: string;
}

// ── 크론 이름 → 팀 매핑 ──────────────────────────────────────────────────────
function assignTeam(taskName: string): string {
  const lower = taskName.toLowerCase();
  for (const [teamId, def] of Object.entries(TEAMS)) {
    if (def.keywords.some(kw => lower.includes(kw))) return teamId;
  }
  return 'unassigned';
}

// ── 로그 라인 → 상태 파싱 ────────────────────────────────────────────────────
function parseStatus(line: string): CronStatus {
  if (/\bDONE\b/.test(line) || /\bSUCCESS\b/.test(line)) return 'success';
  if (/\bSKIPPED\b/.test(line)) return 'skipped';
  if (/FAILED|ERROR|CRITICAL/.test(line)) return 'failed';
  if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) return 'running';
  return 'unknown';
}

// ── cron.log 파싱 ─────────────────────────────────────────────────────────────
function parseCronLog(): { entries: CronEntry[]; rawLines: number } {
  let raw = '';
  try {
    raw = readFileSync(CRON_LOG, 'utf8');
  } catch {
    return { entries: [], rawLines: 0 };
  }

  const lines = raw.split('\n').filter(Boolean);
  // 최근 2000줄만 처리 (성능)
  const recent = lines.slice(-2000);

  // task_XXXXXX_ 패턴 제외 (dev-task-daemon 임시 태스크 노이즈)
  const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
  const SKIP_TASK_RE = /^task_[0-9]+_/;

  // task별 마지막 의미있는 상태 라인 추적
  const taskLatest = new Map<string, CronEntry>();
  const task24h = new Map<string, { success: number; fail: number }>();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  for (const line of recent) {
    const m = line.match(LOG_RE);
    if (!m) continue;

    const [, ts, task, msg] = m;
    if (SKIP_TASK_RE.test(task)) continue;

    const status = parseStatus(line);
    const teamId = assignTeam(task);

    // 24h 통계
    if (ts >= cutoff) {
      if (!task24h.has(task)) task24h.set(task, { success: 0, fail: 0 });
      const stat = task24h.get(task)!;
      if (status === 'success') stat.success++;
      if (status === 'failed') stat.fail++;
    }

    // 마지막 의미있는 상태 (DONE/FAILED/SKIPPED 우선, unknown 제외)
    if (status !== 'unknown' || !taskLatest.has(task)) {
      const existing = taskLatest.get(task);
      // 더 최신 또는 더 의미있는 상태면 덮어씀
      if (!existing || ts >= existing.timestamp || status !== 'unknown') {
        taskLatest.set(task, {
          task,
          status,
          message: msg.slice(0, 120),
          timestamp: `${ts}`,
          teamId,
        });
      }
    }
  }

  const entries = Array.from(taskLatest.values())
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return { entries, rawLines: recent.length };
}

// ── 응답 빌드 ─────────────────────────────────────────────────────────────────
function buildResponse(entries: CronEntry[]): AgentLiveResponse {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  // 팀별로 그룹핑
  const teamMap = new Map<string, CronEntry[]>();
  const unassigned: CronEntry[] = [];

  for (const entry of entries) {
    if (entry.teamId === 'unassigned') {
      unassigned.push(entry);
      continue;
    }
    if (!teamMap.has(entry.teamId)) teamMap.set(entry.teamId, []);
    teamMap.get(entry.teamId)!.push(entry);
  }

  const teams: TeamActivity[] = Object.entries(TEAMS).map(([teamId, def]) => {
    const teamEntries = teamMap.get(teamId) ?? [];
    const recent = teamEntries.slice(0, 5);

    // 24h 집계 (timestamp >= cutoff 인 것)
    const inWindow = teamEntries.filter(e => e.timestamp >= cutoff);
    const successCount24h = inWindow.filter(e => e.status === 'success').length;
    const failCount24h = inWindow.filter(e => e.status === 'failed').length;

    // 팀 전체 대표 상태: 가장 최신 entry 기준
    const top = teamEntries[0];
    const status: CronStatus = top?.status ?? 'unknown';

    return {
      teamId,
      label: def.label,
      emoji: def.emoji,
      schedule: def.schedule,
      status,
      lastTask: top?.task ?? '',
      lastMessage: top?.message ?? '',
      lastAt: top?.timestamp ?? null,
      successCount24h,
      failCount24h,
      recentCrons: recent,
    };
  });

  return {
    teams,
    unassigned: unassigned.slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}

// ── 라이브 상태 (LaunchAgent PID) ────────────────────────────────────────────
async function getDiscordBotPid(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('launchctl list 2>/dev/null | grep ai.jarvis.discord-bot', { timeout: 3000 });
    const pid = stdout.trim().split(/\s+/)[0];
    return /^\d+$/.test(pid) && parseInt(pid) > 0 ? pid : null;
  } catch {
    return null;
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const { entries } = parseCronLog();
  const [data, botPid] = await Promise.all([
    Promise.resolve(buildResponse(entries)),
    getDiscordBotPid(),
  ]);

  const response = {
    ...data,
    botStatus: botPid ? { running: true, pid: botPid } : { running: false, pid: null },
    cached: false,
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(response);
}
