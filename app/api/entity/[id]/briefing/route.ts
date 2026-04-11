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

function taskDisplayName(taskId: string): string {
  return TASK_NAMES[taskId] || taskId;
}

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
    type: 'team-lead', name: 'CEO (이정우)', title: '대표 · 전체 운영 총괄',
    avatar: '👔', keywords: ['board-meeting', 'ceo-daily-digest', 'council'],
    discordChannel: 'jarvis-ceo', schedule: '매일 08:10, 21:55',
  },
  'infra-lead': {
    type: 'team-lead', name: '인프라팀 · 박태성', title: '서버·봇·크론 관리',
    avatar: '⚙️', keywords: ['infra-daily', 'system-doctor', 'health', 'disk', 'glances', 'scorecard', 'aggregate-metrics'],
    discordChannel: 'jarvis-system', schedule: '매일 09:00',
  },
  'trend-lead': {
    type: 'team-lead', name: '정보팀 · 강나연', title: '뉴스·시장·기술 트렌드 분석',
    avatar: '📡', keywords: ['trend', 'market-alert', 'news', 'tqqq', 'stock', 'macro', 'calendar-alert', 'github-monitor'],
    discordChannel: 'jarvis', schedule: '평일 07:30',
  },
  'record-lead': {
    type: 'team-lead', name: '기록팀 · 한소희', title: '일일 기록·RAG 아카이빙',
    avatar: '🗄️', keywords: ['record-daily', 'memory', 'session-sum', 'compact', 'rag-index'],
    discordChannel: 'jarvis-system', schedule: '매일 22:30',
  },
  'career-lead': {
    type: 'team-lead', name: '커리어팀 · 김서연', title: '채용·면접·커리어 전략',
    avatar: '🚀', keywords: ['career', 'commitment', 'growth', 'job', 'resume', 'interview'],
    discordChannel: 'jarvis-ceo', schedule: '매주 금 18:00',
  },
  'brand-lead': {
    type: 'team-lead', name: '브랜드팀 · 정하은', title: 'OSS·블로그·콘텐츠 전략',
    avatar: '📣', keywords: ['brand', 'openclaw', 'blog', 'oss', 'github-star'],
    discordChannel: 'jarvis-blog', schedule: '매주 화 08:00',
  },
  'audit-lead': {
    type: 'team-lead', name: '감사팀 · 류태환', title: '품질·감사·E2E 테스트',
    avatar: '🔍', keywords: ['audit', 'cron-failure', 'kpi', 'e2e', 'regression', 'doc-sync'],
    discordChannel: 'jarvis-system', schedule: '매일 23:00',
  },
  'academy-lead': {
    type: 'team-lead', name: '학습팀 · 신유진', title: '학습 큐레이션·스터디',
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

function toRichActivity(entry: CronEntry): RichActivity {
  const timeOnly = entry.time.includes(' ') ? entry.time.split(' ')[1].slice(0, 5) : entry.time;
  const name = taskDisplayName(entry.task);
  const icon = resultIcon(entry.result);
  const label = entry.result === 'SUCCESS' ? '완료' : entry.result === 'FAILED' ? '실패' : resultLabel(entry.result);

  let description = `${name} — ${label}`;
  // 특정 태스크에 대한 풍부한 설명 추가
  if (entry.task === 'disk-alert' && entry.result === 'SUCCESS') {
    const disk = getDiskUsage();
    description = `디스크 ${disk.percent}% 사용중, 정상`;
  } else if (entry.task === 'system-health' && entry.result === 'SUCCESS') {
    description = '시스템 헬스 체크 완료, 이상 없음';
  } else if (entry.task === 'system-doctor' && entry.result === 'SUCCESS') {
    description = '시스템 종합 점검 완료, 정상';
  } else if (entry.task === 'infra-daily' && entry.result === 'SUCCESS') {
    description = '인프라 일일 점검 정상 완료';
  } else if (entry.task === 'morning-standup' && entry.result === 'SUCCESS') {
    description = '모닝 브리핑 전송 완료';
  } else if (entry.task === 'record-daily' && entry.result === 'SUCCESS') {
    description = '일일 기록 정리 및 아카이빙 완료';
  } else if (entry.task === 'council-insight' && entry.result === 'SUCCESS') {
    description = '경영 점검 보고서 작성 완료';
  } else if (entry.result === 'FAILED') {
    const msgBrief = entry.message.slice(0, 60).replace(/^(FAILED|ERROR)[:\s]*/i, '');
    description = `${name} 실패${msgBrief ? ' — ' + msgBrief : ''}`;
  }

  return { time: timeOnly, task: name, result: resultLabel(entry.result), description, icon };
}

// ── 팀별 맞춤 요약 생성 ──────────────────────────────────────────────────────

function buildTeamSummary(id: string, stats: { total: number; success: number; failed: number; rate: number }): string {
  if (stats.total === 0) return '오늘 실행된 작업이 없습니다.';

  const disk = getDiskUsage();
  const bot = getDiscordBotStatus();

  switch (id) {
    case 'ceo': {
      const failedNames = getFailedTaskNames(['board-meeting', 'ceo-daily-digest', 'council']);
      if (stats.failed === 0) {
        return `오늘 이사회와 경영 점검이 정상 진행되었습니다. ${stats.success}건 완료.`;
      }
      return `오늘 ${stats.total}건 중 ${stats.failed}건 실패. 실패 항목: ${failedNames.map(taskDisplayName).join(', ')}`;
    }
    case 'infra-lead': {
      const parts: string[] = [];
      parts.push(disk.percent > 0 ? `디스크 ${disk.percent}% 사용중` : '디스크 정보 없음');
      parts.push(bot.running ? `봇 실행중 (PID ${bot.pid})` : '봇 미실행 — 확인 필요');
      if (stats.failed > 0) {
        const failedNames = getFailedTaskNames(['infra-daily', 'system-doctor', 'health', 'disk', 'glances', 'scorecard']);
        parts.push(`크론 ${stats.failed}건 실패: ${failedNames.map(taskDisplayName).join(', ')}`);
      } else {
        parts.push(`크론 ${stats.success}건 모두 성공`);
      }
      return parts.join(', ');
    }
    case 'trend-lead': {
      if (stats.failed === 0) {
        return `오늘 시장·트렌드 분석 ${stats.success}건 완료. 모두 정상 전송되었습니다.`;
      }
      const failedNames = getFailedTaskNames(['trend', 'market-alert', 'news', 'tqqq', 'stock', 'macro']);
      return `${stats.success}건 완료, ${stats.failed}건 실패 (${failedNames.map(taskDisplayName).join(', ')})`;
    }
    case 'record-lead': {
      if (stats.failed === 0) {
        return `오늘 기록 정리 및 아카이빙 ${stats.success}건 완료. 정상입니다.`;
      }
      return `기록 작업 ${stats.success}건 완료, ${stats.failed}건 실패. 확인이 필요합니다.`;
    }
    case 'career-lead': {
      if (stats.total === 0) return '이번 주 커리어 분석 작업이 아직 없습니다.';
      if (stats.failed === 0) return `커리어 관련 작업 ${stats.success}건 완료. 정상입니다.`;
      return `커리어 작업 ${stats.failed}건 실패. 확인이 필요합니다.`;
    }
    case 'brand-lead': {
      if (stats.total === 0) return '이번 주 브랜드 작업이 아직 없습니다.';
      if (stats.failed === 0) return `브랜드·콘텐츠 작업 ${stats.success}건 완료. 정상입니다.`;
      return `브랜드 작업 ${stats.failed}건 실패. 확인이 필요합니다.`;
    }
    case 'audit-lead': {
      const cbs = getCircuitBreakerStatus();
      const parts: string[] = [];
      if (stats.failed === 0) {
        parts.push(`감사·품질 점검 ${stats.success}건 모두 정상`);
      } else {
        parts.push(`${stats.failed}건 실패 발견`);
      }
      if (cbs.length > 0) {
        parts.push(`서킷 브레이커 ${cbs.length}건 격리중`);
      }
      return parts.join(', ');
    }
    case 'academy-lead': {
      if (stats.total === 0) return '이번 주 학습 작업이 아직 없습니다.';
      if (stats.failed === 0) return `학습 지원 작업 ${stats.success}건 완료. 정상입니다.`;
      return `학습 작업 ${stats.failed}건 실패. 확인이 필요합니다.`;
    }
    default: {
      if (stats.failed === 0) return `오늘 ${stats.success}건 작업 모두 정상 완료되었습니다.`;
      return `오늘 ${stats.total}건 중 ${stats.failed}건 실패. 확인이 필요합니다.`;
    }
  }
}

// ── 브리핑 빌더 ──────────────────────────────────────────────────────────────

function buildTeamLeadBriefing(id: string, entity: TeamLeadEntity) {
  const stats = getCronStats24h(entity.keywords);
  const recentRaw = parseCronLog(entity.keywords, 10);
  const recentActivity = recentRaw.map(toRichActivity);
  const upcoming = getUpcomingTasks(entity.keywords);
  const boardMinutes = getLatestBoardMinutes(entity.keywords);
  const status = getStatusColor(stats.rate);
  const summary = buildTeamSummary(id, stats);

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
      const recentRaw = parseCronLog([], 10);
      const recentEvents = recentRaw.map(toRichActivity);
      const failedNames = getFailedTaskNames([]);
      const failedDisplay = failedNames.slice(0, 10).map(taskDisplayName);

      let summary: string;
      if (stats.total === 0) {
        summary = '오늘 실행된 작업이 없습니다.';
      } else if (stats.failed === 0) {
        summary = `자동 작업 스케줄러: 오늘 ${stats.total}개 작업 실행, 모두 성공했습니다.`;
      } else {
        summary = `자동 작업 스케줄러: 오늘 ${stats.total}개 작업 실행, ${stats.success}개 성공, ${stats.failed}개 실패. 실패 작업: ${failedDisplay.join(', ')}`;
      }

      const healthAssessment = stats.rate >= 95
        ? '전체적으로 안정적입니다.'
        : stats.rate >= 80
          ? '일부 실패가 있지만 대부분 정상 동작중입니다.'
          : stats.rate >= 60
            ? '실패율이 높습니다. 원인 파악이 필요합니다.'
            : '심각한 상태입니다. 즉시 점검이 필요합니다.';

      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: getStatusColor(stats.rate),
        summary,
        healthAssessment,
        currentValue: { ...stats, failedTasks: failedDisplay },
        recentEvents,
        alerts: stats.failed > 5 ? [`실패 ${stats.failed}건 — 점검 필요`] : [],
      };
    }
    case 'discord-bot': {
      const bot = getDiscordBotStatus();
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: bot.running ? 'GREEN' as const : 'RED' as const,
        summary: bot.running
          ? `Discord 봇이 정상 실행중입니다 (PID ${bot.pid}). 24시간 대화 가능 상태.`
          : 'Discord 봇 프로세스가 감지되지 않습니다. 재시작이 필요합니다.',
        currentValue: bot,
        recentEvents: [],
        alerts: bot.running ? [] : ['봇 프로세스 미감지 — 재시작 필요'],
      };
    }
    case 'disk-storage': {
      const disk = getDiskUsage();
      let summary: string;
      if (disk.percent >= 90) {
        summary = `디스크 용량 위험! ${disk.percent}% 사용중 (${disk.used} / ${disk.total}). 즉시 정리가 필요합니다.`;
      } else if (disk.percent >= 80) {
        summary = `디스크 ${disk.percent}% 사용중 (${disk.used} / ${disk.total}). 여유 공간이 줄어들고 있습니다.`;
      } else {
        summary = `디스크 ${disk.percent}% 사용중 (${disk.used} / ${disk.total}). 여유 있습니다.`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: disk.percent >= 90 ? 'RED' as const : disk.percent >= 80 ? 'YELLOW' as const : 'GREEN' as const,
        summary,
        currentValue: disk,
        recentEvents: [],
        alerts: disk.percent >= 90 ? [`디스크 ${disk.percent}% — 즉시 정리 필요`] : [],
      };
    }
    case 'circuit-breaker': {
      const cbs = getCircuitBreakerStatus();
      let summary: string;
      if (cbs.length === 0) {
        summary = '격리된 태스크가 없습니다. 모든 작업이 정상 실행중입니다.';
      } else {
        const names = cbs.map(cb => `${cb.taskKo} (${cb.failures}회 실패)`).join(', ');
        summary = `${cbs.length}건의 태스크가 격리 상태입니다: ${names}`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: cbs.length > 0 ? 'YELLOW' as const : 'GREEN' as const,
        summary,
        currentValue: { openCount: cbs.length, items: cbs },
        recentEvents: [],
        alerts: cbs.map(cb => `${cb.taskKo}: ${cb.failures}회 연속 실패로 격리됨`),
      };
    }
    case 'rag-memory': {
      const ragLog = readSafe(path.join(JARVIS, 'logs', 'rag-index.log')).split('\n').filter(Boolean).slice(-5);
      let summary: string;
      if (ragLog.length > 0) {
        summary = `RAG 장기기억이 정상 동작중입니다. 최근 ${ragLog.length}건 인덱싱 완료.`;
      } else {
        summary = '최근 인덱싱 기록이 없습니다.';
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
        summary = '최근 개발 태스크 실행 기록이 없습니다.';
      } else if (failedCount === 0) {
        summary = `최근 개발 태스크 ${recentRaw.length}건 모두 정상 처리되었습니다.`;
      } else {
        summary = `최근 개발 태스크 ${recentRaw.length}건 중 ${failedCount}건 실패. 자비스 코더 점검이 필요합니다.`;
      }
      return {
        type: 'system-metric', id, name: entity.name, icon: entity.icon,
        description: entity.description,
        status: devStatus,
        summary,
        currentValue: { recentCount: recentRaw.length, failedCount },
        recentEvents: recent,
        alerts: failedCount > 0 ? [`최근 ${failedCount}건 실패 — 자비스 코더 점검 필요`] : [],
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
