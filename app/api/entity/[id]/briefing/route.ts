export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';

const HOME = homedir();
const JARVIS = path.join(HOME, '.jarvis');
const CRON_LOG = path.join(JARVIS, 'logs', 'cron.log');
const TASKS_FILE = path.join(JARVIS, 'config', 'tasks.json');
const BOARD_MINUTES_DIR = path.join(JARVIS, 'state', 'board-minutes');
const CB_DIR = path.join(JARVIS, 'state', 'circuit-breaker');

// ── 엔티티 레지스트리 ────────────────────────────────────────────────────────

interface TeamLeadEntity {
  type: 'team-lead';
  name: string;
  title: string;
  avatar: string;
  keywords: string[];
  discordChannel: string;
  schedule: string;
}

interface SystemMetricEntity {
  type: 'system-metric';
  name: string;
  icon: string;
  description: string;
}

type EntityDef = TeamLeadEntity | SystemMetricEntity;

const ENTITIES: Record<string, EntityDef> = {
  // ── 팀장 엔티티 ──
  ceo: {
    type: 'team-lead', name: 'CEO (정우)', title: '대표',
    avatar: '👔', keywords: ['board-meeting', 'ceo-daily-digest', 'council'],
    discordChannel: 'jarvis-ceo', schedule: '매일 08:10, 21:55',
  },
  'infra-lead': {
    type: 'team-lead', name: '인프라팀장', title: '시스템 엔지니어링 리드',
    avatar: '⚙️', keywords: ['infra-daily', 'system-doctor', 'health', 'disk', 'glances', 'scorecard', 'aggregate-metrics'],
    discordChannel: 'jarvis-system', schedule: '매일 09:00',
  },
  'trend-lead': {
    type: 'team-lead', name: '정보팀장', title: '트렌드 & 마켓 분석',
    avatar: '📡', keywords: ['trend', 'market-alert', 'news', 'tqqq', 'stock', 'macro', 'calendar-alert', 'github-monitor'],
    discordChannel: 'jarvis', schedule: '평일 07:30',
  },
  'record-lead': {
    type: 'team-lead', name: '기록팀장', title: '데이터 아카이빙',
    avatar: '🗄️', keywords: ['record-daily', 'memory', 'session-sum', 'compact', 'rag-index'],
    discordChannel: 'jarvis-system', schedule: '매일 22:30',
  },
  'career-lead': {
    type: 'team-lead', name: '커리어팀장', title: '성장 & 커리어 전략',
    avatar: '🚀', keywords: ['career', 'commitment', 'growth', 'job', 'resume', 'interview'],
    discordChannel: 'jarvis-ceo', schedule: '매주 금 18:00',
  },
  'brand-lead': {
    type: 'team-lead', name: '브랜드팀장', title: 'OSS & 콘텐츠 전략',
    avatar: '📣', keywords: ['brand', 'openclaw', 'blog', 'oss', 'github-star'],
    discordChannel: 'jarvis-blog', schedule: '매주 화 08:00',
  },
  'audit-lead': {
    type: 'team-lead', name: '감사팀장', title: '품질 & 감사',
    avatar: '🔍', keywords: ['audit', 'cron-failure', 'kpi', 'e2e', 'regression', 'doc-sync'],
    discordChannel: 'jarvis-system', schedule: '매일 23:00',
  },
  'academy-lead': {
    type: 'team-lead', name: '학습팀장', title: '학습 큐레이션',
    avatar: '📚', keywords: ['academy', 'learning', 'study'],
    discordChannel: 'jarvis-ceo', schedule: '매주 일 20:00',
  },

  // ── 시스템 메트릭 엔티티 ──
  'cron-engine': {
    type: 'system-metric', name: '크론 엔진', icon: '📊',
    description: '자동화 태스크 실행 엔진',
  },
  'rag-memory': {
    type: 'system-metric', name: 'RAG 장기기억', icon: '🧠',
    description: 'LanceDB 벡터 검색 + BM25 하이브리드',
  },
  'discord-bot': {
    type: 'system-metric', name: 'Discord 봇', icon: '🤖',
    description: '24/7 대화형 인터페이스',
  },
  'disk-storage': {
    type: 'system-metric', name: '디스크 스토리지', icon: '💾',
    description: '로컬 스토리지 사용량',
  },
  'circuit-breaker': {
    type: 'system-metric', name: '서킷 브레이커', icon: '🛡️',
    description: '연속 실패 태스크 격리 시스템',
  },
  'dev-queue': {
    type: 'system-metric', name: '개발 큐', icon: '📋',
    description: 'AI 자동 코딩 태스크 대기열',
  },
};

// ── 유틸리티 ─────────────────────────────────────────────────────────────────

function readSafe(filePath: string): string {
  try { return readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(readFileSync(filePath, 'utf8')) as T; } catch { return fallback; }
}

interface CronEntry {
  time: string;
  task: string;
  result: string;
  message: string;
}

function parseCronLog(keywords: string[], limit = 20): CronEntry[] {
  const raw = readSafe(CRON_LOG);
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean).slice(-3000);
  const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
  const entries: CronEntry[] = [];

  for (const line of lines) {
    const m = line.match(LOG_RE);
    if (!m) continue;
    const [, ts, task, msg] = m;
    if (/^task_\d+_/.test(task)) continue;
    const lower = task.toLowerCase();
    if (keywords.length > 0 && !keywords.some(kw => lower.includes(kw))) continue;

    let result = 'unknown';
    if (/\bDONE\b|\bSUCCESS\b/.test(line)) result = 'SUCCESS';
    else if (/FAILED|ERROR|CRITICAL/.test(line)) result = 'FAILED';
    else if (/\bSKIPPED\b/.test(line)) result = 'SKIPPED';
    else if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) result = 'RUNNING';

    if (result !== 'unknown') {
      entries.push({ time: ts, task, result, message: msg.slice(0, 120) });
    }
  }
  return entries.reverse().slice(0, limit);
}

function getCronStats24h(keywords: string[]): { total: number; success: number; failed: number; rate: number } {
  const raw = readSafe(CRON_LOG);
  if (!raw) return { total: 0, success: 0, failed: 0, rate: 0 };
  const lines = raw.split('\n').filter(Boolean).slice(-3000);
  // cron.log는 KST 타임스탬프 사용 → 비교 기준도 KST로 맞춤
  const KST_OFFSET = 9 * 3600_000;
  const cutoff = new Date(Date.now() - 24 * 3600_000 + KST_OFFSET).toISOString().replace('T', ' ').slice(0, 19);
  let success = 0, failed = 0;

  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\]/);
    if (!m || m[1] < cutoff) continue;
    if (/^task_\d+_/.test(m[2])) continue;
    const lower = m[2].toLowerCase();
    if (keywords.length > 0 && !keywords.some(kw => lower.includes(kw))) continue;
    if (/\bSUCCESS\b|\bDONE\b/.test(line)) success++;
    else if (/FAILED|ERROR|CRITICAL/.test(line)) failed++;
  }
  const total = success + failed;
  return { total, success, failed, rate: total > 0 ? Math.round((success / total) * 100) : 0 };
}

function getUpcomingTasks(keywords: string[]): Array<{ time: string; task: string }> {
  interface TaskEntry { id: string; cron?: string; disabled?: boolean; enabled?: boolean }
  const tasks = readJsonSafe<TaskEntry[]>(TASKS_FILE, []);
  const upcoming: Array<{ time: string; task: string }> = [];

  for (const t of tasks) {
    if (t.disabled || t.enabled === false) continue;
    const lower = (t.id || '').toLowerCase();
    if (keywords.length > 0 && !keywords.some(kw => lower.includes(kw))) continue;
    if (t.cron) {
      upcoming.push({ time: t.cron, task: t.id });
    }
  }
  return upcoming.slice(0, 5);
}

function getLatestBoardMinutes(teamKeywords: string[]): string | null {
  try {
    if (!existsSync(BOARD_MINUTES_DIR)) return null;
    const files = readdirSync(BOARD_MINUTES_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    const content = readFileSync(path.join(BOARD_MINUTES_DIR, files[0]), 'utf8');
    const lines = content.split('\n');
    const excerpts: string[] = [];
    for (let i = 0; i < lines.length && excerpts.length < 5; i++) {
      if (teamKeywords.some(kw => lines[i].toLowerCase().includes(kw))) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 3);
        excerpts.push(lines.slice(start, end).join('\n'));
      }
    }
    return excerpts.length > 0 ? excerpts.join('\n---\n').slice(0, 500) : null;
  } catch { return null; }
}

function getCircuitBreakerStatus(): Array<{ task: string; failures: number; cooldownUntil: string }> {
  try {
    if (!existsSync(CB_DIR)) return [];
    const files = readdirSync(CB_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const data = readJsonSafe<{ failures?: number; cooldownUntil?: string }>(path.join(CB_DIR, f), {});
      return { task: f.replace('.json', ''), failures: data.failures || 0, cooldownUntil: data.cooldownUntil || '' };
    }).filter(cb => cb.failures >= 3);
  } catch { return []; }
}

function getDiskUsage(): { percent: number; used: string; total: string } {
  try {
    const out = execSync("df -h / | awk 'NR==2{print $3,$2,$5}'", { timeout: 3000 }).toString().trim();
    const [used, total, pct] = out.split(/\s+/);
    return { percent: parseInt(pct) || 0, used: used || '?', total: total || '?' };
  } catch { return { percent: 0, used: '?', total: '?' }; }
}

function getDiscordBotStatus(): { running: boolean; pid: string | null } {
  try {
    const out = execSync('pgrep -f "discord-bot.js" 2>/dev/null || true', { timeout: 3000 }).toString().trim();
    const pid = out.split('\n')[0];
    return { running: !!pid, pid: pid || null };
  } catch { return { running: false, pid: null }; }
}

function getStatusColor(rate: number): 'GREEN' | 'YELLOW' | 'RED' {
  if (rate >= 90) return 'GREEN';
  if (rate >= 70) return 'YELLOW';
  return 'RED';
}

// ── 브리핑 빌더 ──────────────────────────────────────────────────────────────

function buildTeamLeadBriefing(id: string, entity: TeamLeadEntity) {
  const stats = getCronStats24h(entity.keywords);
  const recentActivity = parseCronLog(entity.keywords, 10);
  const upcoming = getUpcomingTasks(entity.keywords);
  const boardMinutes = getLatestBoardMinutes(entity.keywords);
  const status = getStatusColor(stats.rate);

  return {
    type: 'team-lead',
    id,
    name: entity.name,
    title: entity.title,
    avatar: entity.avatar,
    status,
    schedule: entity.schedule,
    summary: stats.total > 0
      ? `오늘 크론 ${stats.total}건 실행, ${stats.success}건 성공, ${stats.failed}건 실패 (성공률 ${stats.rate}%)`
      : '오늘 실행 이력 없음',
    recentActivity,
    metrics: {
      cronSuccessRate: stats.rate,
      totalToday: stats.total,
      failedToday: stats.failed,
    },
    upcoming,
    lastBoardMinutes: boardMinutes,
    discordChannel: entity.discordChannel,
  };
}

function buildSystemMetricBriefing(id: string, entity: SystemMetricEntity) {
  switch (id) {
    case 'cron-engine': {
      const stats = getCronStats24h([]);
      const recent = parseCronLog([], 10);
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: getStatusColor(stats.rate),
        summary: `오늘 ${stats.total}건 실행, 성공률 ${stats.rate}%`,
        currentValue: stats,
        recentEvents: recent,
        alerts: stats.failed > 5 ? [`실패 ${stats.failed}건 — 점검 필요`] : [],
      };
    }
    case 'discord-bot': {
      const bot = getDiscordBotStatus();
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: bot.running ? 'GREEN' as const : 'RED' as const,
        summary: bot.running ? `정상 실행 중 (PID ${bot.pid})` : '프로세스 없음 — 확인 필요',
        currentValue: bot,
        recentEvents: [],
        alerts: bot.running ? [] : ['봇 프로세스 미감지'],
      };
    }
    case 'disk-storage': {
      const disk = getDiskUsage();
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: disk.percent >= 90 ? 'RED' as const : disk.percent >= 80 ? 'YELLOW' as const : 'GREEN' as const,
        summary: `${disk.percent}% 사용 (${disk.used} / ${disk.total})`,
        currentValue: disk,
        recentEvents: [],
        alerts: disk.percent >= 90 ? [`디스크 ${disk.percent}% — 정리 필요`] : [],
      };
    }
    case 'circuit-breaker': {
      const cbs = getCircuitBreakerStatus();
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: cbs.length > 0 ? 'YELLOW' as const : 'GREEN' as const,
        summary: cbs.length > 0 ? `${cbs.length}건 격리 중` : '모든 태스크 정상',
        currentValue: { openCount: cbs.length, items: cbs },
        recentEvents: [],
        alerts: cbs.map(cb => `${cb.task}: ${cb.failures}회 연속 실패`),
      };
    }
    case 'rag-memory': {
      const ragLog = readSafe(path.join(JARVIS, 'logs', 'rag-index.log')).split('\n').filter(Boolean).slice(-5);
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: 'GREEN' as const,
        summary: ragLog.length > 0 ? `최근 인덱싱: ${ragLog[ragLog.length - 1]?.slice(0, 80)}` : '인덱싱 로그 없음',
        currentValue: { recentLogs: ragLog.length },
        recentEvents: ragLog.map(l => ({ time: l.slice(1, 20), task: l.slice(22, 100), result: 'SUCCESS', message: l.slice(0, 120) })),
        alerts: [],
      };
    }
    case 'dev-queue': {
      const recent = parseCronLog(['dev-task', 'jarvis-coder'], 10);
      const failedCount = recent.filter(r => r.result === 'FAILED').length;
      const devStatus = failedCount > 2 ? 'RED' as const : failedCount > 0 ? 'YELLOW' as const : 'GREEN' as const;
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: devStatus,
        summary: `최근 개발 태스크 ${recent.length}건${failedCount > 0 ? ` (실패 ${failedCount}건)` : ' (정상)'}`,
        currentValue: { recentCount: recent.length, failedCount },
        recentEvents: recent,
        alerts: failedCount > 0 ? [`최근 ${failedCount}건 실패 — jarvis-coder 점검 필요`] : [],
      };
    }
    default:
      return { type: 'system-metric', id, name: entity.name, icon: entity.icon, status: 'GREEN', summary: '데이터 없음' };
  }
}

// ── Route Handler ────────────────────────────────────────────────────────────

const briefingCache: Record<string, { data: unknown; ts: number }> = {};
const BRIEFING_TTL = 15_000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entity = ENTITIES[id];
  if (!entity) {
    return NextResponse.json({ error: `Unknown entity: ${id}` }, { status: 404 });
  }

  // 15초 캐시
  const cached = briefingCache[id];
  if (cached && Date.now() - cached.ts < BRIEFING_TTL) {
    return NextResponse.json(cached.data);
  }

  const data = entity.type === 'team-lead'
    ? buildTeamLeadBriefing(id, entity)
    : buildSystemMetricBriefing(id, entity);

  briefingCache[id] = { data, ts: Date.now() };
  return NextResponse.json(data);
}

// 엔티티 목록 (프론트엔드용)
export async function POST() {
  const list = Object.entries(ENTITIES).map(([id, e]) => ({
    id,
    type: e.type,
    name: e.name,
    avatar: e.type === 'team-lead' ? e.avatar : undefined,
    icon: e.type === 'system-metric' ? e.icon : undefined,
  }));
  return NextResponse.json({ entities: list });
}
