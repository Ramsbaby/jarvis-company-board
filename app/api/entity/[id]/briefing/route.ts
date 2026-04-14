export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';
import { GET as presidentBriefingGET } from '@/app/api/president/briefing/route';
import { GET as standupBriefingGET } from '@/app/api/standup/briefing/route';
import { GET as financeBriefingGET } from '@/app/api/finance/briefing/route';
import { GET as libraryBriefingGET } from '@/app/api/library/briefing/route';
import { TEAM_REGISTRY, type TeamEntityDef } from '@/lib/map/team-registry';
import { getBriefingSystemMetrics, getDiskUsage as getDiskUsageShared } from '@/lib/map/system-metrics';
import { computeCronStats24h } from '@/lib/map/cron-stats';
import { parseCronLog as parseCronLogShared } from '@/lib/map/cron-log-parser';
import {
  CRON_LOG, TASKS_JSON as TASKS_FILE,
  BOARD_MINUTES_DIR, CIRCUIT_BREAKER_DIR as CB_DIR,
  RAG_INDEX_LOG,
} from '@/lib/jarvis-paths';

// ── 태스크 이름 한국어 매핑 ──────────────────────────────────────────────────

const TASK_NAMES: Record<string, string> = {
  'disk-alert': '디스크 용량 점검',
  'system-doctor': '시스템 종합 점검',
  'system-health': '시스템 헬스 체크',
  'infra-daily': '인프라 일일 점검',
  'news-briefing': '뉴스 브리핑',
  'market-alert': '시장 동향 알림',
  'tqqq-monitor': 'TQQQ 모니터링',
  'morning-standup': '모닝 스탠드업',
  'record-daily': '일일 기록 정리',
  'board-meeting-am': '오전 이사회',
  'board-meeting-pm': '오후 이사회',
  'career-weekly': '커리어 주간 분석',
  'brand-weekly': '브랜드 주간 리포트',
  'academy-support': '학습 지원',
  'ceo-daily-digest': 'CEO 일일 요약',
  'cron-failure-tracker': '크론 실패 추적',
  'e2e-test': 'E2E 테스트',
  'scorecard-enforcer': '성과 카드 점검',
  'macro-briefing': '매크로 브리핑',
  'github-monitor': 'GitHub 모니터링',
  'council-insight': '경영 점검 (감사)',
  'daily-summary': '일일 요약',
  'schedule-coherence': '일정 정합성 점검',
  'memory-cleanup': '메모리 정리',
  'rate-limit-check': 'Rate Limit 체크',
  'update-usage-cache': 'Claude 사용량 캐시 갱신',
  'token-sync': '토큰 동기화',
  'weekly-kpi': '주간 KPI 리포트',
  'weekly-roi': '주간 ROI 집계',
  'connections-weekly-insight': 'Connections 주간 인사이트',
  'monthly-review': '월간 회고',
  'security-scan': '보안 스캔',
  'rag-health': 'RAG 건강 체크',
  'cost-monitor': '비용 모니터링',
  'calendar-alert': '일정 알림',
  'code-auditor': '코드 품질 감사',
  'doc-supervisor': '문서 시스템 감독',
  'doc-sync-auditor': '문서-코드 정합성 감사',
  'agent-batch-commit': '에이전트 산출물 커밋',
  'weekly-code-review': '주간 코드 리뷰',
  'memory-sync': '메모리 동기화',
  'dev-runner': '자율 개발 큐',
  'jarvis-coder': '자비스 코더',
  'bot-quality-check': '봇 응답 품질 분석',
  'auto-diagnose': '자동 실패 진단',
  'weekly-usage-stats': 'Discord 활용도 통계',
  'session-sync': '세션 동기화',
  'recon-weekly': '정보탐험 주간 리포트',
  'finance-monitor': '파이낸스 모니터링',
  'personal-schedule-daily': '개인 일정 브리핑',
  'bot-self-critique': '봇 자가 품질 점검',
  'memory-expire': '기억 만료 아카이브',
  'vault-sync': 'Vault 동기화',
  'vault-auto-link': 'Vault 자동 링크',
  'board-perf-review': '에이전트 성과 평가',
  'board-conclude': '보드 토론 결론',
  'board-topic-proposer': '토론 주제 제안',
  'private-sync': 'Private 레포 동기화',
  'log-cleanup': '로그 정리',
  'rag-bench': 'RAG 품질 측정',
  'cron-auditor': '크론 전체 점검',
  'gen-system-overview': '시스템 개요 생성',
  'stale-task-watcher': 'Stale 태스크 감지',
  'skill-eval': '스킬 자동 평가',
  'daily-usage-check': '일일 사용량 체크',
};

// tasks.json에서 name/description을 읽어 TASK_NAMES / FRIENDLY_SUCCESS 폴백으로 사용
// 5초 TTL 캐시 — 같은 리퀘스트 생명주기 동안은 한 번만 파싱
interface TaskJsonEntry { id: string; name?: string; description?: string }
let _taskMapCache: { loadedAt: number; names: Record<string, string>; desc: Record<string, string> } | null = null;
const TASKS_JSON_TTL_MS = 5000;

function loadTasksJsonMap(): { names: Record<string, string>; desc: Record<string, string> } {
  const now = Date.now();
  if (_taskMapCache && (now - _taskMapCache.loadedAt) < TASKS_JSON_TTL_MS) {
    return { names: _taskMapCache.names, desc: _taskMapCache.desc };
  }
  const names: Record<string, string> = {};
  const desc: Record<string, string> = {};
  try {
    const parsed = readJsonSafe<{ tasks?: TaskJsonEntry[] }>(TASKS_FILE, { tasks: [] });
    const list = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    for (const t of list) {
      if (!t || typeof t.id !== 'string') continue;
      if (typeof t.name === 'string' && t.name.trim()) names[t.id] = t.name.trim();
      if (typeof t.description === 'string' && t.description.trim()) desc[t.id] = t.description.trim();
    }
  } catch { /* fall through — 폴백은 정적 상수 */ }
  _taskMapCache = { loadedAt: now, names, desc };
  return { names, desc };
}

function taskDisplayName(taskId: string): string {
  const dyn = loadTasksJsonMap().names[taskId];
  if (dyn) return dyn;
  return TASK_NAMES[taskId] || taskId;
}

function taskFriendlyDescription(taskId: string): string | null {
  const dyn = loadTasksJsonMap().desc[taskId];
  return dyn || null;
}

// ── 엔티티 레지스트리 ────────────────────────────────────────────────────────

interface TeamLeadEntity extends TeamEntityDef {
  type: 'team-lead';
}

interface SystemMetricEntity extends TeamEntityDef {
  type: 'system-metric';
}

type EntityDef = TeamLeadEntity | SystemMetricEntity;

const ENTITIES: Record<string, EntityDef> = TEAM_REGISTRY as Record<string, EntityDef>;
// ^^^ SSoT: lib/map/team-registry.ts 가 모든 팀 정의의 단일 원본.
//     이 route 는 그 레지스트리에서 읽기만 한다. 새 팀 추가/분리 시
//     registry 만 수정하면 briefing + chat 양쪽이 자동 동기화된다.;

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
  // SSoT: lib/map/cron-log-parser.ts
  const raw = readSafe(CRON_LOG);
  const entries = parseCronLogShared(raw, keywords, { limit });
  // 기존 CronEntry 필드 호환을 위해 message 길이를 120자로 trim
  return entries.map(e => ({
    time: e.time,
    task: e.task,
    result: e.result,
    message: e.message.slice(0, 120),
  }));
}

function getCronStats24h(keywords: string[]): { total: number; success: number; failed: number; rate: number } {
  // SSoT: lib/map/cron-stats.ts
  const raw = readSafe(CRON_LOG);
  const s = computeCronStats24h(raw, keywords);
  return { total: s.total, success: s.success, failed: s.failed, rate: s.rate };
}

function getFailedTaskNames(keywords: string[]): string[] {
  const raw = readSafe(CRON_LOG);
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean).slice(-3000);
  const KST_OFFSET = 9 * 3600_000;
  const cutoff = new Date(Date.now() - 24 * 3600_000 + KST_OFFSET).toISOString().replace('T', ' ').slice(0, 19);
  const failed = new Set<string>();

  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\]/);
    if (!m || m[1] < cutoff) continue;
    if (/^task_\d+_/.test(m[2])) continue;
    const lower = m[2].toLowerCase();
    if (keywords.length > 0 && !keywords.some(kw => lower.includes(kw))) continue;
    if (/FAILED|ERROR|CRITICAL/.test(line)) {
      failed.add(m[2]);
    }
  }
  return Array.from(failed);
}

function getUpcomingTasks(keywords: string[]): Array<{ time: string; task: string; taskKo: string }> {
  interface TaskEntry { id: string; schedule?: string; disabled?: boolean; enabled?: boolean }
  interface TasksFile { tasks: TaskEntry[] }
  const file = readJsonSafe<TasksFile>(TASKS_FILE, { tasks: [] });
  const tasks = file.tasks;
  const upcoming: Array<{ time: string; task: string; taskKo: string }> = [];

  for (const t of tasks) {
    if (t.disabled || t.enabled === false) continue;
    const lower = (t.id || '').toLowerCase();
    if (keywords.length > 0 && !keywords.some(kw => lower.includes(kw))) continue;
    if (t.schedule) {
      upcoming.push({ time: t.schedule, task: t.id, taskKo: taskDisplayName(t.id) });
    }
  }
  return upcoming.slice(0, 5);
}

// 정규식 특수문자 이스케이프
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 키워드 → word-boundary 매칭 정규식.
// 한글은 \b가 먹지 않으므로 (영문/숫자 경계 + 한글 앞뒤에 구두점/공백/줄 경계) 2원 전략.
function buildKeywordRegex(kw: string): RegExp {
  const escaped = escapeRegExp(kw.toLowerCase());
  const isHangul = /[가-힣]/.test(kw);
  if (isHangul) {
    // 한글 키워드는 앞뒤가 영숫자/한글이 아닌 경계(또는 문자열 끝/구두점)여야 매칭
    return new RegExp(`(?:^|[^가-힣A-Za-z0-9])${escaped}(?=$|[^가-힣A-Za-z0-9])`, 'i');
  }
  // 영문 키워드는 표준 \b
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function getLatestBoardMinutes(teamKeywords: string[]): string | null {
  try {
    if (!existsSync(BOARD_MINUTES_DIR)) return null;
    const files = readdirSync(BOARD_MINUTES_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    const content = readFileSync(path.join(BOARD_MINUTES_DIR, files[0]), 'utf8');
    const lines = content.split('\n');
    const regexes = teamKeywords.map(buildKeywordRegex);
    const excerpts: string[] = [];
    for (let i = 0; i < lines.length && excerpts.length < 5; i++) {
      const lower = lines[i].toLowerCase();
      if (regexes.some(re => re.test(lower))) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 3);
        excerpts.push(lines.slice(start, end).join('\n'));
      }
    }
    return excerpts.length > 0 ? excerpts.join('\n---\n').slice(0, 500) : null;
  } catch { return null; }
}

function getCircuitBreakerStatus(): Array<{ task: string; taskKo: string; failures: number; cooldownUntil: string }> {
  try {
    if (!existsSync(CB_DIR)) return [];
    const files = readdirSync(CB_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const data = readJsonSafe<{ failures?: number; cooldownUntil?: string }>(path.join(CB_DIR, f), {});
      const taskId = f.replace('.json', '');
      return { task: taskId, taskKo: taskDisplayName(taskId), failures: data.failures || 0, cooldownUntil: data.cooldownUntil || '' };
    }).filter(cb => cb.failures >= 3);
  } catch { return []; }
}

function getDiskUsage(): { percent: number; used: string; total: string } {
  // SSoT: lib/map/system-metrics.ts
  return getDiskUsageShared();
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

// ── 결과 아이콘 ──────────────────────────────────────────────────────────────

function resultIcon(result: string): string {
  switch (result) {
    case 'SUCCESS': return '💚';
    case 'FAILED': return '🔴';
    case 'SKIPPED': return '⏭️';
    case 'RUNNING': return '🔄';
    default: return '⚪';
  }
}

function resultLabel(result: string): string {
  switch (result) {
    case 'SUCCESS': return 'success';
    case 'FAILED': return 'failed';
    case 'SKIPPED': return 'skipped';
    case 'RUNNING': return 'running';
    default: return 'unknown';
  }
}

// ── recentActivity 변환 ─────────────────────────────────────────────────────

interface RichActivity {
  time: string;
  task: string;
  result: string;
  description: string;
  icon: string;
}

// 태스크별 성공 시 사람이 읽기 좋은 설명
const FRIENDLY_SUCCESS: Record<string, string | (() => string)> = {
  'disk-alert': () => { const d = getDiskUsage(); return `디스크 상태를 확인했어요. ${d.percent}% 사용중, 여유 있습니다.`; },
  'system-health': '시스템 전체 점검을 완료했어요. 이상 없음.',
  'system-doctor': '서버 종합 진단을 마쳤어요. 모두 정상입니다.',
  'infra-daily': '서버와 인프라 일일 점검을 마쳤어요. 정상 동작중.',
  'morning-standup': '오늘의 모닝 브리핑을 팀에 전송했어요.',
  'record-daily': '오늘 대화 기록을 정리하고 아카이빙했어요.',
  'council-insight': '경영 점검 보고서를 작성 완료했어요.',
  'board-meeting-am': '오전 이사회 회의를 진행했어요.',
  'board-meeting-pm': '오후 이사회 회의를 진행했어요.',
  'ceo-daily-digest': 'CEO 일일 요약 리포트를 전달했어요.',
  'news-briefing': '오늘의 주요 뉴스를 정리해서 브리핑했어요.',
  'market-alert': '시장 동향을 분석하고 알림을 보냈어요.',
  'tqqq-monitor': 'TQQQ 시세를 확인하고 모니터링했어요.',
  'e2e-test': '전체 시스템 자동 테스트를 통과했어요.',
  'rag-health': 'RAG 장기기억 시스템 상태를 점검했어요. 정상.',
  'cron-failure-tracker': '크론 실패 이력을 추적하고 정리했어요.',
  'scorecard-enforcer': '성과 카드를 점검했어요.',
  'calendar-alert': '오늘 일정 알림을 확인했어요.',
  'schedule-coherence': '일정 정합성을 확인했어요. 충돌 없음.',
  'memory-cleanup': '오래된 메모리를 정리했어요.',
  'token-sync': '토큰 동기화를 완료했어요.',
  'security-scan': '보안 스캔을 마쳤어요. 이상 없음.',
};

function toRichActivity(entry: CronEntry): RichActivity {
  const timeOnly = entry.time.includes(' ') ? entry.time.split(' ')[1].slice(0, 5) : entry.time;
  const name = taskDisplayName(entry.task);
  const icon = resultIcon(entry.result);

  let description: string;

  if (entry.result === 'SUCCESS') {
    const friendly = FRIENDLY_SUCCESS[entry.task];
    const dynDesc = taskFriendlyDescription(entry.task);
    if (typeof friendly === 'function') {
      description = friendly();
    } else if (friendly) {
      description = friendly;
    } else if (dynDesc) {
      description = dynDesc;
    } else {
      description = `${name}을(를) 완료했어요. 이상 없음.`;
    }
  } else if (entry.result === 'FAILED') {
    const msgBrief = entry.message.slice(0, 60).replace(/^(FAILED|ERROR)[:\s]*/i, '').trim();
    description = `${name}에서 문제가 발생했어요${msgBrief ? '. 원인: ' + msgBrief : '. 확인이 필요합니다.'}`;
  } else if (entry.result === 'SKIPPED') {
    description = `${name}은(는) 조건이 맞지 않아 건너뛰었어요.`;
  } else if (entry.result === 'RUNNING') {
    description = `${name}이(가) 진행중이에요.`;
  } else {
    description = `${name} 상태를 확인중이에요.`;
  }

  return { time: timeOnly, task: name, result: resultLabel(entry.result), description, icon };
}

// ── 팀별 맞춤 요약 생성 ──────────────────────────────────────────────────────

function buildTeamSummary(id: string, stats: { total: number; success: number; failed: number; rate: number }, keywords: string[]): string {
  if (stats.total === 0) {
    const upcoming = getUpcomingTasks(keywords);
    if (upcoming.length > 0) {
      return `오늘은 아직 실행된 작업이 없어요. 다음 예정: ${upcoming[0].taskKo} (${upcoming[0].time})`;
    }
    return '오늘은 아직 예정된 작업이 없어요.';
  }

  // SSoT: 모든 실패 태스크 이름은 호출자가 넘긴 `keywords` 기반으로 뽑는다.
  // 이전에는 각 case 안에서 하드코딩된 키워드 리스트를 재정의했는데,
  // 팀 분리(예: finance 분리) 후 업데이트가 누락되어 trend-lead 가
  // "대부분 완료했지만, 에서 문제가 있었어요." 처럼 빈 태스크 이름으로
  // 문장이 깨지는 버그가 발생했다. keywords 단일 소스만 쓰면 재발 불가.
  const failedNamesAll = stats.failed > 0
    ? getFailedTaskNames(keywords).map(taskDisplayName)
    : [];
  const failedDisplay = failedNamesAll.length > 0
    ? failedNamesAll.slice(0, 3).join(', ')
    : '';

  const disk = getDiskUsage();
  const bot = getDiscordBotStatus();

  switch (id) {
    case 'infra-lead': {
      const parts: string[] = [];
      if (disk.percent >= 90) {
        parts.push(`디스크가 ${disk.percent}%나 차서 정리가 시급해요`);
      } else if (disk.percent >= 80) {
        parts.push(`디스크 ${disk.percent}% 사용중, 여유가 줄고 있어요`);
      } else {
        parts.push(`디스크 ${disk.percent}% 사용중, 여유 있어요`);
      }
      parts.push(bot.running ? '봇은 정상 실행중' : '봇이 멈춰 있어요, 재시작이 필요해요');
      if (stats.failed > 0) {
        parts.push(failedDisplay
          ? `${failedDisplay}에서 문제가 생겼어요`
          : `${stats.failed}건에서 문제가 생겼어요 (세부 태스크 식별 불가)`);
      } else {
        parts.push('자동 점검은 모두 통과했어요');
      }
      return parts.join('. ') + '.';
    }

    case 'trend-lead': {
      if (stats.failed === 0) {
        return '오늘 트렌드·뉴스·GitHub 동향 분석을 모두 마쳤어요. 정상 전송됐습니다.';
      }
      return failedDisplay
        ? `대부분 완료했지만, ${failedDisplay}에서 문제가 있었어요.`
        : `오늘 ${stats.failed}건에서 문제가 있었어요. 세부 태스크는 크론 센터에서 확인 부탁드려요.`;
    }

    case 'record-lead': {
      if (stats.failed === 0) {
        return '오늘 대화 기록 정리와 아카이빙을 마쳤어요. 정상입니다.';
      }
      return failedDisplay
        ? `기록 정리 중 ${failedDisplay}에서 문제가 있었어요. 확인이 필요합니다.`
        : `기록 정리 중 ${stats.failed}건에서 문제가 있었어요. 확인이 필요합니다.`;
    }

    case 'brand-lead': {
      if (stats.failed === 0) return '브랜드와 콘텐츠 작업을 마쳤어요. 정상입니다.';
      return failedDisplay
        ? `브랜드 작업 중 ${failedDisplay}에서 문제가 있었어요.`
        : `브랜드 작업 중 ${stats.failed}건에서 문제가 있었어요.`;
    }

    case 'growth-lead': {
      if (stats.failed === 0) {
        return '커리어와 학습 관련 작업을 마쳤어요. 정상입니다.';
      }
      return failedDisplay
        ? `${failedDisplay}에서 문제가 있었어요. 확인이 필요합니다.`
        : `오늘 ${stats.failed}건에서 문제가 있었어요. 확인이 필요합니다.`;
    }

    case 'audit-lead': {
      const cbs = getCircuitBreakerStatus();
      const parts: string[] = [];
      if (stats.failed === 0) {
        parts.push('감사와 품질 점검을 마쳤어요. 모두 정상');
      } else {
        parts.push(failedDisplay
          ? `품질 점검 중 ${failedDisplay}에서 문제를 발견했어요`
          : `품질 점검 중 ${stats.failed}건에서 문제를 발견했어요`);
      }
      if (cbs.length > 0) {
        parts.push(`${cbs.length}개 작업이 반복 실패로 일시 중단됐어요`);
      }
      return parts.join('. ') + '.';
    }

    case 'secretary': {
      const parts: string[] = [];
      if (!bot.running) {
        parts.push('🚨 Discord 봇이 멈춰 있어요. 지금 즉시 재시작이 필요합니다');
      } else {
        parts.push(`Discord 봇 정상 작동 중 (PID ${bot.pid})`);
      }
      if (stats.total === 0) {
        parts.push('오늘 봇 품질 자가 점검 실행 이력은 아직 없어요');
      } else if (stats.failed === 0) {
        parts.push(`봇 품질 자가 점검 ${stats.total}건 모두 통과`);
      } else {
        parts.push(failedDisplay
          ? `${stats.failed}건에서 품질 이슈 발견 (${failedDisplay})`
          : `${stats.failed}건에서 품질 이슈 발견`);
      }
      parts.push('/ask, /logs, /brief 슬래시 명령으로 언제든 호출 가능');
      return parts.join('. ') + '.';
    }

    default: {
      if (stats.failed === 0) return '오늘 맡은 작업을 모두 마쳤어요. 정상입니다.';
      return failedDisplay
        ? `${failedDisplay}에서 문제가 있었어요 (${stats.failed}건). 확인이 필요합니다.`
        : `오늘 작업 중 ${stats.failed}건에서 문제가 있었어요. 확인이 필요합니다.`;
    }
  }
}

// ── 브리핑 빌더 ──────────────────────────────────────────────────────────────

function getCbsForKeywords(keywords: string[]): string[] {
  try {
    if (!existsSync(CB_DIR)) return [];
    const files = readdirSync(CB_DIR).filter(f => f.endsWith('.json'));
    const alerts: string[] = [];
    for (const f of files) {
      const taskId = f.replace('.json', '');
      if (!keywords.some(kw => taskId.includes(kw))) continue;
      try {
        const cb = JSON.parse(readFileSync(path.join(CB_DIR, f), 'utf8'));
        if (cb.state === 'OPEN' || (cb.failures && cb.failures >= 3)) {
          const name = taskDisplayName(taskId);
          alerts.push(`${name}: ${cb.failures || '?'}회 연속 실패로 일시 중단`);
        }
      } catch { /* skip */ }
    }
    return alerts;
  } catch { return []; }
}

function buildTeamLeadBriefing(id: string, entity: TeamLeadEntity) {
  const stats = getCronStats24h(entity.keywords);
  const recentRaw = parseCronLog(entity.keywords, 10);
  const recentActivity = recentRaw.map(toRichActivity);
  const upcoming = getUpcomingTasks(entity.keywords);
  const boardMinutes = getLatestBoardMinutes(entity.keywords);
  const status = getStatusColor(stats.rate);
  const summary = buildTeamSummary(id, stats, entity.keywords);

  const cbAlerts = getCbsForKeywords(entity.keywords);
  const failedTaskNames = getFailedTaskNames(entity.keywords).slice(0, 5).map(taskDisplayName);
  const alertsList = [
    ...cbAlerts,
    ...(stats.failed > 0 && failedTaskNames.length > 0 ? [`최근 실패: ${failedTaskNames.join(', ')}`] : []),
  ];

  // 구조화 시스템 메트릭 — 모든 팀장 브리핑에 공통 포함.
  // 이전에는 TeamBriefingPopup 이 summary 텍스트에서 regex 로 퍼센트를 파싱
  // 했는데 (`/디스크\s*(\d+)%/`) 메모리/CPU 는 summary 에 문자열로 없어서
  // 드릴다운이 디스크 한 종류만 떴다. 이제 구조화 필드로 항상 3종 제공.
  const systemMetrics = getBriefingSystemMetrics();

  return {
    type: 'team-lead',
    id,
    name: entity.name,
    title: entity.title,
    avatar: entity.avatar,
    status,
    schedule: entity.schedule,
    summary,
    recentActivity,
    stats: {
      total: stats.total,
      success: stats.total - stats.failed,
      failed: stats.failed,
      rate: stats.rate,
    },
    metrics: {
      cronSuccessRate: stats.rate,
      totalToday: stats.total,
      failedToday: stats.failed,
    },
    systemMetrics,
    alerts: alertsList,
    upcoming,
    lastBoardMinutes: boardMinutes,
    discordChannel: entity.discordChannel,
  };
}

function buildSystemMetricBriefing(id: string, entity: SystemMetricEntity) {
  switch (id) {
    case 'cron-engine': {
      const stats = getCronStats24h([]);
      const recentRaw = parseCronLog([], 10);
      const recentEvents = recentRaw.map(toRichActivity);
      const failedNames = getFailedTaskNames([]);
      const failedDisplay = failedNames.slice(0, 10).map(taskDisplayName);

      // 최근 성공한 작업 이름도 수집
      const successNames = recentRaw
        .filter(r => r.result === 'SUCCESS')
        .map(r => taskDisplayName(r.task))
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 5);

      let summary: string;
      if (stats.total === 0) {
        const upcoming = getUpcomingTasks([]);
        if (upcoming.length > 0) {
          summary = `오늘은 아직 실행된 작업이 없어요. 다음 예정: ${upcoming[0].taskKo} (${upcoming[0].time})`;
        } else {
          summary = '오늘은 아직 실행된 자동화 작업이 없어요.';
        }
      } else if (stats.failed === 0) {
        summary = `오늘 자동화 작업 ${stats.total}건을 모두 마쳤어요. 최근 완료: ${successNames.join(', ')}`;
      } else {
        summary = `오늘 ${stats.total}건 중 ${stats.failed}건에서 문제가 생겼어요. 실패: ${failedDisplay.join(', ')}`;
      }

      const healthAssessment = stats.rate >= 95
        ? '전체적으로 안정적이에요.'
        : stats.rate >= 80
          ? '일부 실패가 있지만 대부분 잘 돌아가고 있어요.'
          : stats.rate >= 60
            ? '실패가 좀 많아요. 원인을 살펴봐야 해요.'
            : '상태가 심각해요. 바로 점검이 필요합니다.';

      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: getStatusColor(stats.rate),
        summary,
        healthAssessment,
        currentValue: { ...stats, failedTasks: failedDisplay },
        recentEvents,
        alerts: stats.failed > 5 ? [`${stats.failed}건 실패 — 바로 점검이 필요해요`] : [],
      };
    }
    case 'discord-bot': {
      const bot = getDiscordBotStatus();
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: bot.running ? 'GREEN' as const : 'RED' as const,
        summary: bot.running
          ? '디스코드 봇이 잘 돌아가고 있어요. 언제든 대화할 수 있어요.'
          : '디스코드 봇이 멈춰 있어요. 재시작이 필요합니다.',
        currentValue: bot,
        recentEvents: [],
        alerts: bot.running ? [] : ['봇이 멈춰 있어요 — 재시작이 필요합니다'],
      };
    }
    case 'disk-storage': {
      const disk = getDiskUsage();
      let summary: string;
      if (disk.percent >= 90) {
        summary = `디스크가 거의 꽉 찼어요 (${disk.percent}%, ${disk.used}/${disk.total}). 지금 정리가 필요해요.`;
      } else if (disk.percent >= 80) {
        summary = `디스크 ${disk.percent}% 사용중이에요 (${disk.used}/${disk.total}). 여유가 줄고 있어요.`;
      } else {
        summary = `디스크 ${disk.percent}% 사용중이에요 (${disk.used}/${disk.total}). 넉넉해요.`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: disk.percent >= 90 ? 'RED' as const : disk.percent >= 80 ? 'YELLOW' as const : 'GREEN' as const,
        summary,
        currentValue: disk,
        recentEvents: [],
        alerts: disk.percent >= 90 ? [`디스크 ${disk.percent}% — 지금 정리가 필요해요`] : [],
      };
    }
    case 'circuit-breaker': {
      const cbs = getCircuitBreakerStatus();
      let summary: string;
      if (cbs.length === 0) {
        summary = '문제로 중단된 작업이 없어요. 모두 잘 돌아가고 있어요.';
      } else {
        const names = cbs.map(cb => `${cb.taskKo}(${cb.failures}회 실패)`).join(', ');
        summary = `${cbs.length}개 작업이 반복 실패로 일시 중단됐어요: ${names}`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: cbs.length > 0 ? 'YELLOW' as const : 'GREEN' as const,
        summary,
        currentValue: { openCount: cbs.length, items: cbs },
        recentEvents: [],
        alerts: cbs.map(cb => `${cb.taskKo}: ${cb.failures}회 연속 실패로 일시 중단`),
      };
    }
    case 'rag-memory': {
      const ragLog = readSafe(RAG_INDEX_LOG).split('\n').filter(Boolean).slice(-5);
      let summary: string;
      if (ragLog.length > 0) {
        summary = `장기기억 시스템이 잘 돌아가고 있어요. 최근 ${ragLog.length}건 기억을 저장했어요.`;
      } else {
        summary = '최근에 저장된 기억이 없어요.';
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: 'GREEN' as const,
        summary,
        currentValue: { recentLogs: ragLog.length },
        recentEvents: ragLog.map(l => ({
          time: l.slice(1, 20).includes(' ') ? l.slice(1, 20).split(' ')[1]?.slice(0, 5) || '' : '',
          task: 'RAG 인덱싱',
          result: 'success',
          description: l.slice(22, 100),
          icon: '💚',
        })),
        alerts: [],
      };
    }
    case 'dev-queue': {
      const recentRaw = parseCronLog(['dev-task', 'jarvis-coder'], 10);
      const recent = recentRaw.map(toRichActivity);
      const failedCount = recentRaw.filter(r => r.result === 'FAILED').length;
      const devStatus = failedCount > 2 ? 'RED' as const : failedCount > 0 ? 'YELLOW' as const : 'GREEN' as const;
      let summary: string;
      if (recentRaw.length === 0) {
        summary = '최근에 실행된 개발 작업이 없어요.';
      } else if (failedCount === 0) {
        summary = `최근 개발 작업 ${recentRaw.length}건을 모두 잘 처리했어요.`;
      } else {
        summary = `최근 개발 작업 ${recentRaw.length}건 중 ${failedCount}건에서 문제가 생겼어요. 코더를 점검해야 해요.`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: devStatus,
        summary,
        currentValue: { recentCount: recentRaw.length, failedCount },
        recentEvents: recent,
        alerts: failedCount > 0 ? [`최근 ${failedCount}건 실패 — 코더 점검이 필요해요`] : [],
      };
    }
    default:
      return { type: 'system-metric', id, name: entity.name, icon: entity.icon, status: 'GREEN', summary: '데이터 없음' };
  }
}

// ── Route Handler ────────────────────────────────────────────────────────────

const briefingCache: Record<string, { data: unknown; ts: number }> = {};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 전용 엔드포인트 위임 — 단순 cron 키워드 집계로는 불충분한 룸들
  if (id === 'president') return presidentBriefingGET();
  if (id === 'standup') return standupBriefingGET();
  if (id === 'finance') return financeBriefingGET();
  if (id === 'library') return libraryBriefingGET();

  const entity = ENTITIES[id];
  if (!entity) {
    return NextResponse.json({ error: `Unknown entity: ${id}` }, { status: 404 });
  }

  // 브리핑 캐시 (MAP_CACHE_TTL_MS, 기본 15s)
  const cached = briefingCache[id];
  if (cached && Date.now() - cached.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const data = entity.type === 'team-lead'
    ? buildTeamLeadBriefing(id, entity)
    : buildSystemMetricBriefing(id, entity);

  // 시스템 메트릭 엔티티에도 systemMetrics 를 추가해서 어느 방을 클릭하든
  // CEO 가 동일한 시스템 건강 지표(디스크/메모리/CPU) 드릴다운을 볼 수 있게 한다.
  if ((data as Record<string, unknown>).systemMetrics === undefined) {
    (data as Record<string, unknown>).systemMetrics = getBriefingSystemMetrics();
  }

  // 인프라팀 신임 팀장 KPI (이준혁 — 예방적 시스템 운영)
  if (id === 'infra-lead') {
    const infraStats = (data as ReturnType<typeof buildTeamLeadBriefing>).stats;
    const disk = getDiskUsage();
    const infra_daily_runs = parseCronLog(['infra-daily'], 7);
    const infraDailyTotal = infra_daily_runs.length;
    const infraDailySuccess = infra_daily_runs.filter(r => r.result === 'SUCCESS').length;
    const infraDailyRate = infraDailyTotal > 0 ? Math.round((infraDailySuccess / infraDailyTotal) * 100) : 100;
    (data as Record<string, unknown>).kpi = [
      { label: '크론 성공률', value: Math.round(infraStats?.rate ?? 0), target: 99, unit: '%', icon: '✅', direction: 'higher' },
      { label: '디스크 사용률', value: disk.percent, target: 80, unit: '%', icon: '💾', direction: 'lower' },
      { label: '자가진단 이행률', value: infraDailyRate, target: 100, unit: '%', icon: '🔍', direction: 'higher' },
      { label: 'MTTR 목표', value: 5, target: 5, unit: '분', icon: '⚡', direction: 'lower' },
    ];
  }

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
