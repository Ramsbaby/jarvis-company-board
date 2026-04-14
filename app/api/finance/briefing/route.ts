export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';
import { getTodayCost, getMonthCost, getDailyCap } from '@/lib/chat-cost';
import { getBriefingSystemMetrics } from '@/lib/map/system-metrics';
import { CRON_LOG, RESULTS_DIR } from '@/lib/jarvis-paths';

/**
 * 재무실(finance) 브리핑 — 돈 관련 데이터 통합 공간.
 *
 * 데이터 소스:
 *  1. chat-cost — 자비스 AI 호출 비용 (오늘/월)
 *  2. cron.log — market-alert/tqqq/finance-monitor 크론 결과
 *  3. personal-schedule-daily — 보람 Preply 수입 (보람 데이터지만 "수입" 카테고리로 여기에 격리)
 *  4. df/vm_stat — 로컬 cost-monitor 시스템 지표
 */

const PREPLY_SCHEDULE_DIR = path.join(RESULTS_DIR, 'personal-schedule-daily');

const MARKET_KEYWORDS = ['tqqq', 'market-alert', 'macro-briefing', 'finance-monitor', 'stock'];

interface CronEntry {
  time: string;       // "HH:MM"
  task: string;
  result: 'success' | 'failed' | 'skipped' | 'running';
  description: string;
  icon: string;
}

function readSafe(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

// ── 최근 시장 크론 (TQQQ / market-alert / finance 계열) ──────────────
function getMarketCrons(limit = 5): { entries: CronEntry[]; successCount: number; failedCount: number } {
  const raw = readSafe(CRON_LOG);
  if (!raw) return { entries: [], successCount: 0, failedCount: 0 };
  const lines = raw.split('\n').filter(Boolean).slice(-3000);
  const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
  const entries: CronEntry[] = [];
  let successCount = 0, failedCount = 0;

  for (const line of lines) {
    const m = line.match(LOG_RE);
    if (!m) continue;
    const [, ts, task, msg] = m;
    if (/^task_\d+_/.test(task)) continue;
    const lower = task.toLowerCase();
    if (!MARKET_KEYWORDS.some(kw => lower.includes(kw))) continue;

    let result: CronEntry['result'] | null = null;
    if (/\bSUCCESS\b|\bDONE\b/.test(line)) { result = 'success'; successCount++; }
    else if (/FAILED|ERROR|CRITICAL/.test(line)) { result = 'failed'; failedCount++; }
    else if (/\bSKIPPED\b/.test(line)) result = 'skipped';
    else if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) result = 'running';
    if (!result) continue;

    const timeOnly = ts.split(' ')[1]?.slice(0, 5) || '';
    const icon = result === 'success' ? '💚' : result === 'failed' ? '🔴' : result === 'skipped' ? '⏭️' : '🔄';
    const description =
      result === 'success' ? `${task} 완료` :
      result === 'failed' ? `${task} 실패 — ${msg.slice(0, 60)}` :
      result === 'skipped' ? `${task} 건너뜀` :
      `${task} 진행중`;
    entries.push({ time: timeOnly, task, result, description, icon });
  }

  entries.reverse();
  return { entries: entries.slice(0, limit), successCount, failedCount };
}

// ── Preply 수입 (보람 강사 데이터, "수입" 카테고리로 재무실 격리) ──────
interface PreplyIncome {
  date: string;
  totalUsd: string;
  totalKrw: string;
  lessonCount: number;
  studentCount: number;
}

function getPreplyIncomeToday(): PreplyIncome | null {
  try {
    if (!existsSync(PREPLY_SCHEDULE_DIR)) return null;
    const files = readdirSync(PREPLY_SCHEDULE_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    const content = readFileSync(path.join(PREPLY_SCHEDULE_DIR, files[0]), 'utf8');
    const dateMatch = files[0].match(/(\d{4}-\d{2}-\d{2})/);

    // 총합: "총 N개 수업 · 총 수입 $XXX.XX (~₩XXX,XXX)"
    const totalMatch = content.match(/총\s*(\d+)개\s*수업[^$]*\$([\d.,]+)[^₩]*₩([\d,]+)/);
    if (!totalMatch) {
      return {
        date: dateMatch?.[1] || '',
        totalUsd: '0',
        totalKrw: '0',
        lessonCount: 0,
        studentCount: 0,
      };
    }
    const lessonCount = parseInt(totalMatch[1]);
    const totalUsd = totalMatch[2];
    const totalKrw = totalMatch[3];

    // 학생 수 (중복 제거)
    const studentLines = content.match(/🕐\s*\d{2}:\d{2}\s*·\s*([^·]+)\s*·/g) || [];
    const students = new Set(studentLines.map(s => {
      const m = s.match(/·\s*([^·]+)\s*·/);
      return m?.[1].trim() || '';
    }).filter(Boolean));

    return {
      date: dateMatch?.[1] || '',
      totalUsd,
      totalKrw,
      lessonCount,
      studentCount: students.size,
    };
  } catch { return null; }
}

// ── 시스템 cost-monitor 스냅샷 (cron.log에서 최신 cost-monitor 결과) ────
function getCostMonitorSnapshot(): string | null {
  try {
    const raw = readFileSync(CRON_LOG, 'utf8');
    const lines = raw.split('\n').filter(Boolean).slice(-500);
    const costLines = lines.filter(l => /cost-monitor/.test(l)).slice(-3);
    return costLines.length > 0 ? costLines.join('\n') : null;
  } catch { return null; }
}

// ── Route Handler ────────────────────────────────────────────────────────────

interface FinanceBriefing {
  type: 'finance';
  id: 'finance';
  name: string;
  title: string;
  avatar: string;
  emoji: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  summary: string;
  recentActivity: CronEntry[];
  lastBoardMinutes: string | null;
  boardMinutesFile: string | null;
  stats: { total: number; success: number; failed: number; rate: number };
  financeData: {
    claudeCostToday: number;
    claudeCostMonth: number;
    claudeDailyCap: number;
    claudeCapPercent: number;
    preplyIncome: PreplyIncome | null;
    marketCronSuccess: number;
    marketCronFailed: number;
  };
  updatedAt: string;
  systemMetrics?: Array<{ label: string; value: number; icon: string; type: 'disk' | 'memory' | 'cpu' }>;
}

let cache: { data: FinanceBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const [claudeToday, claudeMonth, claudeCap] = await Promise.all([
      getTodayCost(),
      getMonthCost(),
      getDailyCap(),
    ]);
    const market = getMarketCrons(5);
    const preply = getPreplyIncomeToday();
    const costSnapshot = getCostMonitorSnapshot();

    const capPercent = claudeCap > 0 ? Math.min(100, (claudeToday / claudeCap) * 100) : 0;

    // Summary: 수입 + AI 비용 + 시장
    const summaryParts: string[] = [];
    if (preply && preply.lessonCount > 0) {
      summaryParts.push(`오늘 Preply 수업 ${preply.lessonCount}건 (~₩${preply.totalKrw})`);
    }
    summaryParts.push(`Claude 오늘 $${claudeToday.toFixed(4)} / 월 $${claudeMonth.toFixed(3)}`);
    if (market.entries.length > 0) {
      summaryParts.push(`시장 크론 ${market.successCount}건 정상${market.failedCount > 0 ? `, ${market.failedCount}건 실패` : ''}`);
    }
    const summary = summaryParts.join(' · ');

    // Status: market 실패 또는 Claude cap 95% 초과 시 RED
    const status: 'GREEN' | 'YELLOW' | 'RED' =
      market.failedCount > 0 || capPercent >= 95 ? 'RED'
      : capPercent >= 80 ? 'YELLOW'
      : 'GREEN';

    // 마크다운 본문 — 수입 + 비용 + 시장
    let bodyMd = '';
    bodyMd += `## 💵 오늘 수입\n\n`;
    if (preply && preply.lessonCount > 0) {
      bodyMd += `- **Preply 수업**: ${preply.lessonCount}건 · 학생 ${preply.studentCount}명\n`;
      bodyMd += `- **예정 수입**: $${preply.totalUsd} (~₩${preply.totalKrw})\n`;
      bodyMd += `- *출처: ~/.jarvis/results/personal-schedule-daily/ (보람 강사 데이터)*\n\n`;
    } else {
      bodyMd += `- 오늘 예정 수업 없음\n\n`;
    }

    bodyMd += `## 🤖 Claude AI 비용 (자비스 내부 호출)\n\n`;
    bodyMd += `- **오늘**: $${claudeToday.toFixed(4)}\n`;
    bodyMd += `- **이번 달 누적**: $${claudeMonth.toFixed(3)}\n`;
    bodyMd += `- **일일 상한**: $${claudeCap.toFixed(2)} (${capPercent.toFixed(1)}% 사용)\n`;
    bodyMd += `- *출처: ~/.jarvis/state/game-chat-cost.json*\n\n`;

    if (market.entries.length > 0) {
      bodyMd += `## 📈 시장/재무 크론 최근 활동\n\n`;
      for (const e of market.entries) {
        bodyMd += `- ${e.icon} **${e.time}** \`${e.task}\` — ${e.description}\n`;
      }
      bodyMd += '\n';
    }

    if (costSnapshot) {
      bodyMd += `## 💾 cost-monitor 스냅샷\n\n\`\`\`\n${costSnapshot}\n\`\`\`\n`;
    }

    const data: FinanceBriefing = {
      type: 'finance',
      id: 'finance',
      name: '재무실',
      title: 'AI 운영 비용 + 시장 + 수입 통합',
      avatar: '💰',
      emoji: '💰',
      status,
      summary,
      recentActivity: market.entries,
      lastBoardMinutes: bodyMd,
      boardMinutesFile: null,
      stats: {
        total: market.successCount + market.failedCount,
        success: market.successCount,
        failed: market.failedCount,
        rate: market.successCount + market.failedCount > 0
          ? Math.round((market.successCount / (market.successCount + market.failedCount)) * 100)
          : 100,
      },
      financeData: {
        claudeCostToday: claudeToday,
        claudeCostMonth: claudeMonth,
        claudeDailyCap: claudeCap,
        claudeCapPercent: capPercent,
        preplyIncome: preply,
        marketCronSuccess: market.successCount,
        marketCronFailed: market.failedCount,
      },
      updatedAt: new Date().toISOString(),
      // 시스템 건강 드릴다운 — 모든 방 공통.
      systemMetrics: getBriefingSystemMetrics(),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// eslint 기본 포지티브 체크를 피하기 위해 unused import 방지
void execSync;
