export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, statSync, readdirSync } from 'fs';
import { CRON_LOG_LINE_RE, SKIP_TASK_RE } from '@/lib/map/cron-log-parser';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';
import { TASKS_JSON as TASKS_FILE, CRON_LOG, LOGS_DIR as LOG_DIR } from '@/lib/jarvis-paths';
const MAX_LOG_READ_BYTES = 8000;

let cache: { data: CronsResponse; ts: number } | null = null;

type CronStatus = 'success' | 'failed' | 'skipped' | 'running' | 'unknown';

interface TaskDef {
  id: string;
  name?: string;
  schedule?: string;
  enabled?: boolean;
  disabled?: boolean;
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
  disabled?: boolean;
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
  { id: 'infra', label: 'SRE실', emoji: '⚙️', keywords: ['disk', 'system-doctor', 'system-health', 'infra', 'sync-system-metrics', 'glances', 'aggregate-metrics', 'health', 'log-cleanup', 'memory-cleanup', 'rate-limit', 'update-usage-cache', 'token-sync', 'daily-usage-check', 'security-scan', 'scorecard-enforcer'] },
  // 전략기획실 — market/tqqq/finance 계열 재무실로 이관됨. 순수 트렌드/뉴스만
  { id: 'info', label: '전략기획실', emoji: '📡', keywords: ['news', 'trend', 'github-monitor', 'calendar-alert', 'recon'] },
  // 자료실 — 데이터실 업무 중 사용자 접근 레이어 (RAG 인덱스/벤치). 데이터실보다 먼저 매칭 필요
  { id: 'library', label: '자료실', emoji: '📖', keywords: ['rag-index', 'rag-bench'] },
  { id: 'record', label: '데이터실', emoji: '🗄️', keywords: ['record', 'memory', 'rag', 'session', 'vault', 'gen-system-overview'] },
  // 인재개발실 = 구 학습팀 + 구 커리어팀 통합 (면접 + 기술 학습)
  { id: 'growth', label: '인재개발실', emoji: '🌱', keywords: ['career', 'interview', 'commitment', 'job', 'resume', 'isg', 'growth', 'academy', 'learning', 'study', 'lecture'] },
  { id: 'brand', label: '마케팅실', emoji: '📣', keywords: ['brand', 'blog', 'oss', 'openclaw', 'github-star', 'stars'] },
  { id: 'audit', label: 'QA실', emoji: '🔍', keywords: ['audit', 'e2e', 'cron-failure', 'regression', 'doc-sync', 'doc-supervisor', 'code-auditor', 'cron-auditor', 'stale-task', 'kpi', 'roi', 'bot-quality', 'bot-self-critique', 'auto-diagnose', 'skill-eval'] },
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
  // cron.log 전체(2MB+) 대신 마지막 500KB만 읽어 파싱 시간 단축
  const raw = safeReadTail(CRON_LOG, 500_000);
  if (!raw) return result;

  const lines = raw.split('\n').filter(Boolean);
  // 최근 5000줄로 늘려 이력 확보
  const recent = lines.slice(-5000);
  // SSoT: lib/map/cron-log-parser.ts 가 라인 정규식과 스킵 패턴을 보유.
  // 이 함수는 "역순 + 태스크별 이력 누적" 이 고유 로직이라 직접 해석이 필요함.

  // 역순 순회로 최신부터 수집
  for (let i = recent.length - 1; i >= 0; i--) {
    const line = recent[i];
    const m = line.match(CRON_LOG_LINE_RE);
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

// ── 개별 로그 파일 폴백 ───────────────────────────────────────────
// 중앙 cron.log에 기록되지 않는 태스크(약 24개)가 있다. 이들은 태스크별
// 독립 로그(`~/.jarvis/logs/{id}.log` + `{id}-err.log`)에 기록된다.
// parseLatestRuns()가 놓친 태스크에 한해 개별 로그 파일의 mtime/내용을
// 읽어 상태를 보강한다. 실패한 태스크는 stderr 꼬리를 lastMessage로 노출.
function formatKstTimestamp(d: Date): string {
  // KST = UTC+9 — Intl API 사용해 "YYYY-MM-DD HH:mm:ss" 형식 생성
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
  } catch {
    // Fallback: 수동 +9h
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function safeStat(p: string): { size: number; mtime: Date } | null {
  try {
    const s = statSync(p);
    return { size: s.size, mtime: s.mtime };
  } catch {
    return null;
  }
}

function safeReadTail(p: string, maxBytes: number = MAX_LOG_READ_BYTES): string {
  try {
    const raw = readFileSync(p, 'utf8');
    if (raw.length <= maxBytes) return raw;
    return raw.slice(raw.length - maxBytes);
  } catch {
    return '';
  }
}

function buildFallbackFromIndividualLogs(taskId: string, logDirFiles?: string[]): LastRun | null {
  const outPath = path.join(LOG_DIR, `${taskId}.log`);
  const errPath = path.join(LOG_DIR, `${taskId}-err.log`);
  const outStat = safeStat(outPath);
  const errStat = safeStat(errPath);

  const outUsable = outStat && outStat.size > 0;
  const errUsable = errStat && errStat.size > 0;
  // 3차: LLM 전용 태스크는 `claude-stderr-{id}-YYYY-MM-DD.log` 를 쓴다.
  const claudeStderr = readStderrExcerpt(taskId, logDirFiles);

  // 아무 로그도 없고 claude-stderr 도 없음 → 실행된 적 없음
  if (!outUsable && !errUsable && !claudeStderr) return null;

  const now = Date.now();
  const DAY_MS = 24 * 3600 * 1000;

  // 분기 1: err 로그가 "최근" 이거나 "out 로그보다 새로움" → failed
  //   - err-log 가 24h 이내면 명확히 현재 실패 상태
  //   - err-log 가 24h 이상이더라도 out-log 가 0-byte 이거나 err-log 보다
  //     오래되었다면 "여태 한 번도 성공 못 한 실패" 로 봐야 한다
  //     (예: rag-bench — out=0B/Mar29, err=2KB/Apr12 → 계속 실패 중)
  const errMs = errStat ? errStat.mtime.getTime() : 0;
  const outMs = outStat ? outStat.mtime.getTime() : 0;
  const errIsRecent = errUsable && now - errMs < DAY_MS;
  const errDominates = errUsable && (!outUsable || errMs >= outMs);

  if (errIsRecent || errDominates || claudeStderr) {
    const tail = errUsable ? safeReadTail(errPath, 500).trim().slice(-400) : '';
    const stderr = tail || claudeStderr;
    const refMs = errUsable ? errMs : (claudeStderr ? now : outMs);
    const ageH = Math.round((now - refMs) / 3600_000);
    const staleSuffix = ageH > 24 ? ` · ${ageH}h 이전 (stale)` : '';
    return {
      status: 'failed',
      timestamp: formatKstTimestamp(new Date(refMs)),
      message: (stderr ? `stderr: ${stderr}` : '실패 감지 (개별 로그)') + staleSuffix,
      duration: '',
    };
  }

  // 분기 2: out 로그 존재 → success 추정
  //   age 가 상당한 경우에도 lastRun 은 그대로 노출해서 CEO 가 "이거 10일째
  //   안 돌았네" 를 바로 알아챌 수 있게 한다. 단 age 가 극단적이면 status 는
  //   unknown 으로 낮춰서 grid 정렬상 상단 경고로 뜨도록.
  if (outUsable) {
    const ageH = Math.round((now - outMs) / 3600_000);
    // 극단적 stale (7일 초과) → 계속 unknown 유지. 하지만 timestamp 는 보여줌.
    if (ageH > 24 * 7) {
      return {
        status: 'unknown',
        timestamp: formatKstTimestamp(new Date(outMs)),
        message: `마지막 실행: ${ageH}h 이전 — 장기 미실행 (확인 필요)`,
        duration: '',
      };
    }
    const staleSuffix = ageH > 24 ? ` · ${ageH}h 이전` : '';
    return {
      status: 'success',
      timestamp: formatKstTimestamp(new Date(outMs)),
      message: '최근 실행 감지 (개별 로그)' + staleSuffix,
      duration: '',
    };
  }

  return null;
}

// 실패한 태스크의 stderr 꼬리를 읽어 lastMessage/outputSummary 보강
// logDir 파일 목록을 buildCrons() 에서 1회만 읽어 전달 — readdirSync 반복 호출 방지
function readStderrExcerpt(taskId: string, logDirFiles?: string[]): string {
  // 1차: 전용 -err.log (대부분의 script 태스크 — 재시작 스크립트가 2> 로 리다이렉트)
  const errPath = path.join(LOG_DIR, `${taskId}-err.log`);
  const stat = safeStat(errPath);
  if (stat && stat.size > 0) {
    const tail = safeReadTail(errPath, 500);
    if (tail.trim()) return tail.trim().slice(-400);
  }

  // 2차: LLM 태스크는 ask-claude.sh 가 날짜별로 분리된 claude-stderr 로그를 쓴다.
  //   파일명: claude-stderr-<taskId>-<YYYY-MM-DD>.log 또는 claude-stderr-<taskId>.log
  //   logDirFiles 가 전달된 경우(buildCrons 경로) 재사용 — readdirSync 중복 방지.
  try {
    const allFiles = logDirFiles ?? readdirSync(LOG_DIR);
    const files = allFiles.filter((f) =>
      f.startsWith(`claude-stderr-${taskId}`) && f.endsWith('.log'),
    );
    if (files.length === 0) return '';
    const sorted = files
      .map((f) => ({ f, m: safeStat(path.join(LOG_DIR, f))?.mtime.getTime() ?? 0 }))
      .sort((a, b) => b.m - a.m);
    const latest = sorted[0];
    if (!latest || latest.m === 0) return '';
    if (Date.now() - latest.m > 48 * 3600_000) return '';
    const tail = safeReadTail(path.join(LOG_DIR, latest.f), 500);
    return tail.trim().slice(-400);
  } catch {
    return '';
  }
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
  // disabled 크론도 목록에 포함 (UI에서 토글 가능하도록)
  const scheduled = allTasks.filter(t => !!t.schedule);
  const runs = parseLatestRuns();
  // 로그 디렉토리 목록을 1회만 읽어 각 태스크 처리에 재사용 — readdirSync O(n) 방지
  let logDirFiles: string[] | undefined;
  try { logDirFiles = readdirSync(LOG_DIR); } catch { /* ignore */ }

  const crons: CronItem[] = scheduled.map(task => {
    const team = classifyTeam(task.id);
    const entry = runs.get(task.id);
    let last: LastRun | undefined = entry?.latest;
    const schedule = task.schedule || '';

    // Fallback 1: 중앙 cron.log에 없으면 개별 로그 파일에서 mtime/내용으로 추론
    if (!last) {
      const fb = buildFallbackFromIndividualLogs(task.id, logDirFiles);
      if (fb) {
        last = fb;
      }
    }

    // Fallback 2: status==='failed' 이면 stderr 꼬리를 읽어 lastMessage 보강
    //   (중앙 log에서 "FAILED (exit: 1)"만 나오는 경우 실제 원인 노출)
    let lastMessage = last?.message || '';
    let outputSummary = extractOutput(last?.message || '');
    if (last?.status === 'failed') {
      const stderrExcerpt = readStderrExcerpt(task.id, logDirFiles);
      if (stderrExcerpt) {
        // 이미 fallback에서 stderr 포함되었을 수 있으므로 중복 방지
        if (!lastMessage.includes(stderrExcerpt.slice(0, 60))) {
          lastMessage = `${lastMessage} | stderr: ${stderrExcerpt}`.slice(0, 600);
        }
        outputSummary = `stderr: ${stderrExcerpt}`.slice(0, 300);
      }
    }

    return {
      id: task.id,
      name: task.name || task.id,
      description: extractDescription(task),
      schedule,
      scheduleHuman: cronToHuman(schedule),
      status: last?.status || 'unknown',
      lastRun: last ? last.timestamp : null,
      lastResult: last?.status || '',
      lastMessage,
      lastDuration: last?.duration || '',
      outputSummary,
      nextRun: nextRunTime(schedule),
      team: team.label,
      teamEmoji: team.emoji,
      priority: task.priority || 'normal',
      hasLLM: !!task.prompt,
      hasScript: !!task.script,
      disabled: !!task.disabled,
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
