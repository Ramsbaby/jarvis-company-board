export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import { getDiscussionWindow } from '@/lib/constants';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const JARVIS_HOME = process.env.JARVIS_HOME || join(process.env.HOME || '/Users/ramsbaby', '.jarvis');

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch { return fallback; }
}

function readTextFile(path: string): string {
  try {
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8');
  } catch { return ''; }
}

/** Parse cron.log for today's stats + 7-day trend */
function parseCronStats() {
  const logPath = join(JARVIS_HOME, 'logs', 'cron.log');
  const content = readTextFile(logPath);
  if (!content) return { todaySuccess: 0, todayFail: 0, todayTotal: 0, successRate: 100, recentFailures: [] as string[], trend: [] as Array<{ date: string; ok: number; fail: number }> };

  const lines = content.split('\n');
  const today = new Date().toISOString().slice(0, 10);
  const dayCounters: Record<string, { ok: number; fail: number }> = {};

  // Initialize 7-day buckets
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dayCounters[dateStr] = { ok: 0, fail: 0 };
  }

  const recentFailures: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d{4}-\d{2}-\d{2})\s/);
    if (!match) continue;
    const date = match[1];
    if (!dayCounters[date]) continue;

    if (/SUCCESS|DONE/.test(line)) {
      dayCounters[date].ok++;
    } else if (/FAIL|ERROR|ALERT/.test(line)) {
      dayCounters[date].fail++;
      if (date === today && recentFailures.length < 5) {
        const taskMatch = line.match(/\[([^\]]+)\]\s+(FAIL|ERROR|ALERT)/);
        if (taskMatch) recentFailures.push(`${taskMatch[1]}: ${taskMatch[2]}`);
      }
    }
  }

  const todayStats = dayCounters[today] || { ok: 0, fail: 0 };
  const todayTotal = todayStats.ok + todayStats.fail;

  return {
    todaySuccess: todayStats.ok,
    todayFail: todayStats.fail,
    todayTotal,
    successRate: todayTotal > 0 ? Math.round((todayStats.ok / todayTotal) * 100) : 100,
    recentFailures,
    trend: Object.entries(dayCounters).map(([date, v]) => ({ date, ok: v.ok, fail: v.fail })),
  };
}

/** Parse rate-tracker.json for Claude usage */
function parseClaudeUsage() {
  const data = readJsonFile<number[]>(join(JARVIS_HOME, 'state', 'rate-tracker.json'), []);
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCalls = data.filter(ts => ts >= todayStart).length;
  const lastHourCalls = data.filter(ts => ts >= now - 3600000).length;

  // Hourly distribution for today
  const hourly = new Array(24).fill(0);
  for (const ts of data) {
    if (ts >= todayStart) {
      const h = new Date(ts).getHours();
      hourly[h]++;
    }
  }

  return { todayCalls, lastHourCalls, totalTracked: data.length, hourly };
}

/** Parse e2e-cron.log for latest test results */
function parseE2EResults() {
  const logPath = join(JARVIS_HOME, 'logs', 'e2e-cron.log');
  const content = readTextFile(logPath);
  if (!content) return { passed: 0, total: 0, rate: 0, lastRun: '', failures: [] as string[] };

  const lines = content.split('\n').reverse();
  let passed = 0, total = 0, lastRun = '';
  const failures: string[] = [];

  for (const line of lines) {
    const resultMatch = line.match(/RESULT:\s*(\d+)\/(\d+)\s*passed/);
    if (resultMatch && !lastRun) {
      passed = parseInt(resultMatch[1]);
      total = parseInt(resultMatch[2]);
      const timeMatch = line.match(/^\[([^\]]+)\]/);
      if (timeMatch) lastRun = timeMatch[1];
    }
    const failMatch = line.match(/FAIL[ED]*.*?:\s*(.+)/);
    if (failMatch && failures.length < 5) {
      failures.push(failMatch[1].trim().slice(0, 80));
    }
    if (lastRun && failures.length >= 3) break;
  }

  return { passed, total, rate: total > 0 ? Math.round((passed / total) * 100) : 0, lastRun, failures };
}

/** Parse error-tracker.json for recent 24h errors */
function parseErrors() {
  const data = readJsonFile<Array<{ errorMessage: string; timestamp: string }>>(
    join(JARVIS_HOME, 'state', 'error-tracker.json'), []
  );
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const recent = data.filter(e => e.timestamp > cutoff);

  // Top error types
  const typeCounts: Record<string, number> = {};
  for (const e of recent) {
    const key = (e.errorMessage || 'unknown').slice(0, 50);
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  }
  const topErrors = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([msg, count]) => ({ msg, count }));

  return { total24h: recent.length, totalAll: data.length, topErrors };
}

export async function GET(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();

  // ── 0. sysMetrics — 풍부한 캐시(discord_stats 등) + 실시간 overlay 병합 ──
  // fullMetrics: 5분 캐시 (discord_stats, decisions_today, dev_queue, scorecard 포함)
  let fullMetrics: Record<string, unknown> | null = null;
  const smRow = db.prepare("SELECT value FROM board_settings WHERE key = 'system_metrics'").get() as { value: string } | undefined;
  if (smRow?.value) { try { fullMetrics = JSON.parse(smRow.value); } catch { /* ignore */ } }

  // realtimeMetrics: Mac Mini 실시간 (disk/health/cron/CB/LA 최신값)
  let realtimeMetrics: Record<string, unknown> | null = null;
  const metricsUrlRow = db.prepare("SELECT value FROM board_settings WHERE key = 'board_metrics_url'").get() as { value: string } | undefined;
  if (metricsUrlRow?.value) {
    try {
      const agentKey = process.env.AGENT_API_KEY ?? '';
      const res = await fetch(metricsUrlRow.value, {
        headers: { 'x-agent-key': agentKey },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) realtimeMetrics = await res.json() as Record<string, unknown>;
    } catch { /* Mac Mini 오프라인 or 재시작 중 */ }
  }

  // 병합: 기본은 fullMetrics(풍부), 실시간 있으면 critical 필드 덮어쓰기
  let sysMetrics: Record<string, unknown> | null = fullMetrics ?? realtimeMetrics ?? null;
  if (sysMetrics && realtimeMetrics && fullMetrics) {
    sysMetrics = {
      ...fullMetrics,
      disk: realtimeMetrics.disk ?? fullMetrics.disk,
      health: realtimeMetrics.health ?? fullMetrics.health,
      cron_stats: realtimeMetrics.cron_stats ?? fullMetrics.cron_stats,
      launch_agents: realtimeMetrics.launch_agents ?? fullMetrics.launch_agents,
      circuit_breakers: realtimeMetrics.circuit_breakers ?? fullMetrics.circuit_breakers,
      synced_at: realtimeMetrics.synced_at,
    };
  }

  // sysMetrics가 null이거나 일부 필드가 없을 때 기본값 제공
  if (!sysMetrics) {
    sysMetrics = {
      synced_at: new Date().toISOString(),
      disk: { used_pct: 0, free_gb: 0, total_gb: 0 },
      health: { discord_bot: 'unknown', memory_mb: 0 },
      discord_stats: {
        claudeCount: 0,
        totalHuman: 0,
        avgElapsed: 0,
        restartCount: 0,
        botErrors: 0,
        lastHealth: { silenceSec: 0, memMB: 0 },
        channelActivity: []
      },
      rag_stats: { dbSize: 'N/A', stuck: false, inboxCount: 0, chunks: 0 },
      launch_agents: [],
      circuit_breakers: [],
      cron_stats: { rate: 100, recentFailed: [], taskStatus: {} },
      decisions_today: [],
      dev_queue: [],
      scorecard: { teams: {} }
    };
  } else {
    // sysMetrics가 있어도 개별 필드가 누락될 수 있으므로 방어적으로 처리
    // 특히 Railway 환경에서 일부 필드가 null일 수 있음
    const diskInfo = (sysMetrics.disk as Record<string, unknown>) || {};
    const healthInfo = (sysMetrics.health as Record<string, unknown>) || {};
    const discordStatsInfo = (sysMetrics.discord_stats as Record<string, unknown>) || {};
    const ragStatsInfo = (sysMetrics.rag_stats as Record<string, unknown>) || {};
    const cronStatsInfo = (sysMetrics.cron_stats as Record<string, unknown>) || {};

    sysMetrics = {
      synced_at: sysMetrics.synced_at || new Date().toISOString(),
      disk: {
        used_pct: diskInfo.used_pct ?? 0,
        free_gb: diskInfo.free_gb ?? 0,
        total_gb: diskInfo.total_gb ?? 0
      },
      health: {
        discord_bot: healthInfo.discord_bot || 'unknown',
        memory_mb: healthInfo.memory_mb ?? 0,
        crash_count: healthInfo.crash_count ?? 0,
        last_check: healthInfo.last_check || ''
      },
      discord_stats: {
        claudeCount: discordStatsInfo.claudeCount ?? 0,
        totalHuman: discordStatsInfo.totalHuman ?? 0,
        avgElapsed: discordStatsInfo.avgElapsed ?? 0,
        restartCount: discordStatsInfo.restartCount ?? 0,
        botErrors: discordStatsInfo.botErrors ?? 0,
        lastHealth: (() => {
          const lh = (discordStatsInfo.lastHealth as Record<string, unknown>) || {};
          return {
            silenceSec: (lh.silenceSec as number) ?? 0,
            memMB: (lh.memMB as number) ?? 0,
            wsPing: (lh.wsPing as number) ?? 0,
            uptimeSec: (lh.uptimeSec as number) ?? 0
          };
        })(),
        channelActivity: Array.isArray(discordStatsInfo.channelActivity) ? discordStatsInfo.channelActivity : []
      },
      rag_stats: {
        dbSize: ragStatsInfo.dbSize || 'N/A',
        stuck: ragStatsInfo.stuck ?? false,
        inboxCount: ragStatsInfo.inboxCount ?? 0,
        chunks: ragStatsInfo.chunks ?? 0
      },
      launch_agents: Array.isArray(sysMetrics.launch_agents) ? sysMetrics.launch_agents : [],
      circuit_breakers: Array.isArray(sysMetrics.circuit_breakers) ? sysMetrics.circuit_breakers : [],
      cron_stats: {
        rate: cronStatsInfo.rate ?? 100,
        recentFailed: Array.isArray(cronStatsInfo.recentFailed) ? cronStatsInfo.recentFailed : [],
        taskStatus: cronStatsInfo.taskStatus || {}
      },
      decisions_today: Array.isArray(sysMetrics.decisions_today) ? sysMetrics.decisions_today : [],
      dev_queue: Array.isArray(sysMetrics.dev_queue) ? sysMetrics.dev_queue : [],
      scorecard: sysMetrics.scorecard || { teams: {} },
      dev_daemon: sysMetrics.dev_daemon || null
    };
  }

  // ── 1. System health ──
  const health = readJsonFile<{
    discord_bot?: string; memory_mb?: number; crash_count?: number;
    stale_claude_killed?: number; last_check?: string;
  }>(join(JARVIS_HOME, 'state', 'health.json'), {});

  // ── 2. Cron pipeline ──
  const cron = parseCronStats();

  // ── 3. Claude usage ──
  const claude = parseClaudeUsage();

  // ── 4. Dev tasks summary ──
  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='awaiting_approval' THEN 1 ELSE 0 END) as awaiting,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='in-progress' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
      COUNT(DISTINCT group_id) as groups
    FROM dev_tasks
  `).get() as Record<string, number>;

  // ── 5. Board activity (7 days) — GROUP BY 방식 (/api/stats와 동일)
  const sinceDate = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const postsByDay = Object.fromEntries(
    (db.prepare("SELECT substr(created_at,1,10) as date, COUNT(*) as n FROM posts WHERE created_at >= ? GROUP BY date").all(sinceDate) as Array<{date:string;n:number}>)
      .map(r => [r.date, r.n])
  );
  const commentsByDay = Object.fromEntries(
    (db.prepare("SELECT substr(created_at,1,10) as date, COUNT(*) as n FROM comments WHERE created_at >= ? GROUP BY date").all(sinceDate) as Array<{date:string;n:number}>)
      .map(r => [r.date, r.n])
  );
  const recentDays: Array<{ date: string; posts: number; comments: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    recentDays.push({ date, posts: postsByDay[date] || 0, comments: commentsByDay[date] || 0 });
  }

  const boardStats = {
    totalPosts: (db.prepare('SELECT COUNT(*) as n FROM posts').get() as { n: number })?.n || 0,
    openPosts: (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='open'").get() as { n: number })?.n || 0,
    resolvedPosts: (db.prepare("SELECT COUNT(*) as n FROM posts WHERE status='resolved'").get() as { n: number })?.n || 0,
    totalComments: (db.prepare('SELECT COUNT(*) as n FROM comments').get() as { n: number })?.n || 0,
    recentDays,
  };

  // ── 6. Agent performance (top 5, 30d) ──
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const topAgents = db.prepare(`
    SELECT agent_id, ROUND(SUM(points), 1) as score, COUNT(*) as events
    FROM agent_scores WHERE scored_at >= ?
    GROUP BY agent_id ORDER BY score DESC LIMIT 5
  `).all(since30d) as Array<{ agent_id: string; score: number; events: number }>;

  const recentTierChanges = db.prepare(`
    SELECT agent_id, from_tier, to_tier, reason, created_at
    FROM tier_history ORDER BY created_at DESC LIMIT 5
  `).all() as Array<{ agent_id: string; from_tier: string; to_tier: string; reason: string | null; created_at: string }>;

  // ── 7. E2E test results ──
  const e2e = parseE2EResults();

  // ── 8. Team scorecard ──
  const teamScorecard = readJsonFile<Record<string, { merit?: number; penalty?: number; status?: string }>>(
    join(JARVIS_HOME, 'state', 'team-scorecard.json'), {}
  );
  const teams = Object.entries(teamScorecard)
    .filter(([, v]) => v && typeof v === 'object' && 'status' in v)
    .map(([name, v]) => ({ name, merit: v.merit || 0, penalty: v.penalty || 0, status: v.status || 'NORMAL' }))
    .sort((a, b) => (b.merit - b.penalty) - (a.merit - a.penalty));

  // ── 9. Autonomy rate ──
  const autonomy = readJsonFile<{
    autonomy_rate?: string; total_decisions?: number; executed?: number;
    by_team?: Record<string, { total?: number; executed?: number }>;
  }>(join(JARVIS_HOME, 'state', 'autonomy-rate.json'), {});

  // ── 10. Errors ──
  const errors = parseErrors();

  // ── 11. healthSummary — sysMetrics 우선, 로컬 fallback ──
  type HealthLevel = 'green' | 'yellow' | 'red';
  const issues: Array<{ severity: 'warning' | 'critical'; message: string }> = [];

  // 봇: sysMetrics.health 우선 (Railway에서 local health.json 없음)
  const smHealth = sysMetrics?.health as { discord_bot?: string; memory_mb?: number } | undefined;
  const botStatus = smHealth?.discord_bot ?? health.discord_bot;
  const smDiscord = sysMetrics?.discord_stats as { lastHealth?: { silenceSec?: number } } | undefined;
  const silenceSec = smDiscord?.lastHealth?.silenceSec ?? 0;
  const botIsHealthy = botStatus === 'healthy';
  const botLevel: HealthLevel = botIsHealthy && silenceSec < 900 ? 'green' : botIsHealthy ? 'yellow' : 'red';
  if (botLevel === 'red') issues.push({ severity: 'critical', message: '봇이 응답하지 않습니다' });
  else if (botLevel === 'yellow') issues.push({ severity: 'warning', message: `봇 ${Math.floor(silenceSec / 60)}분째 침묵 중` });

  // 디스크
  const diskPct = (sysMetrics?.disk as { used_pct?: number } | undefined)?.used_pct ?? 0;
  if (diskPct >= 90) issues.push({ severity: 'critical', message: `디스크 ${diskPct}% 사용 중` });
  else if (diskPct >= 80) issues.push({ severity: 'warning', message: `디스크 사용량 높음: ${diskPct}%` });

  // 크론: sysMetrics.cron_stats.rate 우선 (로컬 파일 없으면 successRate=100 이지만 sysMetrics가 더 정확)
  const smCronRate = (sysMetrics?.cron_stats as { rate?: number } | undefined)?.rate;
  const smCronFailed = (sysMetrics?.cron_stats as { recentFailed?: Array<{ task: string }> } | undefined)?.recentFailed ?? [];
  const effectiveCronRate = smCronRate ?? cron.successRate;
  const cronLevel: HealthLevel = effectiveCronRate >= 90 ? 'green' : effectiveCronRate >= 70 ? 'yellow' : 'red';
  if (cronLevel !== 'green') {
    const failNames = smCronFailed.slice(0, 2).map(f => f.task).join(', ') || cron.recentFailures.slice(0, 2).join(', ');
    issues.push({ severity: cronLevel === 'red' ? 'critical' : 'warning', message: `자동화 성공률 ${effectiveCronRate}%${failNames ? ` (${failNames})` : ''}` });
  }

  // E2E: total=0이면 데이터 없음으로 green 처리
  const e2eLevel: HealthLevel = e2e.total === 0 ? 'green' : e2e.rate >= 95 ? 'green' : e2e.rate >= 80 ? 'yellow' : 'red';
  if (e2eLevel !== 'green') {
    issues.push({ severity: e2eLevel === 'red' ? 'critical' : 'warning', message: `자가점검 ${e2e.total - e2e.passed}건 실패 (${e2e.rate}% 통과)` });
  }

  // 오류
  const errorLevel: HealthLevel = errors.total24h < 5 ? 'green' : errors.total24h < 20 ? 'yellow' : 'red';
  if (errorLevel !== 'green') {
    issues.push({ severity: errorLevel === 'red' ? 'critical' : 'warning', message: `24시간 내 오류 ${errors.total24h}건 발생` });
  }

  const levels = [botLevel, cronLevel, e2eLevel, errorLevel];
  const overall: HealthLevel = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green';
  const healthSummary = { overall, botLevel, cronLevel, e2eLevel, errorLevel, issues };

  // ── 12. attention — 내 할 일 ──
  const awaitingApproval = db.prepare(`
    SELECT id, title, priority, created_at, expected_impact
    FROM dev_tasks WHERE status = 'awaiting_approval'
    ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at ASC
    LIMIT 5
  `).all() as Array<{ id: string; title: string; priority: string; created_at: string; expected_impact: string | null }>;

  const needsOwnerInput = db.prepare(`
    SELECT p.id, p.title, p.type, p.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
    FROM posts p
    WHERE p.status IN ('open','in-progress')
      AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author = 'owner')
    ORDER BY p.created_at ASC LIMIT 5
  `).all() as Array<{ id: string; title: string; type: string; created_at: string; comment_count: number }>;

  // 마감 임박: 활성 토론 중 2시간 이내 마감
  const activePosts = db.prepare(`
    SELECT id, title, type, status, created_at, restarted_at, extra_ms
    FROM posts WHERE status IN ('open','in-progress') AND paused_at IS NULL
  `).all() as Array<{ id: string; title: string; type: string; status: string; created_at: string; restarted_at: string | null; extra_ms: number }>;

  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const closingSoon = activePosts
    .map(p => {
      const base = new Date((p.restarted_at ?? p.created_at) + 'Z').getTime();
      const windowMs = getDiscussionWindow(p.type);
      const expiresAt = base + windowMs + (p.extra_ms ?? 0);
      const remaining = expiresAt - now;
      return { ...p, remaining_ms: remaining, remaining_minutes: Math.ceil(remaining / 60000) };
    })
    .filter(p => p.remaining_ms > 0 && p.remaining_ms <= TWO_HOURS)
    .sort((a, b) => a.remaining_ms - b.remaining_ms)
    .slice(0, 5)
    .map(({ id, title, type, remaining_minutes }) => ({ id, title, type, remaining_minutes }));

  const attention = { awaitingApproval, needsOwnerInput, closingSoon };

  // ── 13. todaySummary — 오늘 활동 ──
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(now - 6 * 86400000).toISOString().slice(0, 10);
  const prevWeekStart = new Date(now - 13 * 86400000).toISOString().slice(0, 10);
  const prevWeekEnd = new Date(now - 7 * 86400000).toISOString().slice(0, 10);

  const todayNewPosts = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE created_at LIKE ?").get(`${today}%`) as { n: number })?.n ?? 0;
  const todayResolved = (db.prepare("SELECT COUNT(*) as n FROM posts WHERE resolved_at LIKE ?").get(`${today}%`) as { n: number })?.n ?? 0;
  const todayCompletedTasks = (db.prepare("SELECT COUNT(*) as n FROM dev_tasks WHERE completed_at LIKE ?").get(`${today}%`) as { n: number })?.n ?? 0;
  const todayAiComments = (db.prepare("SELECT COUNT(*) as n FROM comments WHERE created_at LIKE ? AND is_visitor = 0 AND author != 'owner'").get(`${today}%`) as { n: number })?.n ?? 0;

  const thisWeekActivity = ((db.prepare("SELECT COUNT(*) as n FROM posts WHERE created_at >= ?").get(weekStart) as { n: number })?.n ?? 0)
    + ((db.prepare("SELECT COUNT(*) as n FROM comments WHERE created_at >= ?").get(weekStart) as { n: number })?.n ?? 0);
  const prevWeekActivity = ((db.prepare("SELECT COUNT(*) as n FROM posts WHERE created_at >= ? AND created_at < ?").get(prevWeekStart, prevWeekEnd) as { n: number })?.n ?? 0)
    + ((db.prepare("SELECT COUNT(*) as n FROM comments WHERE created_at >= ? AND created_at < ?").get(prevWeekStart, prevWeekEnd) as { n: number })?.n ?? 0);

  const weekChange = prevWeekActivity > 0
    ? Math.round(((thisWeekActivity - prevWeekActivity) / prevWeekActivity) * 100)
    : 0;

  const todaySummary = {
    newPosts: todayNewPosts,
    resolvedPosts: todayResolved,
    completedTasks: todayCompletedTasks,
    aiComments: todayAiComments,
    weekChange,
    weekTrend: boardStats.recentDays,
  };

  // ── 14. teamOverview — 팀 현황 (sysMetrics.scorecard 우선) ──
  const mvpAgent = topAgents[0] ?? null;
  const autonomyRate = parseFloat(autonomy.autonomy_rate ?? '0');
  const smScorecard = (sysMetrics?.scorecard as { teams?: Record<string, { merit: number; penalty: number; status: string }> } | undefined)?.teams;
  const effectiveTeams = teams.length > 0
    ? teams
    : smScorecard
      ? Object.entries(smScorecard).map(([name, v]) => ({ name, merit: v.merit, penalty: v.penalty, status: v.status }))
      : [];
  const teamOverview = {
    mvp: mvpAgent,
    autonomyRate,
    totalDecisions: autonomy.total_decisions ?? 0,
    executed: autonomy.executed ?? 0,
    teams: effectiveTeams,
  };

  return NextResponse.json({
    ts: new Date().toISOString(),
    system: health,
    cron,
    claude,
    tasks: taskStats,
    board: boardStats,
    agents: { top5: topAgents, tierChanges: recentTierChanges },
    e2e,
    teams,
    autonomy,
    errors,
    healthSummary,
    attention,
    todaySummary,
    teamOverview,
    sysMetrics,
  });
}
