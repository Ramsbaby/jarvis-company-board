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
  if (!content) return { todaySuccess: 0, todayFail: 0, todayTotal: 0, successRate: 0, recentFailures: [] as string[], trend: [] as Array<{ date: string; ok: number; fail: number }> };

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

  // ── 0. system_metrics (Mac Mini → board_settings, 5분마다 push) ──
  const smRow = db.prepare("SELECT value FROM board_settings WHERE key = 'system_metrics'").get() as { value: string } | undefined;
  let sysMetrics: Record<string, unknown> | null = null;
  if (smRow?.value) { try { sysMetrics = JSON.parse(smRow.value); } catch { /* ignore */ } }

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

  // ── 5. Board activity (7 days) ──
  const recentDays: Array<{ date: string; posts: number; comments: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const postCount = (db.prepare('SELECT COUNT(*) as n FROM posts WHERE created_at LIKE ?').get(`${date}%`) as { n: number })?.n || 0;
    const commentCount = (db.prepare('SELECT COUNT(*) as n FROM comments WHERE created_at LIKE ?').get(`${date}%`) as { n: number })?.n || 0;
    recentDays.push({ date, posts: postCount, comments: commentCount });
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
    SELECT agent_id, SUM(points) as score, COUNT(*) as events
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

  // ── 11. healthSummary — 기존 데이터에서 CEO용 상태 계산 ──
  type HealthLevel = 'green' | 'yellow' | 'red';
  const issues: Array<{ severity: 'warning' | 'critical'; message: string }> = [];

  const silenceSec = (sysMetrics?.discord_stats as { lastHealth?: { silenceSec?: number } } | undefined)?.lastHealth?.silenceSec ?? 0;
  const botIsHealthy = health.discord_bot === 'healthy';
  const botLevel: HealthLevel = botIsHealthy && silenceSec < 900 ? 'green' : botIsHealthy ? 'yellow' : 'red';
  if (botLevel === 'red') issues.push({ severity: 'critical', message: '봇이 응답하지 않습니다' });
  else if (botLevel === 'yellow') issues.push({ severity: 'warning', message: `봇 ${Math.floor(silenceSec / 60)}분째 침묵 중` });

  // Disk alert
  const diskPct = (sysMetrics?.disk as { used_pct?: number } | undefined)?.used_pct ?? 0;
  if (diskPct >= 90) issues.push({ severity: 'critical', message: `디스크 ${diskPct}% 사용 중` });
  else if (diskPct >= 80) issues.push({ severity: 'warning', message: `디스크 사용량 높음: ${diskPct}%` });

  const cronLevel: HealthLevel = cron.successRate >= 90 ? 'green' : cron.successRate >= 70 ? 'yellow' : 'red';
  if (cronLevel !== 'green') {
    const failMsg = cron.recentFailures.slice(0, 2).join(', ');
    issues.push({ severity: cronLevel === 'red' ? 'critical' : 'warning', message: `자동화 작업 ${cron.todayFail}건 실패${failMsg ? `: ${failMsg}` : ''}` });
  }

  const e2eLevel: HealthLevel = e2e.rate >= 95 ? 'green' : e2e.rate >= 80 ? 'yellow' : 'red';
  if (e2eLevel !== 'green') {
    issues.push({ severity: e2eLevel === 'red' ? 'critical' : 'warning', message: `자가점검 ${e2e.total - e2e.passed}건 실패 (${e2e.rate}% 통과)` });
  }

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

  // ── 14. teamOverview — 팀 현황 ──
  const mvpAgent = topAgents[0] ?? null;
  const autonomyRate = parseFloat(autonomy.autonomy_rate ?? '0');
  const teamOverview = {
    mvp: mvpAgent,
    autonomyRate,
    totalDecisions: autonomy.total_decisions ?? 0,
    executed: autonomy.executed ?? 0,
    teams,
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
