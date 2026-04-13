export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

const HOME = homedir();
const TASKS_FILE = path.join(HOME, '.jarvis', 'config', 'tasks.json');
const CRON_LOG = path.join(HOME, '.jarvis', 'logs', 'cron.log');

let cache: { data: CronsResponse; ts: number } | null = null;

type CronStatus = 'success' | 'failed' | 'skipped' | 'running' | 'unknown';

interface TaskDef {
  id: string;
  name?: string;
  schedule?: string;
  enabled?: boolean;
  prompt?: string;
  script?: string;
  discordChannel?: string;
  priority?: string;
  description?: string;
}

export interface RecentRun {
  status: CronStatus;
  timestamp: string;
  message: string;
}

interface CronItem {
  id: string;
  name: string;
  description: string;
  schedule: string;
  scheduleHuman: string;
  status: CronStatus;
  lastRun: string | null;
  lastResult: string;
  lastMessage: string;
  lastDuration: string;      // "2s", "15s" 등
  outputSummary: string;     // 실제 출력 요약 (노이즈 제거)
  nextRun: string | null;
  team: string;
  teamEmoji: string;
  priority: string;
  hasLLM: boolean;
  hasScript: boolean;
  recentRuns: RecentRun[];
}

interface CronsResponse {
  crons: CronItem[];
  total: number;
  generatedAt: string;
}

// ── 팀 분류 ──────────────────────────────────────────────────────
interface TeamRule {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
}

const TEAM_RULES: TeamRule[] = [
  // 신설 재무실 — 돈 관련 (AI 비용 + 시장 + 개인 수입 통합). 순서 중요: 먼저 매칭
  { id: 'finance', label: '재무실', emoji: '💰', keywords: ['tqqq', 'market', 'stock', 'macro', 'finance-monitor', 'cost-monitor', 'preply', 'personal-schedule', 'boram'] },
  { id: 'infra', label: '인프라팀', emoji: '⚙️', keywords: ['disk', 'system-doctor', 'system-health', 'infra', 'sync-system-metrics', 'glances', 'aggregate-metrics', 'health', 'log-cleanup', 'memory-cleanup', 'rate-limit', 'update-usage-cache', 'token-sync', 'daily-usage-check', 'security-scan', 'scorecard-enforcer'] },
  // 정보팀 — market/tqqq/finance 계열 재무실로 이관됨. 순수 트렌드/뉴스만
  { id: 'info', label: '정보팀', emoji: '📡', keywords: ['news', 'trend', 'github-monitor', 'calendar-alert', 'recon'] },
  // 라이브러리 — 기록팀 업무 중 사용자 접근 레이어 (RAG 인덱스/벤치). 기록팀보다 먼저 매칭 필요
  { id: 'library', label: '라이브러리', emoji: '📖', keywords: ['rag-index', 'rag-bench'] },
  { id: 'record', label: '기록팀', emoji: '🗄️', keywords: ['record', 'memory', 'rag', 'session', 'vault', 'gen-system-overview'] },
  // 신설 성장실 = 구 학습팀 + 구 커리어팀 통합 (면접 + 기술 학습)
  { id: 'growth', label: '성장실', emoji: '🌱', keywords: ['career', 'interview', 'commitment', 'job', 'resume', 'isg', 'growth', 'academy', 'learning', 'study', 'lecture'] },
  { id: 'brand', label: '브랜드팀', emoji: '📣', keywords: ['brand', 'blog', 'oss', 'openclaw', 'github-star', 'stars'] },
  { id: 'audit', label: '감사팀', emoji: '🔍', keywords: ['audit', 'e2e', 'cron-failure', 'regression', 'doc-sync', 'doc-supervisor', 'code-auditor', 'cron-auditor', 'stale-task', 'kpi', 'roi', 'bot-quality', 'bot-self-critique', 'auto-diagnose', 'skill-eval'] },
  // 대표실 (구 CEO/임원실 + 오너 공간)
  { id: 'exec', label: '대표실', emoji: '🏛️', keywords: ['board', 'ceo', 'council', 'morning-standup', 'daily-summary', 'schedule-coherence', 'monthly-review', 'connections-weekly', 'private-sync', 'dev-runner', 'jarvis-coder', 'agent-batch-commit', 'weekly-code-review', 'weekly-usage-stats'] },
];

function classifyTeam(taskId: string): { label: string; emoji: string } {
  const lower = taskId.toLowerCase();
  for (const rule of TEAM_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { label: rule.label, emoji: rule.emoji };
    }
  }
  return { label: '미분류', emoji: '❓' };
}

// ── cron expression → 한국어 ──────────────────────────────────────
function cronToHuman(expr: string): string {
  if (!expr) return '';
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const pad = (v: string) => v.padStart(2, '0');

  // every N minutes
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `${min.slice(2)}분마다`;
  }
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return '매시 정각';
  if (min === '*' && hour === '*') return '매분';

  // fixed time
  const isFixedTime = /^\d+$/.test(min) && /^\d+$/.test(hour);
  const timeStr = isFixedTime ? `${pad(hour)}:${pad(min)}` : `${hour}시 ${min}분`;

  if (dom === '*' && mon === '*' && dow === '*') return `매일 ${timeStr}`;
  if (dom === '*' && mon === '*' && dow !== '*') {
    const dowMap: Record<string, string> = {
      '0': '일', '1': '월', '2': '화', '3': '수', '4': '목', '5': '금', '6': '토', '7': '일',
    };
    if (dow === '1-5') return `평일 ${timeStr}`;
    if (dow === '0,6' || dow === '6,0') return `주말 ${timeStr}`;
    const days = dow.split(',').map(d => dowMap[d] || d).join('·');
    return `매주 ${days} ${timeStr}`;
  }
  if (mon === '*' && dow === '*' && /^\d+$/.test(dom)) return `매월 ${dom}일 ${timeStr}`;
  return expr;
}

// ── 다음 실행 시간 계산 (단순, fixed time 위주) ───────────────────
function nextRunTime(expr: string): string | null {
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return null;
  const m = parseInt(min, 10);
  const h = parseInt(hour, 10);

  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(h, m);

  const dowFilter = dow !== '*' ? dow : null;
  const domFilter = dom !== '*' && /^\d+$/.test(dom) ? parseInt(dom, 10) : null;

  // Search up to 14 days ahead
  for (let i = 0; i < 14; i++) {
    if (next.getTime() > now.getTime()) {
      let ok = true;
      if (domFilter !== null && next.getDate() !== domFilter) ok = false;
      if (ok && dowFilter) {
        const curDow = next.getDay().toString();
        const allowed = dowFilter === '1-5'
          ? ['1', '2', '3', '4', '5']
          : dowFilter === '0,6' || dowFilter === '6,0'
          ? ['0', '6']
          : dowFilter.split(',');
        if (!allowed.includes(curDow)) ok = false;
      }
      if (ok && mon !== '*' && /^\d+$/.test(mon)) {
        if (next.getMonth() + 1 !== parseInt(mon, 10)) ok = false;
      }
      if (ok) return next.toISOString();
    }
    next.setDate(next.getDate() + 1);
  }
  return null;
}

// ── 프롬프트/description에서 설명 추출 ──────────────────────────
function extractDescription(task: TaskDef): string {
  // 1. description 필드 우선
  if (task.description) return task.description.slice(0, 500);

  if (!task.prompt) return '';

  // 2. 프롬프트에서 추출
  const cleaned = task.prompt
    .replace(/^(ultrathink|think|<thinking>.*?<\/thinking>)\s*/gi, '') // ultrathink 제거
    .replace(/^```[\s\S]*?```\s*/m, '')  // 코드블록 제거
    .trim();

  // 줄 단위로 분리, 빈 줄/지시어 줄 건너뜀
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // 의미있는 줄 수집 (URL/마크다운 기호 제외, 최대 5줄 혹은 300자)
  const meaningful: string[] = [];
  for (const line of lines) {
    if (line.length < 5) continue;
    if (/^(http|#|\*|-)/.test(line)) continue;
    meaningful.push(line);
    if (meaningful.join(' ').length >= 300) break;
  }

  if (!meaningful.length) return '';

  // 최대 4줄 합쳐서 반환 (400자 제한, 절단 없음)
  const result = meaningful.slice(0, 4).join(' ');
  return result.length > 400 ? result.slice(0, 400) : result;
}

// ── 로그 메시지에서 실제 출력 추출 ──────────────────────────────
function extractOutput(msg: string): string {
  // "SUCCESS (duration=Xs)" → duration만 추출
  // "REGRESSION: ..." → 실제 내용
  // "OK — no output ..." → 빈 결과 안내
  if (!msg) return '';
  // duration 추출
  const durMatch = msg.match(/duration=(\d+s)/);
  const dur = durMatch ? durMatch[1] : '';

  // REGRESSION/결과 내용 추출
  const regrMatch = msg.match(/REGRESSION:\s*(.+)/);
  if (regrMatch) return `📊 ${regrMatch[1].trim()}`.slice(0, 150);

  // OK — no output
  if (/no output.*allowEmptyResult=true/.test(msg)) return '조건 미충족 — 실행 건너뜀';

  // 일반 성공 메시지
  const cleaned = msg
    .replace(/\b(SUCCESS|DONE|FAILED|START(ED)?|RUNNING)\b/g, '')
    .replace(/\(duration=\d+s\)/g, '')
    .replace(/\(\d+s\)/g, '')
    .trim();

  if (cleaned && cleaned.length > 3) {
    return dur ? `${cleaned} (${dur})` : cleaned;
  }
  return dur ? `완료 ${dur}` : '';
}

// ── 로그 파싱 (task별 최신 상태) ─────────────────────────────────
interface LastRun {
  status: CronStatus;
  timestamp: string;
  message: string;
  duration: string;
}

// 최근 실행 이력 (최대 N건) 포함하는 Map
function parseLatestRuns(): Map<string, { latest: LastRun; history: RecentRun[] }> {
  const result = new Map<string, { latest: LastRun; history: RecentRun[] }>();
  let raw = '';
  try {
    raw = readFileSync(CRON_LOG, 'utf8');
  } catch {
    return result;
  }

  const lines = raw.split('\n').filter(Boolean);
  // 최근 5000줄로 늘려 이력 확보
  const recent = lines.slice(-5000);
  const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
  const SKIP_TASK_RE = /^task_[0-9]+_/;

  // 역순 순회로 최신부터 수집
  for (let i = recent.length - 1; i >= 0; i--) {
    const line = recent[i];
    const m = line.match(LOG_RE);
    if (!m) continue;
    const [, ts, task, msg] = m;
    if (SKIP_TASK_RE.test(task)) continue;

    let status: CronStatus = 'unknown';
    if (/\bDONE\b|\bSUCCESS\b/.test(line)) status = 'success';
    else if (/\bSKIPPED\b/.test(line)) status = 'skipped';
    else if (/FAILED|ERROR|CRITICAL/.test(line)) status = 'failed';
    else if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) status = 'running';

    if (status === 'unknown') continue;

    const durMatch = msg.match(/duration=(\d+s)/);
    const run: RecentRun = { status, timestamp: ts, message: msg.slice(0, 200) };
    const latestRun: LastRun = { status, timestamp: ts, message: msg.slice(0, 200), duration: durMatch?.[1] || '' };
    const entry = result.get(task);
    if (!entry) {
      result.set(task, { latest: latestRun, history: [run] });
    } else if (entry.history.length < 7) {
      entry.history.push(run);
    }
  }
  return result;
}

// ── 메인 ─────────────────────────────────────────────────────────
function buildCrons(): CronsResponse {
  let tasksData: { tasks: TaskDef[] } = { tasks: [] };
  try {
    tasksData = JSON.parse(readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    // empty
  }
  const allTasks = tasksData.tasks || [];
  const scheduled = allTasks.filter(t => t.enabled !== false && t.schedule);
  const runs = parseLatestRuns();

  const crons: CronItem[] = scheduled.map(task => {
    const team = classifyTeam(task.id);
    const entry = runs.get(task.id);
    const last = entry?.latest;
    const schedule = task.schedule || '';
    return {
      id: task.id,
      name: task.name || task.id,
      description: extractDescription(task),
      schedule,
      scheduleHuman: cronToHuman(schedule),
      status: last?.status || 'unknown',
      lastRun: last ? last.timestamp : null,
      lastResult: last?.status || '',
      lastMessage: last?.message || '',
      lastDuration: (last as LastRun | undefined)?.duration || '',
      outputSummary: extractOutput(last?.message || ''),
      nextRun: nextRunTime(schedule),
      team: team.label,
      teamEmoji: team.emoji,
      priority: task.priority || 'normal',
      hasLLM: !!task.prompt,
      hasScript: !!task.script,
      recentRuns: entry?.history || [],
    };
  });

  return {
    crons,
    total: crons.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }
  const data = buildCrons();
  cache = { data, ts: Date.now() };
  return NextResponse.json({ ...data, cached: false });
}
