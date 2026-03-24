import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getDb } from '@/lib/db';
import Link from 'next/link';
import RefreshButton from './RefreshButton';
import MobileBottomNav from '@/components/MobileBottomNav';

export const dynamic = 'force-dynamic';

const JARVIS_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');

// ── 파일 유틸 ──────────────────────────────────────────────────────────────
function safeJson<T>(p: string): T | null {
  try { return JSON.parse(readFileSync(p, 'utf-8')) as T; } catch { return null; }
}
function safeText(p: string): string {
  try { return readFileSync(p, 'utf-8'); } catch { return ''; }
}
function safeLines(p: string): string[] { return safeText(p).split('\n').filter(Boolean); }
function safeJsonLines<T>(p: string): T[] {
  return safeLines(p).flatMap(l => { try { return [JSON.parse(l) as T]; } catch { return []; } });
}

// ── 채널 이름 매핑 ──────────────────────────────────────────────────────────
const CH: Record<string, string> = {
  '1468386844621144065': 'jarvis-main',
  '1469190688083280065': 'jarvis-dev',
  '1469190686145384513': 'jarvis-ceo',
  '1475786634510467186': 'workgroup-board',
  '1471694919339868190': 'jarvis-career',
  '1474650972310605886': 'news',
  '1484008782853050483': 'jarvis-boram',
  '1470559565258162312': 'jarvis-lite',
  '1469905074661757049': 'jarvis-blog',
  '1472965899790061680': 'quiet-ch2',
  '1470011814803935274': 'quiet-ch1',
  '1469999923633328279': 'jarvis-family',
};

// ── Discord JSONL 파싱 ──────────────────────────────────────────────────────
interface BotHealth { wsPing: number; memMB: number; uptimeSec: number; silenceSec: number; ts: string }
interface ChActivity { human: number; bot: number; claudes: number; totalElapsed: number }

function parseDiscordJsonl() {
  const today = new Date().toISOString().slice(0, 10);
  const lines = safeLines(join(JARVIS_HOME, 'logs', 'discord-bot.jsonl'));
  const channelActivity: Record<string, ChActivity> = {};
  const claudeElapseds: number[] = [];
  const stopReasons: Record<string, number> = {};
  let lastHealth: BotHealth | null = null;
  let restartCount = 0;
  let botErrors = 0;

  for (const line of lines) {
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { continue; }
    const ts = (e.ts as string) ?? '';
    const msg = (e.msg as string) ?? '';

    if (msg === 'Health check') {
      lastHealth = {
        wsPing: (e.wsPing as number) ?? 0,
        memMB: (e.memMB as number) ?? 0,
        uptimeSec: (e.uptimeSec as number) ?? 0,
        silenceSec: (e.silenceSec as number) ?? 0,
        ts,
      };
    }

    if (!ts.startsWith(today)) continue;

    if (msg === 'messageCreate received') {
      const ch = (e.channelId as string) ?? 'unknown';
      if (!channelActivity[ch]) channelActivity[ch] = { human: 0, bot: 0, claudes: 0, totalElapsed: 0 };
      if (e.bot) channelActivity[ch].bot++; else channelActivity[ch].human++;
    }
    if (msg === 'Claude completed') {
      const elapsed = parseFloat(((e.elapsed as string) ?? '0s').replace('s', ''));
      claudeElapseds.push(elapsed);
      const ch = (e.threadId as string) ?? 'unknown';
      if (!channelActivity[ch]) channelActivity[ch] = { human: 0, bot: 0, claudes: 0, totalElapsed: 0 };
      channelActivity[ch].claudes++;
      channelActivity[ch].totalElapsed += elapsed;
      const sr = (e.stopReason as string) ?? 'unknown';
      stopReasons[sr] = (stopReasons[sr] ?? 0) + 1;
    }
    if (msg === 'Bot restarted') restartCount++;
    if ((e.level as string) === 'error') botErrors++;
  }

  const count = claudeElapseds.length;
  const sorted = [...claudeElapseds].sort((a, b) => a - b);
  const avgElapsed = count > 0 ? Math.round(sorted.reduce((s, v) => s + v, 0) / count) : 0;
  const p95Elapsed = count > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0) : 0;

  return {
    channelActivity,
    claudeCount: count,
    avgElapsed,
    p95Elapsed,
    stopReasons,
    lastHealth,
    restartCount,
    botErrors,
    totalHuman: Object.values(channelActivity).reduce((s, v) => s + v.human, 0),
  };
}

// ── 크론 로그 파싱 ──────────────────────────────────────────────────────────
interface CronDaily { date: string; ok: number; fail: number }
interface TaskStatus { lastRun: string; lastStatus: string; failCount: number; runCount: number; failType?: string }

function parseCronLog() {
  const text = safeText(join(JARVIS_HOME, 'logs', 'cron.log'));
  const dailyMap: Record<string, { ok: number; fail: number }> = {};
  const errMap: Record<string, { count: number; lastAt: string; type: string }> = {};
  const taskStatus: Record<string, TaskStatus> = {};
  const todayCounts: Record<string, { ok: number; fail: number }> = {};
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const line of text.split('\n')) {
    const dm = line.match(/^\[(\d{4}-\d{2}-\d{2})\s/);
    if (!dm || new Date(dm[1]) < cutoff) continue;
    const date = dm[1];
    const task = line.match(/\]\s*\[([^\]]+)\]/)?.[1] ?? 'unknown';
    const ts = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/)?.[1] ?? date;

    if (!dailyMap[date]) dailyMap[date] = { ok: 0, fail: 0 };
    if (!taskStatus[task]) taskStatus[task] = { lastRun: ts, lastStatus: 'UNKNOWN', failCount: 0, runCount: 0 };
    if (ts > taskStatus[task].lastRun) taskStatus[task].lastRun = ts;

    const isOk = / SUCCESS | OK /.test(line);
    const isFail = /FAILED|ERROR/.test(line);

    if (isOk) {
      dailyMap[date].ok++;
      taskStatus[task].runCount++;
      if (ts >= taskStatus[task].lastRun) taskStatus[task].lastStatus = 'OK';
    }
    if (isFail) {
      dailyMap[date].fail++;
      taskStatus[task].failCount++;
      taskStatus[task].runCount++;
      if (ts >= taskStatus[task].lastRun) taskStatus[task].lastStatus = 'FAILED';
      const type = line.match(/\[FAILED:([^\]]+)\]/)?.[1] ?? 'UNKNOWN';
      if (!errMap[task]) errMap[task] = { count: 0, lastAt: ts, type };
      errMap[task].count++;
      if (!taskStatus[task].failType) taskStatus[task].failType = type;
      if (ts > errMap[task].lastAt) errMap[task].lastAt = ts;
    }

    if (date === todayStr) {
      if (!todayCounts[task]) todayCounts[task] = { ok: 0, fail: 0 };
      if (isOk) todayCounts[task].ok++;
      if (isFail) todayCounts[task].fail++;
    }
  }

  const daily: CronDaily[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const date = d.toISOString().slice(0, 10);
    return { date, ok: dailyMap[date]?.ok ?? 0, fail: dailyMap[date]?.fail ?? 0 };
  });
  const topErrors = Object.entries(errMap)
    .map(([task, v]) => ({ task, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topToday = Object.entries(todayCounts)
    .map(([task, v]) => ({ task, ...v, total: v.ok + v.fail }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
  const recentFailed = Object.entries(taskStatus)
    .filter(([, s]) => s.lastStatus === 'FAILED')
    .map(([task, s]) => ({ task, ...s }))
    .sort((a, b) => b.lastRun.localeCompare(a.lastRun))
    .slice(0, 8);

  return { daily, topErrors, topToday, recentFailed };
}

// ── RAG ──────────────────────────────────────────────────────────────────────
function detectRagStuck() {
  const lines = safeLines(join(JARVIS_HOME, 'logs', 'rag-index.log')).slice(-30);
  const stuckLines = lines.filter(l => l.includes('Already running'));
  const pids = [...new Set(stuckLines.map(l => l.match(/PID (\d+)/)?.[1]).filter(Boolean))];
  return { stuck: stuckLines.length >= 3, pidCycling: pids.length, lastLine: lines.at(-1) ?? '' };
}

interface RagRebuilding { started_at: string; pid: number; reason: string }
function readRagRebuilding(): RagRebuilding | null {
  return safeJson<RagRebuilding>(join(JARVIS_HOME, 'state', 'rag-rebuilding.json'));
}

// ── 서킷브레이커 ──────────────────────────────────────────────────────────────
interface CircuitEntry { task_id: string; consecutive_fails: number; last_fail_ts: number }
function readCircuitBreakers(): CircuitEntry[] {
  const dir = join(JARVIS_HOME, 'state', 'circuit-breaker');
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .flatMap(f => { const d = safeJson<CircuitEntry>(join(dir, f)); return d ? [d] : []; })
      .sort((a, b) => b.last_fail_ts - a.last_fail_ts);
  } catch { return []; }
}

// ── LaunchAgent 상태 ──────────────────────────────────────────────────────────
const LAUNCH_SERVICES = [
  'ai.jarvis.discord-bot', 'ai.jarvis.orchestrator', 'ai.jarvis.watchdog',
  'ai.jarvis.rag-watcher', 'ai.jarvis.dashboard', 'ai.jarvis.webhook-listener',
  'ai.jarvis.event-watcher', 'ai.jarvis.dashboard-tunnel',
];
interface LaunchEntry { name: string; pid: string | null; exitCode: number | null; loaded: boolean }

async function readLaunchAgents(): Promise<LaunchEntry[]> {
  try {
    const { execSync } = await import('child_process');
    const output = execSync('launchctl list 2>/dev/null', { timeout: 3000 }).toString();
    return LAUNCH_SERVICES.map(name => {
      const line = output.split('\n').find(l => l.includes(name));
      if (!line) return { name, pid: null, exitCode: null, loaded: false };
      const parts = line.trim().split(/\s+/);
      return {
        name,
        pid: parts[0] === '-' ? null : (parts[0] ?? null),
        exitCode: parseInt(parts[1] ?? '0', 10),
        loaded: true,
      };
    });
  } catch { return LAUNCH_SERVICES.map(name => ({ name, pid: null, exitCode: null, loaded: false })); }
}

// ── 기타 데이터 ──────────────────────────────────────────────────────────────
interface Decision {
  ts: string; decision: string; team: string;
  okr?: string | null; status?: string; rationale?: string;
  action?: string; result?: string;
}
function readTodayDecisions(): Decision[] {
  const today = new Date().toISOString().slice(0, 10);
  return safeJsonLines<Decision>(join(JARVIS_HOME, 'state', 'decisions', `${today}.jsonl`)).slice(-20);
}

interface DevQueueItem {
  id: string; name: string; priority: number; status: string;
  assignee?: string; createdAt: string; retries?: number; maxRetries?: number;
}
function readDevQueue(): DevQueueItem[] {
  const raw = safeJson<Record<string, DevQueueItem> | DevQueueItem[]>(join(JARVIS_HOME, 'state', 'dev-queue.json'));
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : Object.values(raw);
  return items.filter(i => i.status === 'pending').sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 8);
}

interface TeamInfo { merit: number; penalty: number; status: string; history?: { ts: string; decision: string; outcome: string }[] }
interface TeamScorecard { teams: Record<string, TeamInfo>; lastDecay?: string; thresholds?: Record<string, number> }
function readTeamScorecard(): TeamScorecard | null {
  return safeJson<TeamScorecard>(join(JARVIS_HOME, 'state', 'team-scorecard.json'));
}

// ── SVG 미니 바 차트 ──────────────────────────────────────────────────────────
function MiniBarChart({ data }: { data: CronDaily[] }) {
  const maxVal = Math.max(...data.map(d => d.ok + d.fail), 1);
  const W = 560, H = 72, ML = 4, MR = 4, MT = 4, MB = 20;
  const CW = W - ML - MR, CH = H - MT - MB;
  const gap = CW / data.length, bw = Math.max(4, gap * 0.7);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {data.map((d, i) => {
        const cx = ML + i * gap + gap / 2;
        const aH = Math.max(2, (d.ok / maxVal) * CH);
        const bH = Math.max(0, (d.fail / maxVal) * CH);
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={MT + CH - aH - bH} width={bw} height={aH} fill="#818cf8" rx="2" opacity="0.85" />
            {bH > 0 && <rect x={cx - bw / 2} y={MT + CH - bH} width={bw} height={bH} fill="#f87171" rx="2" opacity="0.9" />}
            <text x={cx} y={H - 2} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.date.slice(5)}</text>
          </g>
        );
      })}
      <line x1={ML} y1={MT + CH} x2={W - MR} y2={MT + CH} stroke="#e4e4e7" strokeWidth="1" />
    </svg>
  );
}

// ── 팀 색상 ──────────────────────────────────────────────────────────────────
const TEAM_LABEL: Record<string, string> = {
  infra: '인프라', council: '이사회', record: '기록', career: '커리어',
  brand: '브랜드', academy: '아카데미', strategy: '전략',
};
const TEAM_COLOR: Record<string, string> = {
  infra: 'bg-blue-100 text-blue-700', council: 'bg-purple-100 text-purple-700',
  record: 'bg-zinc-100 text-zinc-600', career: 'bg-amber-100 text-amber-700',
  brand: 'bg-pink-100 text-pink-700', academy: 'bg-emerald-100 text-emerald-700',
  strategy: 'bg-indigo-100 text-indigo-700',
};

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default async function JarvisDashboardPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPw = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPw && session && session === makeToken(ownerPw));
  if (!isOwner) redirect('/login');

  const isLocalEnv = existsSync(join(JARVIS_HOME, 'state', 'health.json'));

  // ── Railway 환경: board_settings에서 Mac mini 메트릭 읽기 ──
  let remoteMetrics: {
    disk?: { used_pct: number; free_gb: number; total_gb: number };
    scorecard?: TeamScorecard;
    health?: { discord_bot: string; memory_mb: number; crash_count: number; last_check?: string; stale_claude_killed?: number };
    cron_stats?: { rate: number; ok7: number; fail7: number; total7: number; daily: CronDaily[]; topErrors: { task: string; count: number; lastAt: string; type?: string }[]; recentFailed: { task: string; lastRun: string; lastStatus: string; failCount: number; failType?: string }[] };
    discord_stats?: { claudeCount: number; avgElapsed: number; p95Elapsed: number; stopReasons: Record<string, number>; lastHealth: BotHealth | null; restartCount: number; botErrors: number; totalHuman: number; channelActivity: { id: string; name: string; human: number; bot: number; claudes: number; totalElapsed: number }[] };
    rag_stats?: { dbSize: string; inboxCount: number; stuck: boolean; lastLine: string; chunks: number; rebuilding: RagRebuilding | null };
    launch_agents?: LaunchEntry[];
    circuit_breakers?: CircuitEntry[];
    decisions_today?: Decision[];
    dev_queue?: DevQueueItem[];
    synced_at?: string;
  } | null = null;
  if (!isLocalEnv) {
    try {
      const _db = getDb();
      const _row = _db.prepare("SELECT value FROM board_settings WHERE key='system_metrics'").get() as { value: string } | undefined;
      if (_row) remoteMetrics = JSON.parse(_row.value);
    } catch { /* DB 미접근 시 무시 */ }
  }

  // ── 데이터 수집 — Railway에서는 remoteMetrics 우선, 로컬에서는 파일 직접 읽기 ──
  const [launchAgentsLocal] = await Promise.all([isLocalEnv ? readLaunchAgents() : Promise.resolve([] as LaunchEntry[])]);
  const launchAgents: LaunchEntry[] = isLocalEnv ? launchAgentsLocal : (remoteMetrics?.launch_agents ?? []);

  const healthLocal = isLocalEnv ? safeJson<{
    last_check: string; discord_bot: string; memory_mb: number;
    crash_count: number; stale_claude_killed: number;
  }>(join(JARVIS_HOME, 'state', 'health.json')) : null;
  const health = healthLocal ?? (remoteMetrics?.health ? {
    last_check: remoteMetrics.health.last_check ?? '',
    discord_bot: remoteMetrics.health.discord_bot,
    memory_mb: remoteMetrics.health.memory_mb,
    crash_count: remoteMetrics.health.crash_count,
    stale_claude_killed: remoteMetrics.health.stale_claude_killed ?? 0,
  } : null);

  const errorTracker = isLocalEnv ? safeJson<{
    errors: { channelId: string; errorMessage: string; timestamp: number }[];
  }>(join(JARVIS_HOME, 'state', 'error-tracker.json')) : null;

  const ragRebuilding = isLocalEnv ? readRagRebuilding() : (remoteMetrics?.rag_stats?.rebuilding ?? null);
  const ragStatusLocal = isLocalEnv ? detectRagStuck() : null;
  const ragStatus = ragStatusLocal ?? {
    stuck: remoteMetrics?.rag_stats?.stuck ?? false,
    pidCycling: 0,
    lastLine: remoteMetrics?.rag_stats?.lastLine ?? '',
  };

  const circuitBreakers = isLocalEnv ? readCircuitBreakers() : (remoteMetrics?.circuit_breakers ?? []);

  // ── 크론 통계 ──
  let cronDaily: CronDaily[], cronErrors: { task: string; count: number; lastAt: string; type?: string }[], cronToday: { task: string; ok: number; fail: number; total: number }[], cronRecentFailed: { task: string; lastRun: string; lastStatus: string; failCount: number; failType?: string }[];
  if (isLocalEnv) {
    const parsed = parseCronLog();
    cronDaily = parsed.daily; cronErrors = parsed.topErrors; cronToday = parsed.topToday; cronRecentFailed = parsed.recentFailed;
  } else {
    const r = remoteMetrics?.cron_stats;
    cronDaily = r?.daily ?? Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { date: d.toISOString().slice(0, 10), ok: 0, fail: 0 }; });
    cronErrors = r?.topErrors ?? [];
    cronToday = [];
    cronRecentFailed = r?.recentFailed ?? [];
  }

  // ── Discord 통계 ──
  let channelActivity: ReturnType<typeof parseDiscordJsonl>['channelActivity'];
  let claudeCount: number, avgElapsed: number, p95Elapsed: number;
  let stopReasons: Record<string, number>, lastHealth: BotHealth | null;
  let restartCount: number, botErrors: number, totalHuman: number;
  if (isLocalEnv) {
    const parsed = parseDiscordJsonl();
    channelActivity = parsed.channelActivity; claudeCount = parsed.claudeCount; avgElapsed = parsed.avgElapsed;
    p95Elapsed = parsed.p95Elapsed; stopReasons = parsed.stopReasons; lastHealth = parsed.lastHealth;
    restartCount = parsed.restartCount; botErrors = parsed.botErrors; totalHuman = parsed.totalHuman;
  } else {
    const r = remoteMetrics?.discord_stats;
    channelActivity = {};
    (r?.channelActivity ?? []).forEach(ch => { channelActivity[ch.id] = { human: ch.human, bot: ch.bot, claudes: ch.claudes, totalElapsed: ch.totalElapsed }; });
    claudeCount = r?.claudeCount ?? 0; avgElapsed = r?.avgElapsed ?? 0; p95Elapsed = r?.p95Elapsed ?? 0;
    stopReasons = r?.stopReasons ?? {}; lastHealth = r?.lastHealth ?? null;
    restartCount = r?.restartCount ?? 0; botErrors = r?.botErrors ?? 0; totalHuman = r?.totalHuman ?? 0;
  }

  const todayDecisions = isLocalEnv ? readTodayDecisions() : (remoteMetrics?.decisions_today ?? []);
  const devQueue = isLocalEnv ? readDevQueue() : (remoteMetrics?.dev_queue ?? []);
  const scorecard = readTeamScorecard() ?? remoteMetrics?.scorecard ?? null;

  // ── 시스템 리소스 ──
  let diskPct = 0, diskFree = '?', diskTotal = '?';
  let ragDbSize = '?', ragInboxCount = 0, ragChunks = 0;
  if (!isLocalEnv && remoteMetrics?.disk) {
    diskPct = remoteMetrics.disk.used_pct;
    diskFree = `${remoteMetrics.disk.free_gb} GB`;
    diskTotal = `${remoteMetrics.disk.total_gb} GB`;
  }
  if (!isLocalEnv && remoteMetrics?.rag_stats) {
    ragDbSize = remoteMetrics.rag_stats.dbSize;
    ragInboxCount = remoteMetrics.rag_stats.inboxCount;
    ragChunks = remoteMetrics.rag_stats.chunks;
  }
  try {
    const { execSync } = await import('child_process');
    if (isLocalEnv) {
      const df = execSync('df -h / | tail -1', { timeout: 2000 }).toString().trim().split(/\s+/);
      diskPct = parseInt(df[4] ?? '0', 10);
      diskFree = df[3] ?? '?';
      diskTotal = df[1] ?? '?';
      ragDbSize = execSync(`du -sh "${join(JARVIS_HOME, 'rag', 'lancedb')}" 2>/dev/null | cut -f1`, { timeout: 2000 }).toString().trim() || '?';
      ragInboxCount = parseInt(execSync(`ls "${join(JARVIS_HOME, 'inbox')}" 2>/dev/null | wc -l`, { timeout: 2000 }).toString().trim(), 10) || 0;
      const ragLogLines = safeLines(join(JARVIS_HOME, 'logs', 'rag-index.log'));
      let rebuildStart = -1;
      for (let i = ragLogLines.length - 1; i >= 0; i--) {
        if (ragLogLines[i].includes('Fresh rebuild')) { rebuildStart = i; break; }
      }
      if (rebuildStart >= 0) {
        for (let i = rebuildStart; i < ragLogLines.length; i++) {
          const m = ragLogLines[i].match(/Batch add: (\d+) chunks/);
          if (m) ragChunks += parseInt(m[1], 10);
        }
      }
    }
  } catch { /* 무시 */ }

  // ── 집계 ──
  const cronOk7 = remoteMetrics?.cron_stats?.ok7 ?? cronDaily.reduce((s, d) => s + d.ok, 0);
  const cronFail7 = remoteMetrics?.cron_stats?.fail7 ?? cronDaily.reduce((s, d) => s + d.fail, 0);
  const cronTotal7 = cronOk7 + cronFail7;
  const cronRate = remoteMetrics?.cron_stats?.rate ?? (cronTotal7 > 0 ? Math.round((cronOk7 / cronTotal7) * 100) : 0);

  const hasAlerts = circuitBreakers.length > 0 || ragStatus.stuck;
  const ragLastTs = ragStatus.lastLine.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)?.[1]?.replace('T', ' ');
  const badAgents = launchAgents.filter(
    a => a.loaded && a.pid === null && a.exitCode !== null && a.exitCode !== 0 && a.exitCode !== -15
  );

  const channelActivitySorted = Object.entries(channelActivity)
    .map(([id, v]) => ({ id, name: CH[id] ?? `…${id.slice(-5)}`, ...v }))
    .filter(ch => ch.human + ch.bot + ch.claudes > 0)
    .sort((a, b) => (b.human + b.claudes) - (a.human + a.claudes));

  const discordErrByType: Record<string, number> = {};
  for (const e of errorTracker?.errors ?? []) {
    discordErrByType[e.errorMessage] = (discordErrByType[e.errorMessage] ?? 0) + 1;
  }
  const topDiscordErrors = Object.entries(discordErrByType).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const unmatchedDecisions = todayDecisions.filter(d => d.action === 'UNMATCHED' || d.result === 'NEEDS_MANUAL_REVIEW');
  const confirmedDecisions = todayDecisions.filter(d => d.status === 'confirmed' || (!d.action && !d.result));

  const uptimeH = Math.floor((lastHealth?.uptimeSec ?? 0) / 3600);
  const uptimeM = Math.floor(((lastHealth?.uptimeSec ?? 0) % 3600) / 60);
  const silenceSec = lastHealth?.silenceSec ?? 0;
  const ragRebuildElapsedMin = ragRebuilding
    ? Math.round((Date.now() - new Date(ragRebuilding.started_at).getTime()) / 60000)
    : 0;
  const now = new Date().toLocaleString('ko-KR');

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-zinc-600 text-sm">← 보드</Link>
            <span className="text-zinc-200">|</span>
            <h1 className="font-bold text-zinc-800 text-base flex items-center gap-2">
              🛸 Jarvis 시스템 대시보드
              {(hasAlerts || badAgents.length > 0) && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  ⚠ 알림 {circuitBreakers.length + (ragStatus.stuck ? 1 : 0) + badAgents.length}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 hidden sm:block">갱신: {now}</span>
            <RefreshButton interval={30} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 pb-24 space-y-5 md:pb-5">

        {/* Railway 안내 */}
        {!isLocalEnv && (
          <div className="flex items-center gap-3 bg-zinc-100 border border-zinc-300 rounded-xl px-4 py-3 text-sm text-zinc-600">
            <span className="text-lg">🌐</span>
            <span>
              <span className="font-semibold">Railway 배포 환경</span>
              {' '}— Mac mini 동기화 데이터 사용 중.{remoteMetrics?.synced_at ? ` 마지막 동기화: ${remoteMetrics.synced_at.replace('T', ' ').slice(0, 16)} UTC` : ' 동기화 대기 중 (첫 sync 5분 이내).'}
            </span>
          </div>
        )}

        {/* ── 경보 배너 ── */}
        {(hasAlerts || badAgents.length > 0 || unmatchedDecisions.length > 0) && (
          <section className="space-y-2">
            {ragStatus.stuck && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="text-red-500 text-lg mt-0.5">🔴</span>
                <div>
                  <div className="text-sm font-semibold text-red-700">RAG 인덱싱 STUCK</div>
                  <div className="text-xs text-red-600 mt-0.5">
                    {ragStatus.pidCycling}개 PID 사이클링 · 마지막: {ragLastTs ?? '?'} ·{' '}
                    <code className="bg-red-100 px-1 rounded">pkill -f rag-index</code> 후 재시작
                  </div>
                </div>
              </div>
            )}
            {circuitBreakers.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-500">⚡</span>
                  <span className="text-sm font-semibold text-amber-800">서킷브레이커 OPEN — {circuitBreakers.length}개 태스크</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {circuitBreakers.map(cb => (
                    <div key={cb.task_id} className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-mono font-medium text-amber-800">{cb.task_id}</span>
                      <span className="text-amber-500 ml-2">
                        {cb.consecutive_fails}회 실패 ·{' '}
                        {new Date(cb.last_fail_ts * 1000).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {badAgents.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>🛑</span>
                  <span className="text-sm font-semibold text-red-800">LaunchAgent 비정상 종료 — {badAgents.length}개</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {badAgents.map(a => (
                    <span key={a.name} className="bg-white border border-red-200 rounded px-2 py-1 text-xs font-mono text-red-700">
                      {a.name.replace('ai.jarvis.', '')} (exit {a.exitCode})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {unmatchedDecisions.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-orange-500">🔁</span>
                  <span className="text-sm font-semibold text-orange-800">수동 처리 필요 — {unmatchedDecisions.length}건 UNMATCHED</span>
                </div>
                <div className="space-y-1">
                  {unmatchedDecisions.map((d, i) => (
                    <div key={i} className="text-xs text-orange-700 bg-white border border-orange-100 rounded px-3 py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium mr-2 ${TEAM_COLOR[d.team] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        {TEAM_LABEL[d.team] ?? d.team}
                      </span>
                      {d.decision}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── 1. 봇 바이탈 사인 (6개 카드) ── */}
        <section>
          <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">봇 바이탈 사인</h2>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">Discord 봇</div>
              <div className={`text-base font-bold leading-tight ${!isLocalEnv ? 'text-zinc-400' : health?.discord_bot === 'healthy' ? 'text-emerald-600' : 'text-red-600'}`}>
                {!isLocalEnv ? '—' : health?.discord_bot === 'healthy' ? '✅ 정상' : '❌ 오프라인'}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                {isLocalEnv ? `크래시 ${health?.crash_count ?? 0}회` : '로컬 전용'}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">업타임</div>
              <div className="text-base font-bold text-zinc-800 leading-tight">
                {lastHealth ? `${uptimeH}h ${uptimeM}m` : '—'}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">재시작 {restartCount}회</div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">WS 핑 / 무음</div>
              <div className={`text-base font-bold leading-tight ${!lastHealth ? 'text-zinc-400' : lastHealth.wsPing > 500 ? 'text-red-600' : lastHealth.wsPing > 200 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {lastHealth ? `${lastHealth.wsPing}ms` : '—'}
              </div>
              <div className={`text-[10px] mt-1 ${silenceSec > 300 ? 'text-amber-500 font-medium' : 'text-zinc-400'}`}>
                무음 {silenceSec}s
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">봇 메모리</div>
              <div className={`text-base font-bold leading-tight ${!lastHealth ? 'text-zinc-400' : lastHealth.memMB > 500 ? 'text-red-600' : lastHealth.memMB > 300 ? 'text-amber-600' : 'text-zinc-800'}`}>
                {lastHealth ? `${lastHealth.memMB}MB` : '—'}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">에러 로그 {botErrors}건</div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">크론 성공률</div>
              <div className={`text-base font-bold leading-tight ${cronRate >= 90 ? 'text-emerald-600' : cronRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                {cronRate}%
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">✅{cronOk7} ❌{cronFail7} (7일)</div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5">
              <div className="text-[10px] text-zinc-400 mb-1">디스크 잔여</div>
              <div className={`text-base font-bold leading-tight ${diskPct > 90 ? 'text-red-600' : diskPct > 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {diskFree}
              </div>
              <div className="mt-1.5 h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${diskPct}%`, backgroundColor: diskPct > 90 ? '#dc2626' : diskPct > 75 ? '#d97706' : '#16a34a' }} />
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">{diskPct}% / {diskTotal}</div>
            </div>
          </div>
        </section>

        {/* ── 2. 오늘의 채널 활동 + Claude 응답 성능 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-zinc-800">📡 오늘의 채널 활동</h2>
              <span className="text-xs text-zinc-400">총 수신 {totalHuman}건</span>
            </div>
            {channelActivitySorted.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-100">
                    <th className="text-left pb-2 font-medium">채널</th>
                    <th className="text-right pb-2 font-medium">사람</th>
                    <th className="text-right pb-2 font-medium">Claude</th>
                    <th className="text-right pb-2 font-medium">평균응답</th>
                  </tr>
                </thead>
                <tbody>
                  {channelActivitySorted.map(ch => (
                    <tr key={ch.id} className="border-b border-zinc-50 last:border-0">
                      <td className="py-1.5 font-mono text-zinc-600 truncate max-w-[120px]">{ch.name}</td>
                      <td className="py-1.5 text-right text-zinc-700">{ch.human > 0 ? ch.human : '—'}</td>
                      <td className="py-1.5 text-right text-indigo-600 font-medium">{ch.claudes > 0 ? ch.claudes : '—'}</td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {ch.claudes > 0 ? `${Math.round(ch.totalElapsed / ch.claudes)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-zinc-400">오늘 활동 없음 (또는 로컬 전용)</div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-zinc-800">🤖 Claude 응답 성능</h2>
              <span className="text-xs text-zinc-400">오늘 {claudeCount}건</span>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">평균 응답시간</div>
                  <div className={`text-2xl font-bold ${avgElapsed > 300 ? 'text-red-600' : avgElapsed > 120 ? 'text-amber-600' : 'text-zinc-800'}`}>
                    {claudeCount > 0 ? `${avgElapsed}s` : '—'}
                  </div>
                </div>
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">P95 응답시간</div>
                  <div className={`text-2xl font-bold ${p95Elapsed > 400 ? 'text-red-600' : p95Elapsed > 200 ? 'text-amber-600' : 'text-zinc-800'}`}>
                    {claudeCount > 0 ? `${p95Elapsed}s` : '—'}
                  </div>
                </div>
              </div>
              {claudeCount > 0 && Object.entries(stopReasons).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide">종료 이유</div>
                  {Object.entries(stopReasons).sort((a, b) => b[1] - a[1]).map(([reason, cnt]) => (
                    <div key={reason} className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        reason === 'end_turn' ? 'bg-emerald-50 text-emerald-700' :
                        reason === 'max_tokens' ? 'bg-red-50 text-red-700' :
                        'bg-zinc-50 text-zinc-600'
                      }`}>{reason}</span>
                      <div className="flex-1 h-1.5 bg-zinc-100 rounded overflow-hidden">
                        <div className="h-full bg-indigo-300 rounded" style={{ width: `${(cnt / claudeCount) * 100}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500 shrink-0">{cnt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. 크론 7일 현황 + 에러 상세 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-800">⚙️ 크론 7일 현황</h2>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-400" />성공</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-400" />실패</span>
              </div>
            </div>
            <MiniBarChart data={cronDaily} />
            {cronToday.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-2">오늘 실행 TOP</div>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {cronToday.map(t => (
                    <div key={t.task} className="flex items-center justify-between text-xs py-1 border-b border-zinc-50">
                      <span className="font-mono text-zinc-600 truncate max-w-[55%]">{t.task}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-600">✅{t.ok}</span>
                        {t.fail > 0 && <span className="text-red-500 font-semibold">❌{t.fail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <h2 className="font-semibold text-zinc-800">❌ 크론 에러 현황</h2>
            {cronRecentFailed.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-2">현재 실패 상태 태스크</div>
                <div className="space-y-1.5">
                  {cronRecentFailed.map(t => (
                    <div key={t.task} className="flex items-center justify-between py-1.5 border-b border-zinc-50 text-xs">
                      <span className="font-mono text-zinc-700 truncate max-w-[50%]">{t.task}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.failType && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono">{t.failType}</span>
                        )}
                        <span className="text-zinc-400">{t.lastRun?.slice(5, 16) ?? ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cronErrors.length > 0 ? (
              <div>
                <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-2">7일 누적 실패 TOP</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {cronErrors.map(e => (
                    <div key={e.task} className="flex items-center justify-between text-xs py-1 border-b border-zinc-50">
                      <span className="font-mono text-zinc-600 truncate max-w-[50%]">{e.task}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] bg-zinc-50 text-zinc-500 px-1.5 py-0.5 rounded font-mono">{e.type}</span>
                        <span className="font-bold text-red-500">{e.count}회</span>
                        <span className="text-zinc-400">{e.lastAt?.slice(5, 16) ?? ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-emerald-600">✅ 최근 7일 에러 없음</div>
            )}
          </div>
        </div>

        {/* ── 4. RAG 시스템 + LaunchAgent ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h2 className="font-semibold text-zinc-800 mb-4">🧠 RAG 시스템</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-zinc-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-zinc-400 mb-1">청크 수</div>
                <div className="text-xl font-bold text-zinc-800">
                  {ragChunks > 0 ? (ragChunks >= 1000 ? `${(ragChunks / 1000).toFixed(0)}K` : ragChunks) : '—'}
                </div>
              </div>
              <div className="bg-zinc-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-zinc-400 mb-1">DB 크기</div>
                <div className="text-xl font-bold text-zinc-800">{ragDbSize}</div>
              </div>
              <div className="bg-zinc-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-zinc-400 mb-1">인박스</div>
                <div className="text-xl font-bold text-zinc-800">
                  {ragInboxCount > 0 ? (ragInboxCount >= 1000 ? `${(ragInboxCount / 1000).toFixed(0)}K` : ragInboxCount) : '—'}
                </div>
              </div>
            </div>
            {ragRebuilding ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <div className="text-xs font-semibold text-amber-800 mb-1">🔄 Fresh Rebuild 진행 중</div>
                <div className="text-xs text-amber-700">
                  PID {ragRebuilding.pid} ·{' '}
                  시작 {new Date(ragRebuilding.started_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {ragRebuildElapsedMin}분 경과
                </div>
              </div>
            ) : ragStatus.stuck ? (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                ⚠ 인덱싱 STUCK —{' '}
                <code className="bg-red-100 px-1 rounded">pkill -f rag-index</code>
              </div>
            ) : (
              <div className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">✅ 인덱싱 정상</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h2 className="font-semibold text-zinc-800 mb-4">🚀 LaunchAgent 상태</h2>
            <div className="space-y-1.5">
              {launchAgents.map(a => {
                const short = a.name.replace('ai.jarvis.', '');
                const running = a.loaded && a.pid !== null;
                const isBad = a.loaded && !running && a.exitCode !== null && a.exitCode !== 0 && a.exitCode !== -15;
                const isRestarting = a.loaded && !running && a.exitCode === -15;
                return (
                  <div key={a.name} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-50 last:border-0">
                    <span className={`font-mono ${isBad ? 'text-red-700 font-semibold' : 'text-zinc-700'}`}>{short}</span>
                    <div className="flex items-center gap-2">
                      {a.pid && <span className="text-zinc-400 text-[10px]">PID {a.pid}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        !a.loaded ? 'bg-zinc-100 text-zinc-400' :
                        isBad ? 'bg-red-100 text-red-700' :
                        isRestarting ? 'bg-amber-100 text-amber-700' :
                        running ? 'bg-emerald-100 text-emerald-700' :
                        'bg-zinc-100 text-zinc-500'
                      }`}>
                        {!a.loaded ? '미등록' :
                          isBad ? `exit ${a.exitCode}` :
                          isRestarting ? '재시작 중' :
                          running ? '실행 중' : '정지'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 5. Discord 에러 + 오늘의 의사결정 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-800">⚠️ Discord 에러 현황</h2>
              <span className="text-xs text-zinc-400">누적 {errorTracker?.errors?.length ?? 0}건</span>
            </div>
            {topDiscordErrors.length > 0 ? (
              <div className="space-y-2">
                {topDiscordErrors.map(([msg, cnt]) => {
                  const maxCnt = topDiscordErrors[0]?.[1] ?? 1;
                  return (
                    <div key={msg} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-600 truncate max-w-[78%]">{msg}</span>
                        <span className="font-bold text-red-500 shrink-0 ml-1">{cnt}회</span>
                      </div>
                      <div className="h-1 bg-zinc-100 rounded overflow-hidden">
                        <div className="h-full bg-red-300 rounded" style={{ width: `${(cnt / maxCnt) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(errorTracker?.errors?.length ?? 0) > 0 && (
                  <div className="text-xs text-zinc-400 pt-1">
                    최근: {new Date(errorTracker!.errors.at(-1)!.timestamp).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-emerald-600">✅ Discord 에러 없음</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-800">📋 오늘의 팀 의사결정</h2>
              <span className="text-xs text-zinc-400">{confirmedDecisions.length}건</span>
            </div>
            {confirmedDecisions.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto">
                {confirmedDecisions.map((d, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-zinc-50 last:border-0">
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium self-start mt-0.5 ${TEAM_COLOR[d.team] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {TEAM_LABEL[d.team] ?? d.team}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-700 leading-snug">{d.decision}</p>
                      {d.rationale && <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{d.rationale}</p>}
                    </div>
                    {d.okr && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-mono self-start mt-0.5">
                        {d.okr}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">오늘 의사결정 기록 없음</div>
            )}
          </div>
        </div>

        {/* ── 6. 자율 작업 큐 + 팀 스코어카드 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-800">🤖 자율 작업 큐</h2>
              <span className="text-xs text-zinc-400">{devQueue.length}건 대기</span>
            </div>
            {devQueue.length > 0 ? (
              <div className="space-y-2.5">
                {devQueue.map(item => (
                  <div key={item.id} className="flex gap-3 py-2 border-b border-zinc-50 last:border-0">
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold self-start mt-0.5 ${
                      (item.priority ?? 0) >= 10 ? 'bg-red-50 text-red-600' :
                      (item.priority ?? 0) >= 5  ? 'bg-amber-50 text-amber-600' :
                      'bg-zinc-50 text-zinc-500'
                    }`}>P{item.priority ?? 0}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-700 line-clamp-2 leading-snug">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {item.assignee && <span className="text-[10px] text-zinc-400">{item.assignee}</span>}
                        {(item.retries ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-500">재시도 {item.retries}/{item.maxRetries}</span>
                        )}
                        <span className="text-[10px] text-zinc-300 ml-auto">{item.createdAt?.slice(0, 10) ?? ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">대기 중인 작업 없음</div>
            )}
          </div>

          {scorecard?.teams ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-zinc-800">🏆 팀 스코어카드</h2>
                <div className="flex items-center gap-3">
                  {scorecard.lastDecay && (
                    <span className="text-[10px] text-zinc-400">마지막 감소: {scorecard.lastDecay.slice(0, 10)}</span>
                  )}
                  <span className="text-[10px] text-zinc-400">{Object.keys(scorecard.teams).length}개 팀</span>
                </div>
              </div>
              <div className="space-y-3">
                {Object.entries(scorecard.teams).map(([teamId, info]) => {
                  const netScore = info.merit - info.penalty;
                  const statusStyle =
                    info.status === 'NORMAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    info.status === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    info.status === 'PROBATION' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    'bg-red-50 text-red-700 border-red-200';
                  const recentHistory = (info.history ?? []).slice(-8);
                  const lastSuccess = [...(info.history ?? [])].reverse().find(h => h.outcome === 'success');
                  return (
                    <div key={teamId} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TEAM_COLOR[teamId] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {TEAM_LABEL[teamId] ?? teamId}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${statusStyle}`}>
                          {info.status}
                        </span>
                        <div className="flex-1" />
                        <span className="text-[10px] text-emerald-600 font-medium">+{info.merit}</span>
                        <span className="text-[10px] text-zinc-400">/</span>
                        <span className="text-[10px] text-red-500 font-medium">-{info.penalty}</span>
                        <span className={`text-xs font-bold ml-1 ${netScore >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          ({netScore >= 0 ? '+' : ''}{netScore})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mb-1.5">
                        {recentHistory.map((h, i) => (
                          <span key={i} title={`${h.ts?.slice(0, 10) ?? ''}: ${h.decision?.slice(0, 60) ?? ''}`}
                            className={`inline-block w-2.5 h-2.5 rounded-full ${
                              h.outcome === 'success' ? 'bg-emerald-400' :
                              h.outcome === 'skipped' ? 'bg-zinc-300' : 'bg-red-400'
                            }`} />
                        ))}
                        {recentHistory.length === 0 && <span className="text-[10px] text-zinc-300">기록 없음</span>}
                      </div>
                      {lastSuccess && (
                        <div className="text-[10px] text-zinc-400 truncate">
                          ✓ {lastSuccess.ts?.slice(0, 10) ?? ''} — {lastSuccess.decision?.slice(0, 60) ?? ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {scorecard.thresholds && (
                <div className="text-[10px] text-zinc-400 mt-3 flex gap-3">
                  <span>경고: ≥{scorecard.thresholds.warning}점</span>
                  <span>보호관찰: ≥{scorecard.thresholds.probation}점</span>
                  {scorecard.thresholds.disciplinary && <span>징계: ≥{scorecard.thresholds.disciplinary}점</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 p-5 flex items-center justify-center text-sm text-zinc-400">
              팀 스코어카드 없음 {!isLocalEnv && remoteMetrics === null && '(동기화 대기 중)'}
            </div>
          )}
        </div>

      </main>
      <MobileBottomNav isOwner={isOwner} />
    </div>
  );
}
