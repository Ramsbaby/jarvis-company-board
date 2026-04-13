export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
/**
 * 자비스맵 통합 statusline — 좌상단에 붙는 Claude Code statusline 스타일.
 *
 * 블록:
 *  1. Claude 5h (rate limit 5시간 창) — ~/.claude/usage-cache.json fiveH
 *  2. Claude 7d (주간 할당량) — ~/.claude/usage-cache.json sevenD
 *  3. Mac Mini CPU 사용률
 *  4. Mac Mini 메모리 사용률
 *  5. Disk 사용률
 *  6. 24h 크론 성공률 (from cron.log)
 */

const HOME = homedir();
const CRON_LOG = path.join(HOME, '.jarvis', 'logs', 'cron.log');
const CLAUDE_USAGE_CACHE = path.join(HOME, '.claude', 'usage-cache.json');

interface StatuslineBlock {
  label: string;
  icon: string;
  value: string;          // 표시 문자열 (예: "38%")
  raw: number;            // 숫자 기반 상태 결정용 (0~100)
  status: 'GREEN' | 'YELLOW' | 'RED';
  tooltip: string;        // hover 시 상세
}

interface StatuslineResponse {
  blocks: StatuslineBlock[];
  updatedAt: string;
}

// ── 시스템 메트릭 수집 ────────────────────────────────────────────────

function safeExec(cmd: string, timeoutMs = 2000): string {
  try {
    return execSync(cmd, { timeout: timeoutMs, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getCpuUsage(): { usage: number; loadAvg: number } {
  // top -l 1 -n 0 single sample, no process table
  const out = safeExec('top -l 1 -n 0');
  if (!out) return { usage: 0, loadAvg: 0 };
  const cpuMatch = out.match(/CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/);
  const loadMatch = out.match(/Load Avg:\s+([\d.]+)/);
  const idle = cpuMatch ? parseFloat(cpuMatch[3]) : 100;
  const usage = Math.round(100 - idle);
  const loadAvg = loadMatch ? parseFloat(loadMatch[1]) : 0;
  return { usage, loadAvg };
}

function getMemoryUsage(): { percent: number; usedGb: number; totalGb: number } {
  // top 출력에서 PhysMem 파싱
  const out = safeExec('top -l 1 -n 0');
  if (!out) return { percent: 0, usedGb: 0, totalGb: 0 };
  // PhysMem: 14G used (2001M wired, 1555M compressor), 1958M unused.
  const m = out.match(/PhysMem:\s+(\d+)([GM])\s+used.*?(\d+)([GM])\s+unused/);
  if (!m) return { percent: 0, usedGb: 0, totalGb: 0 };
  const toGb = (n: string, u: string) => u === 'G' ? parseFloat(n) : parseFloat(n) / 1024;
  const used = toGb(m[1], m[2]);
  const unused = toGb(m[3], m[4]);
  const total = used + unused;
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  return { percent, usedGb: used, totalGb: total };
}

function getDiskUsage(): { percent: number; used: string; total: string } {
  const out = safeExec("df -h / | awk 'NR==2{print $3,$2,$5}'");
  if (!out) return { percent: 0, used: '?', total: '?' };
  const [used, total, pct] = out.split(/\s+/);
  return { percent: parseInt(pct) || 0, used: used || '?', total: total || '?' };
}

// ── Claude Code 구독 사용량 (~/.claude/usage-cache.json) ───────────────
interface ClaudeUsageCache {
  fiveH?: { pct: number; reset: string; resetIn: string; remain: number };
  sevenD?: { pct: number; reset: string; resetIn: string; remain: number };
  sonnet?: { pct: number; reset: string; resetIn: string; remain: number };
  ts?: string;
  ok?: boolean;
}

function getClaudeUsage(): ClaudeUsageCache | null {
  try {
    const raw = readFileSync(CLAUDE_USAGE_CACHE, 'utf8');
    return JSON.parse(raw) as ClaudeUsageCache;
  } catch {
    return null;
  }
}

function getCron24hRate(): { rate: number; success: number; failed: number } {
  try {
    const raw = readFileSync(CRON_LOG, 'utf8');
    const lines = raw.split('\n').filter(Boolean).slice(-3000);
    const KST_OFFSET = 9 * 3600_000;
    const cutoff = new Date(Date.now() - 24 * 3600_000 + KST_OFFSET).toISOString().replace('T', ' ').slice(0, 19);
    let success = 0, failed = 0;
    for (const line of lines) {
      const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\]/);
      if (!m || m[1] < cutoff) continue;
      if (/^task_\d+_/.test(m[2])) continue;
      if (/\bSUCCESS\b|\bDONE\b/.test(line)) success++;
      else if (/FAILED|ERROR|CRITICAL/.test(line)) failed++;
    }
    const total = success + failed;
    return { rate: total > 0 ? Math.round((success / total) * 100) : 100, success, failed };
  } catch {
    return { rate: 0, success: 0, failed: 0 };
  }
}

// ── 상태 결정 ─────────────────────────────────────────────────────────

function statusByPercent(p: number, yellow = 80, red = 95): 'GREEN' | 'YELLOW' | 'RED' {
  if (p >= red) return 'RED';
  if (p >= yellow) return 'YELLOW';
  return 'GREEN';
}

function statusByRate(rate: number): 'GREEN' | 'YELLOW' | 'RED' {
  if (rate >= 90) return 'GREEN';
  if (rate >= 70) return 'YELLOW';
  return 'RED';
}

// ── 캐시 ─────────────────────────────────────────────────────────────

let cache: { data: StatuslineResponse; ts: number } | null = null;
const CACHE_TTL_MS = 10_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const usage = getClaudeUsage();
    const cpu = getCpuUsage();
    const mem = getMemoryUsage();
    const disk = getDiskUsage();
    const cron = getCron24hRate();

    // Claude 구독 사용량 — 사용한 % 기준 (pct 자체가 used%)
    const fiveHPct = usage?.fiveH?.pct ?? 0;
    const fiveHRemain = usage?.fiveH?.remain ?? 100;
    const fiveHResetIn = usage?.fiveH?.resetIn ?? '?';
    const fiveHReset = usage?.fiveH?.reset ?? '?';

    const sevenDPct = usage?.sevenD?.pct ?? 0;
    const sevenDRemain = usage?.sevenD?.remain ?? 100;
    const sevenDResetIn = usage?.sevenD?.resetIn ?? '?';
    const sevenDReset = usage?.sevenD?.reset ?? '?';

    const sonnetPct = usage?.sonnet?.pct ?? 0;
    const sonnetRemain = usage?.sonnet?.remain ?? 100;

    const blocks: StatuslineBlock[] = [
      {
        label: '5h',
        icon: '⏱',
        value: `${fiveHPct}%`,
        raw: fiveHPct,
        status: statusByPercent(fiveHPct, 70, 90),
        tooltip: `5h: 최근 5시간 Claude 사용량 — ${fiveHPct}% 사용 (${fiveHRemain}% 남음) · ${fiveHResetIn} 후 리셋 (${fiveHReset})`,
      },
      {
        label: '7d',
        icon: '📅',
        value: `${sevenDPct}%`,
        raw: sevenDPct,
        status: statusByPercent(sevenDPct, 70, 90),
        tooltip: `7d: 최근 7일 Claude 사용량 — ${sevenDPct}% 사용 (${sevenDRemain}% 남음) · ${sevenDResetIn} 후 리셋 (${sevenDReset})`,
      },
      {
        label: 'Sonnet',
        icon: '🤖',
        value: `${sonnetPct}%`,
        raw: sonnetPct,
        status: statusByPercent(sonnetPct, 70, 90),
        tooltip: `Sonnet: Sonnet 모델 할당량 — ${sonnetPct}% 사용 (${sonnetRemain}% 남음)`,
      },
      {
        label: 'CPU',
        icon: '⚡',
        value: `${cpu.usage}%`,
        raw: cpu.usage,
        status: statusByPercent(cpu.usage, 70, 90),
        tooltip: `CPU: Mac Mini CPU 사용률 ${cpu.usage}% · 부하 평균 ${cpu.loadAvg.toFixed(2)} (높을수록 바쁨)`,
      },
      {
        label: 'RAM',
        icon: '🧠',
        value: `${mem.percent}%`,
        raw: mem.percent,
        status: statusByPercent(mem.percent, 85, 95),
        tooltip: `RAM: Mac Mini 메모리 — ${mem.usedGb.toFixed(1)}GB / ${mem.totalGb.toFixed(1)}GB 사용 중`,
      },
      {
        label: 'Disk',
        icon: '💾',
        value: `${disk.percent}%`,
        raw: disk.percent,
        status: statusByPercent(disk.percent, 80, 90),
        tooltip: `Disk: Mac Mini 디스크 — ${disk.used} / ${disk.total} 사용 중`,
      },
      {
        label: 'Cron 24h',
        icon: '⏱',
        value: `${cron.rate}%`,
        raw: cron.rate,
        status: statusByRate(cron.rate),
        tooltip: `Cron 24h: 최근 24시간 크론잡 성공률 — 성공 ${cron.success}건 / 실패 ${cron.failed}건`,
      },
    ];

    const data: StatuslineResponse = {
      blocks,
      updatedAt: new Date().toISOString(),
    };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
