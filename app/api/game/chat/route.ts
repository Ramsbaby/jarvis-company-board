export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { execFileSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { checkAndConsume, getKey } from '@/lib/rate-limit';
import { recordCost, getTodayCost, getDailyCap, GROQ_LLAMA_70B } from '@/lib/chat-cost';
import Anthropic from '@anthropic-ai/sdk';
import { CHAT_CONTEXT_TTL_MS } from '@/lib/cache-config';
import { TEAM_REGISTRY, TEAM_KEYWORDS as REGISTRY_KEYWORDS } from '@/lib/map/team-registry';
import { computeCronStats24h } from '@/lib/map/cron-stats';
import { JARVIS_HOME } from '@/lib/jarvis-paths';

const CLAUDE_CLI = '/Users/ramsbaby/.local/bin/claude';

// 공통 NPC 행동 규칙 — 캐릭터 몰입 유지 + 적극적 대응
const NPC_RULES = `
[행동 규칙]
- 너는 자비스 컴퍼니의 실제 팀장이다. "NPC", "AI", "역할", "캐릭터" 같은 메타 발언은 절대 하지 않는다.
- 오너(대표)가 질문하면 네 소관 영역에서 적극적으로 원인 분석 + 조치 방안을 제시한다.
- "데이터가 없어서 모른다"로 도망치지 않는다. 브리핑 화면에 실패가 보이면 인정하고, 가능한 원인을 추론하고, 구체적 조치를 제안한다.
- 다른 팀 소관이면 어느 팀장에게 물어봐야 하는지 안내한다.
- "작업 디렉토리", "allowedDirectories", "터미널", "권한 승인" 같은 시스템 용어는 쓰지 않는다.
- 파일 읽기 권한이 있다. ~/.jarvis/ 하위 로그·결과·설정에 직접 접근 가능하다. 로그가 필요하면 직접 읽어서 분석한 결과를 보고한다.

[절대 금지 — 오너에게 복붙 명령어를 던지는 것]
- "아래 명령어를 실행해주세요", "복사-붙여넣기", "sed", "python3 -c", "cd ~/.jarvis" 같은 **실행 지시문을 출력 금지**.
- "직접 수정 도구가 막혀서…" 같은 변명 금지. 사용자는 도구 상태를 알 필요가 없다.
- 네가 해결할 수 없는 작업이면 "제안 카드를 대표실에 보냈습니다 / 승인 루프 대기 중입니다 / 이 건은 자비스 개발팀(Claude Code) 소관입니다" 라고 말한다.
- 변경이 필요하면 **무엇을 / 왜 / 예상 효과** 3가지만 보고한다. **어떻게**(명령어/스크립트)는 사용자에게 노출하지 않는다.
- 실행은 오너가 자비스 개발 환경(Claude Code CLI)에서 직접 처리하는 것이 표준이다.

[답변 구조]
- 핵심 결론 1줄 → 근거 데이터 2-4줄 → 다음 액션 제안 (사용자 액션이 아니라 **팀장 본인이 추적 중인 조치**) 1-2줄.
- 답변 톤: 보고하는 팀장처럼. 간결.`;

const TEAM_PROMPTS: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_REGISTRY)
    .filter(([, e]) => !!e.persona)
    .map(([id, e]) => [id, `${e.persona}${NPC_RULES}`]),
);
// ^^^ SSoT: lib/map/team-registry.ts 의 `persona` + 공통 NPC_RULES 조합.
//     이전에는 이 리터럴에 secretary / standup 누락이 있어 해당 팀이
//     generic fallback 페르소나로 떨어졌다. 이제 registry 에 entry 만
//     추가하면 chat 에도 자동 반영된다.;

// --- Team context gathering ---

const contextCache = new Map<string, { value: string; ts: number }>();

function safeRead(file: string, maxBytes = 8192): string {
  try {
    if (!existsSync(file)) return '';
    const buf = readFileSync(file, 'utf8');
    return buf.length > maxBytes ? buf.slice(-maxBytes) : buf;
  } catch {
    return '';
  }
}

function tailLines(text: string, n: number): string {
  if (!text) return '';
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-n).join('\n');
}

function grepLines(text: string, patterns: string[], n: number): string {
  if (!text) return '';
  const re = new RegExp(patterns.join('|'), 'i');
  const lines = text.split('\n').filter(l => re.test(l));
  return lines.slice(-n).join('\n');
}

function safeExec(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { timeout: 2000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function latestFileIn(dir: string, pattern: RegExp): string {
  try {
    if (!existsSync(dir)) return '';
    const files = readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files[0] ? path.join(dir, files[0].f) : '';
  } catch {
    return '';
  }
}

function readCronLog(): string {
  return safeRead(path.join(JARVIS_HOME, 'logs', 'cron.log'), 32_000);
}

function cronStats(log: string): { total: number; fail: number } {
  if (!log) return { total: 0, fail: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const lines = log.split('\n').filter(l => l.includes(today));
  const fail = lines.filter(l => /fail|error|❌|✗/i.test(l)).length;
  return { total: lines.length, fail };
}

function diskUsage(): string {
  const out = safeExec('df', ['-h', '/']);
  const line = out.split('\n')[1] || '';
  return line.split(/\s+/).slice(1, 5).join(' ') || 'unknown';
}

function botStatus(): string {
  const pid = safeExec('pgrep', ['-f', 'discord-bot.js']);
  return pid ? `running (PID ${pid.split('\n')[0]})` : 'down';
}

// ── 팀 뇌를 만드는 도우미들 ─────────────────────────────────────

interface TaskDefFull {
  id: string;
  name?: string;
  description?: string;
  schedule?: string;
  prompt?: string;
  script?: string;
  discordChannel?: string;
  priority?: string;
  enabled?: boolean;
  disabled?: boolean;
}

let tasksJsonCache: { data: TaskDefFull[]; ts: number } | null = null;
function loadTasksJson(): TaskDefFull[] {
  if (tasksJsonCache && Date.now() - tasksJsonCache.ts < 15_000) return tasksJsonCache.data;
  try {
    const raw = readFileSync(path.join(JARVIS_HOME, 'config', 'tasks.json'), 'utf8');
    const parsed = JSON.parse(raw) as { tasks?: TaskDefFull[] };
    const list = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    tasksJsonCache = { data: list, ts: Date.now() };
    return list;
  } catch {
    return [];
  }
}

function teamOwnedTasks(keywords: string[]): TaskDefFull[] {
  if (keywords.length === 0) return [];
  const tasks = loadTasksJson();
  const kwLower = keywords.map(k => k.toLowerCase());
  return tasks.filter(t => {
    if (t.disabled || t.enabled === false) return false;
    const id = (t.id || '').toLowerCase();
    return kwLower.some(kw => id.includes(kw));
  });
}

function cronStats24h(keywords: string[], cronLog: string): { total: number; success: number; failed: number; skipped: number; rate: number } {
  // SSoT: lib/map/cron-stats.ts — briefing/route.ts 와 동일한 계산.
  return computeCronStats24h(cronLog, keywords);
}

function cronStats7d(keywords: string[], cronLog: string): { days: number; success: number; failed: number; rate: number; dailyAvg: number } {
  if (!cronLog || keywords.length === 0) return { days: 7, success: 0, failed: 0, rate: 0, dailyAvg: 0 };
  const re = new RegExp(keywords.join('|'), 'i');
  const cutoffMs = Date.now() - 7 * 86400_000;
  const lines = cronLog.split('\n').filter(Boolean);
  let success = 0, failed = 0;
  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\]/);
    if (!m) continue;
    if (/^task_\d+_/.test(m[2])) continue;
    if (!re.test(m[2])) continue;
    const tsMs = Date.parse(m[1] + '+09:00');
    if (!isNaN(tsMs) && tsMs < cutoffMs) continue;
    if (/\bSUCCESS\b|\bDONE\b/.test(line)) success++;
    else if (/FAILED|ERROR|CRITICAL/.test(line)) failed++;
  }
  const total = success + failed;
  return { days: 7, success, failed, rate: total > 0 ? Math.round((success / total) * 100) : 0, dailyAvg: Math.round(total / 7) };
}

function listCircuitBreakers(keywords: string[]): string {
  const dir = path.join(JARVIS_HOME, 'state', 'circuit-breaker');
  if (!existsSync(dir)) return '';
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    const kwLower = keywords.map(k => k.toLowerCase());
    const hits: string[] = [];
    for (const f of files) {
      const taskId = f.replace('.json', '');
      const tidLower = taskId.toLowerCase();
      if (keywords.length > 0 && !kwLower.some(kw => tidLower.includes(kw))) continue;
      try {
        const data = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
          failures?: number; state?: string; cooldownUntil?: string; lastFailureAt?: string;
        };
        if ((data.failures || 0) >= 2) {
          const parts = [`- ${taskId}: ${data.failures}회 연속 실패`];
          if (data.state) parts.push(`state=${data.state}`);
          if (data.lastFailureAt) parts.push(`마지막실패=${data.lastFailureAt}`);
          if (data.cooldownUntil) parts.push(`쿨다운해제=${data.cooldownUntil}`);
          hits.push(parts.join(', '));
        }
      } catch { /* skip */ }
    }
    return hits.join('\n');
  } catch {
    return '';
  }
}

function recentResultsFor(taskId: string, maxFiles = 2, maxBytesPerFile = 1500): string {
  const dir = path.join(JARVIS_HOME, 'results', taskId);
  if (!existsSync(dir)) return '';
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .map(f => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, maxFiles);
    const snippets: string[] = [];
    for (const { f } of files) {
      const content = safeRead(path.join(dir, f), maxBytesPerFile);
      if (!content) continue;
      snippets.push(`▼ ${f}:\n${tailLines(content, 15).slice(-maxBytesPerFile)}`);
    }
    return snippets.join('\n\n');
  } catch {
    return '';
  }
}

// 팀의 여러 태스크 중 최신 산출물이 있는 것만 2~3개 샘플
function sampleRecentResults(ownedTasks: TaskDefFull[], maxSamples = 2): string {
  if (ownedTasks.length === 0) return '';
  // results/ 디렉토리가 존재하는 태스크 우선
  const candidates: Array<{ id: string; mtime: number }> = [];
  for (const t of ownedTasks) {
    const dir = path.join(JARVIS_HOME, 'results', t.id);
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      if (files.length === 0) continue;
      const latestMtime = Math.max(...files.map(f => {
        try { return statSync(path.join(dir, f)).mtimeMs; } catch { return 0; }
      }));
      candidates.push({ id: t.id, mtime: latestMtime });
    } catch { /* skip */ }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  const picked = candidates.slice(0, maxSamples);
  if (picked.length === 0) return '';
  const sections: string[] = [];
  for (const p of picked) {
    const snippet = recentResultsFor(p.id, 1, 1200);
    if (snippet) sections.push(`[${p.id}]\n${snippet}`);
  }
  return sections.join('\n\n');
}

function upcomingSchedulesFor(ownedTasks: TaskDefFull[]): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  const items: string[] = [];
  for (const t of ownedTasks.slice(0, 30)) {
    if (!t.schedule) continue;
    // cron expression의 "M H DoM Mon DoW" — 단순 시간 추출만
    const parts = t.schedule.split(/\s+/);
    if (parts.length >= 2) {
      const mm = parts[0];
      const hh = parts[1];
      // 지금보다 이후인지 대강 체크 (오늘 남은 실행만)
      const hhNum = parseInt(hh);
      if (!isNaN(hhNum) && (hhNum > hour || (hhNum === hour && parseInt(mm) > minute))) {
        items.push(`- ${t.id}: ${t.schedule}${t.name ? ` (${t.name})` : ''}`);
      }
    }
  }
  return items.slice(0, 8).join('\n');
}

function buildRichBase(teamId: string, keywords: string[], cronLog: string): string {
  if (keywords.length === 0) return '';
  const sections: string[] = [];

  // 1. 책임 태스크 전수
  const owned = teamOwnedTasks(keywords);
  if (owned.length > 0) {
    const taskLines = owned.slice(0, 20).map(t => {
      const bits: string[] = [`- ${t.id}`];
      if (t.schedule) bits.push(`스케줄:${t.schedule}`);
      if (t.script) bits.push('[script]');
      else if (t.prompt) bits.push('[LLM]');
      if (t.priority) bits.push(`우선:${t.priority}`);
      let line = bits.join(' · ');
      const caption = t.name || t.description;
      if (caption) line += `\n    → ${caption.replace(/\s+/g, ' ').slice(0, 140)}`;
      return line;
    });
    sections.push(`## 책임 태스크 (${owned.length}개)\n${taskLines.join('\n')}${owned.length > 20 ? `\n... 외 ${owned.length - 20}개` : ''}`);
  }

  // 2. 통계 — 24h 를 primary 로, 7d 는 참고용으로만. LLM 이 24h 질문에
  //    7d 숫자로 답변하는 혼동을 막기 위해 label 을 강화한다. (briefing
  //    팝업과 동일한 수치가 나와야 UI 와 chat 이 일치한다.)
  const s24 = cronStats24h(keywords, cronLog);
  const s7d = cronStats7d(keywords, cronLog);
  if (s24.total > 0 || s7d.success + s7d.failed > 0) {
    const primary = `**[권장 숫자 — CEO 질문 답변 시 이 줄 사용]** 오늘 (최근 24시간): 전체 ${s24.total}건 / 성공 ${s24.success}건 / 실패 ${s24.failed}건 / 스킵 ${s24.skipped}건 / 성공률 ${s24.rate}%`;
    const supplementary = `(참고용 · 7일 누적) 성공 ${s7d.success}건 / 실패 ${s7d.failed}건 / 성공률 ${s7d.rate}% / 일평균 ${s7d.dailyAvg}건 — **"오늘" 또는 "24시간" 질문에는 절대 이 줄을 사용하지 말 것**`;
    sections.push(`## 실행 통계\n${primary}\n${supplementary}`);
  }

  // 3. 최근 24h cron.log 스니펫 (팀 관련 라인만)
  const crons = grepLines(cronLog, keywords, 15);
  if (crons) {
    sections.push(`## 최근 24h cron.log\n${crons}`);
  }

  // 4. 실패 원인 상세 (stderr tail 포함)
  const failures = gatherFailureDetails(keywords, cronLog);
  if (failures) {
    sections.push(`## 현재 실패 중인 작업 (stderr 포함)\n${failures}`);
  }

  // 5. 서킷브레이커
  const cbs = listCircuitBreakers(keywords);
  if (cbs) {
    sections.push(`## 연속 실패 / 서킷브레이커 상태\n${cbs}`);
  }

  // 6. 최근 산출물
  const results = sampleRecentResults(owned, 2);
  if (results) {
    sections.push(`## 최근 산출물 (샘플)\n${results}`);
  }

  // 7. 오늘 남은 예정 실행
  const upcoming = upcomingSchedulesFor(owned);
  if (upcoming) {
    sections.push(`## 오늘 남은 예정 실행\n${upcoming}`);
  }

  return sections.join('\n\n');
}

// 팀 키워드 → 최근 실패 태스크 + stderr 세부 원인 수집
function gatherFailureDetails(keywords: string[], cronLog: string, maxTasks = 3): string {
  if (!cronLog) return '';
  const re = new RegExp(keywords.join('|'), 'i');
  const KST_OFFSET = 9 * 3600_000;
  const cutoffMs = Date.now() - 24 * 3600_000;
  const lines = cronLog.split('\n').filter(Boolean).slice(-2000);
  // task 이름별 최근 실패 정보 수집
  const failedTasks = new Map<string, { time: string; msg: string }>();
  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/);
    if (!m) continue;
    const [, ts, task, msg] = m;
    if (/^task_\d+_/.test(task)) continue;
    if (!re.test(task)) continue;
    if (!/FAILED|ERROR|CRITICAL/.test(line)) continue;
    const lineTsMs = Date.parse(ts + '+09:00');
    if (!isNaN(lineTsMs) && lineTsMs < cutoffMs - KST_OFFSET) continue;
    // 가장 최근 것만 유지
    failedTasks.set(task, { time: ts, msg: msg.slice(0, 300) });
  }
  if (failedTasks.size === 0) return '';
  const taskIds = Array.from(failedTasks.keys()).slice(0, maxTasks);
  const sections: string[] = [];
  for (const taskId of taskIds) {
    const info = failedTasks.get(taskId)!;
    const parts: string[] = [];
    parts.push(`▼ ${taskId}`);
    parts.push(`  실패 시각: ${info.time}`);
    parts.push(`  cron 로그 메시지: ${info.msg}`);
    // Claude stderr 로그 시도
    const stderrFile = path.join(JARVIS_HOME, 'logs', `claude-stderr-${taskId}.log`);
    const stderrTxt = safeRead(stderrFile, 3000);
    if (stderrTxt) {
      const stderrTail = tailLines(stderrTxt, 12).slice(-1500);
      if (stderrTail) parts.push(`  Claude stderr tail:\n${stderrTail.split('\n').map(l => '    ' + l).join('\n')}`);
    }
    // 태스크 전용 로그 시도
    const taskLog = path.join(JARVIS_HOME, 'logs', `${taskId}.log`);
    if (existsSync(taskLog)) {
      const taskLogTxt = safeRead(taskLog, 2000);
      const tail = tailLines(taskLogTxt, 8);
      if (tail) parts.push(`  태스크 전용 로그:\n${tail.split('\n').map(l => '    ' + l).join('\n')}`);
    }
    sections.push(parts.join('\n'));
  }
  return sections.join('\n\n');
}

// 팀별 cron 키워드 — 브리핑 라우트의 ENTITIES와 동기화
const TEAM_KEYWORDS: Record<string, string[]> = REGISTRY_KEYWORDS;
// ^^^ SSoT: lib/map/team-registry.ts 에서 파생.
//     예전에는 이 파일에 keyword 를 재정의해서 briefing/route.ts 의
//     ENTITIES.keywords 와 드리프트가 생겼다 (예: finance 분리 후
//     trend-lead 의 오래된 list 가 남아 trend-lead 채팅이 잘못된 통계를
//     보고했다). 이제 한 곳만 고치면 양쪽이 일치한다.;

function gatherTeamContext(teamId: string): string {
  const cached = contextCache.get(teamId);
  if (cached && Date.now() - cached.ts < CHAT_CONTEXT_TTL_MS) return cached.value;

  const cronLog = readCronLog();
  let value = '';

  switch (teamId) {
    case 'infra-lead': {
      const kw = TEAM_KEYWORDS['infra-lead'];
      const base = buildRichBase(teamId, kw, cronLog);
      const minutesFile = latestFileIn(path.join(JARVIS_HOME, 'state', 'board-minutes'), /\.md$/);
      const minutes = minutesFile ? safeRead(minutesFile, 4000) : '';
      const infraSection = grepLines(minutes, ['인프라', 'Infra', 'infra', 'SRE', '디스크', '서버'], 10);
      const extras: string[] = [];
      extras.push(`## 실시간 시스템 상태\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}`);
      if (infraSection) extras.push(`## 최근 이사회 인프라 섹션\n${infraSection}`);
      value = `${base}\n\n${extras.join('\n\n')}`;
      break;
    }
    case 'finance': {
      const kw = TEAM_KEYWORDS.finance;
      const base = buildRichBase(teamId, kw, cronLog);
      const preplyDir = path.join(JARVIS_HOME, 'results', 'personal-schedule-daily');
      const preplyFile = latestFileIn(preplyDir, /\.md$/);
      const preplyContent = preplyFile ? safeRead(preplyFile, 2000) : '';
      const tqqqDir = path.join(JARVIS_HOME, 'results', 'tqqq-monitor');
      const tqqqFile = latestFileIn(tqqqDir, /\.md$/);
      const tqqqContent = tqqqFile ? safeRead(tqqqFile, 1500) : '';
      const extras: string[] = [];
      if (preplyContent) extras.push(`## 최근 Preply 수입 리포트\n${tailLines(preplyContent, 15)}`);
      if (tqqqContent) extras.push(`## 최근 TQQQ 모니터\n${tailLines(tqqqContent, 12)}`);
      value = `${base}${extras.length > 0 ? '\n\n' + extras.join('\n\n') : ''}`;
      break;
    }
    case 'trend-lead': {
      const kw = TEAM_KEYWORDS['trend-lead'];
      const base = buildRichBase(teamId, kw, cronLog);
      const reportFile = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^trend.*\.md$/);
      const report = reportFile ? safeRead(reportFile, 3000) : '';
      const extras: string[] = [];
      if (report) extras.push(`## 최근 트렌드 리포트 (${path.basename(reportFile)})\n${tailLines(report, 25)}`);
      value = `${base}${extras.length > 0 ? '\n\n' + extras.join('\n\n') : ''}`;
      break;
    }
    case 'record-lead': {
      const kw = TEAM_KEYWORDS['record-lead'];
      const base = buildRichBase(teamId, kw, cronLog);
      value = `${base}\n\n## 데이터실 경계\n- 백엔드(인덱싱/아카이빙/정리)는 나의 소관\n- 사용자 검색 UI는 자료실(library / 문지아) 소관`;
      break;
    }
    case 'library': {
      const kw = TEAM_KEYWORDS.library;
      const base = buildRichBase(teamId, kw, cronLog);
      const ragData = safeExec('du', ['-sh', path.join(JARVIS_HOME, 'rag', 'data')]);
      value = `${base}\n\n## RAG 데이터 물리 크기\n${ragData || 'unknown'}\n\n## 자료실의 포지션\n- 데이터실(한소희)이 쌓은 RAG 인덱스·메모리 파일을 오너가 검색·탐색하도록 돕는 프론트엔드 레이어`;
      break;
    }
    case 'growth-lead': {
      const kw = TEAM_KEYWORDS['growth-lead'];
      const base = buildRichBase(teamId, kw, cronLog);
      const careerReport = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^career.*\.md$/);
      const academyReport = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^academy.*\.md$/);
      const careerContent = careerReport ? safeRead(careerReport, 2000) : '';
      const academyContent = academyReport ? safeRead(academyReport, 2000) : '';
      const extras: string[] = [];
      if (careerContent) extras.push(`## 최근 커리어 리포트 (${path.basename(careerReport)})\n${tailLines(careerContent, 15)}`);
      if (academyContent) extras.push(`## 최근 학습 리포트 (${path.basename(academyReport)})\n${tailLines(academyContent, 15)}`);
      value = `${base}${extras.length > 0 ? '\n\n' + extras.join('\n\n') : ''}`;
      break;
    }
    case 'brand-lead': {
      const kw = TEAM_KEYWORDS['brand-lead'];
      value = buildRichBase(teamId, kw, cronLog);
      break;
    }
    case 'audit-lead': {
      const kw = TEAM_KEYWORDS['audit-lead'];
      const base = buildRichBase(teamId, kw, cronLog);
      const stats = cronStats(cronLog);
      value = `${base}\n\n## 전사 크론 통계 (QA 감시)\n- 오늘 총 실행 라인: ${stats.total}\n- 실패/에러 라인: ${stats.fail}`;
      break;
    }
    case 'president': {
      const kw = TEAM_KEYWORDS.president;
      const base = buildRichBase(teamId, kw, cronLog);
      const minutesFile = latestFileIn(path.join(JARVIS_HOME, 'state', 'board-minutes'), /\.md$/);
      const minutes = minutesFile ? safeRead(minutesFile, 5000) : '';
      const contextBus = safeRead(path.join(JARVIS_HOME, 'state', 'context-bus.md'), 3000);
      const stats = cronStats(cronLog);
      const extras: string[] = [];
      extras.push(`## 전사 운영 스냅샷\n- 오늘 크론 실행: ${stats.total}\n- 실패/에러: ${stats.fail}\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}`);
      if (minutes) extras.push(`## 최근 이사회 회의록 (${path.basename(minutesFile)})\n${tailLines(minutes, 35)}`);
      if (contextBus) extras.push(`## 컨텍스트 버스 (전사 상태 공유)\n${tailLines(contextBus, 20)}`);
      value = `${base}\n\n${extras.join('\n\n')}`;
      break;
    }
    case 'cron-engine': {
      const stats = cronStats(cronLog);
      value = `오늘 크론 엔진 통계:\n- 실행 라인: ${stats.total}\n- 실패/에러: ${stats.fail}\n\n최근 크론 라인:\n${tailLines(cronLog, 15) || '(없음)'}`;
      break;
    }
    case 'discord-bot': {
      const crons = grepLines(cronLog, ['discord', 'bot-watchdog', 'bot-restart'], 10);
      value = `Discord 봇 상태:\n- 프로세스: ${botStatus()}\n\n최근 봇 관련 크론:\n${crons || '(없음)'}`;
      break;
    }
    case 'disk-storage': {
      const ragData = safeExec('du', ['-sh', path.join(JARVIS_HOME, 'rag', 'data')]);
      const logs = safeExec('du', ['-sh', path.join(JARVIS_HOME, 'logs')]);
      value = `디스크 스토리지 상태:\n- / 파티션: ${diskUsage()}\n- RAG 데이터: ${ragData || 'unknown'}\n- 로그 디렉토리: ${logs || 'unknown'}`;
      break;
    }
    case 'secretary': {
      const kw = TEAM_KEYWORDS.secretary;
      const base = buildRichBase(teamId, kw, cronLog);
      value = `${base}\n\n## 컨시어지 운영 현황\n- Discord 봇: ${botStatus()}\n- 상시 대응: /ask, /logs, /brief, /status 등 슬래시 명령\n- 소관: 봇 품질 자가 점검, 응답 로깅, 스킬 평가`;
      break;
    }
    default: {
      // 팀 키워드가 있으면 풀 rich base, 없으면 시스템 스냅샷
      const kw = TEAM_KEYWORDS[teamId] || [];
      if (kw.length > 0) {
        value = buildRichBase(teamId, kw, cronLog);
      } else {
        const stats = cronStats(cronLog);
        value = `## ${teamId} 팀의 고유 크론 키워드가 아직 등록되지 않았습니다\n\n## 전사 시스템 스냅샷\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}\n- 오늘 크론 실행: ${stats.total}\n- 실패/에러: ${stats.fail}\n\n## 최근 cron.log (아무 필터 없음)\n${tailLines(cronLog, 10)}`;
      }
    }
  }

  // 모든 팀에 공통 시스템 스냅샷 추가 (컨텍스트가 어떤 경우든 너무 얇아지지 않도록)
  if (!value.includes('디스크 /')) {
    value += `\n\n=== 공통 시스템 스냅샷 ===\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}`;
  }

  // LLM Wiki 컨텍스트 주입 — 팀별 도메인 매핑
  const TEAM_WIKI_MAP: Record<string, string[]> = {
    'infra-lead': ['ops'], 'qa-lead': ['ops'], 'concierge': ['ops'],
    'finance': ['trading'], 'hr-dev': ['career'], 'marketing': ['knowledge'],
    'strategy': ['knowledge'], 'data-team': ['ops', 'knowledge'],
    'president': ['career', 'ops', 'trading'], 'meeting-room': ['ops'],
  };
  const wikiDomains = TEAM_WIKI_MAP[teamId] || [];
  const wikiDir = path.join(JARVIS_HOME, 'wiki');
  if (wikiDomains.length > 0 && existsSync(wikiDir)) {
    const wikiParts: string[] = [];
    for (const domain of wikiDomains) {
      const summaryPath = path.join(wikiDir, domain, '_summary.md');
      if (!existsSync(summaryPath)) continue;
      let summary = readFileSync(summaryPath, 'utf-8');
      summary = summary.replace(/^```ya?ml\n---[\s\S]*?---\n```\n*/m, '');
      summary = summary.replace(/^---[\s\S]*?---\n*/m, '');
      if (summary.trim().length > 50) {
        wikiParts.push(summary.trim().slice(0, 800));
      }
    }
    if (wikiParts.length > 0) {
      value += `\n\n=== 위키 지식 (자동 주입) ===\n${wikiParts.join('\n---\n')}`;
    }
  }

  contextCache.set(teamId, { value, ts: Date.now() });
  return value;
}

// TODO(frontend): ChatPanel.tsx / VirtualOffice.tsx의 sendMessage는 SSE 파싱으로 전환 필요.
// 응답은 JSON이 아닌 text/event-stream (data: {"token":"..."} / data: {"done":true,"id":N}).

// Groq OpenAI 호환 SSE 스트리밍
// 환경변수 GAME_CHAT_MODEL로 모델 오버라이드 가능. 기본은 llama-3.3-70b.
// 더 강력한 답변을 원하면 env에 다음 중 하나 설정: moonshotai/kimi-k2-instruct, openai/gpt-oss-120b
// Claude Sonnet이 기본값 — ANTHROPIC_API_KEY 있으면 Claude, 없으면 Groq 폴백
const MODEL = process.env.GAME_CHAT_MODEL ||
  (process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-6' : GROQ_LLAMA_70B);
const MAX_TOKENS = 2500;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const RATE_LIMIT = { perMin: 5, perDay: 50 };

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export async function POST(req: NextRequest) {
  let teamId: string;
  let message: string;
  let briefingSummary: string | undefined;
  let isRetry = false;
  try {
    const body = await req.json();
    teamId = body.teamId;
    message = body.message;
    briefingSummary = body.briefingSummary;
    isRetry = body.isRetry === true;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!teamId || !message) {
    return NextResponse.json({ error: 'teamId와 message는 필수입니다.' }, { status: 400 });
  }

  // Rate limit
  const rlKey = getKey(req);
  const rl = checkAndConsume(rlKey, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.reason ?? ''}`.trim(), remaining: rl.remaining, resetAt: rl.resetAt },
      { status: 429 },
    );
  }

  // Cost cap
  try {
    const [today, cap] = await Promise.all([getTodayCost(), getDailyCap()]);
    if (today >= cap) {
      return NextResponse.json(
        { error: `비용 상한 도달 (오늘 $${today.toFixed(4)} / 상한 $${cap.toFixed(2)})` },
        { status: 429 },
      );
    }
  } catch (err) {
    console.error('[game-chat] cost check failed:', err);
    // 비용 파일 읽기 실패 시에는 통과 (hard-block 아님)
  }

  // Groq API 키는 Claude CLI/SDK 경로일 때는 불필요 — Groq 경로에서만 검증
  const groqApiKey = process.env.GROQ_API_KEY;
  const isClaudeModelEarly = MODEL.startsWith('claude-');
  const claudeCliExists = existsSync(CLAUDE_CLI);
  if (!isClaudeModelEarly && !groqApiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const basePrompt = TEAM_PROMPTS[teamId] || `나는 Jarvis Company의 ${teamId} 담당자입니다. 질문에 답변합니다.`;
  const db = getDb();

  // ── Phase 1: User 메시지 INSERT + Assistant placeholder INSERT ──
  // status='completed'가 기본값이므로 user 메시지는 그대로, assistant placeholder는 status='streaming'
  // isRetry=true 인 경우 user 메시지 중복 INSERT 방지 (재시도 — 원본 user 메시지 재사용)
  if (!isRetry) {
    db.prepare(
      "INSERT INTO game_chat (team_id, role, content, status) VALUES (?, 'user', ?, 'completed')"
    ).run(teamId, message);
  }

  const assistantInsert = db.prepare(
    "INSERT INTO game_chat (team_id, role, content, status) VALUES (?, 'assistant', '', 'streaming')"
  ).run(teamId);
  const assistantId = Number(assistantInsert.lastInsertRowid);

  const recentMessages = db.prepare(
    "SELECT role, content FROM game_chat WHERE team_id = ? AND status IN ('completed', 'aborted') ORDER BY created_at DESC LIMIT 6"
  ).all(teamId) as Array<{ role: string; content: string }>;

  const conversationContext = recentMessages.reverse()
    .map(m => `${m.role === 'user' ? '사용자' : '나'}: ${m.content}`)
    .join('\n');

  const teamContext = gatherTeamContext(teamId);
  const persona = basePrompt.split('입니다')[0] + '입니다';

  // 핵심: 팀 실제 데이터를 system 프롬프트에 포함 — LLM이 데이터 기반 답변하도록 강제
  // briefingSummary: 사용자가 화면 왼쪽에서 보고 있는 브리핑 요약 (프론트엔드에서 전달)
  const systemPrompt = `${basePrompt}

=== 사용자가 현재 보고 있는 브리핑 화면 요약 ===
${briefingSummary || '(브리핑 요약 없음)'}

=== 오늘 팀의 실제 활동 데이터 (내가 관리하는 시스템에서 수집됨) ===
${teamContext || '(수집된 데이터 없음)'}

답변 규칙 (엄수):
1. 위 실제 데이터를 근거로 ${persona}의 입장에서 한국어로 답변한다.
2. "사용자가 현재 보고 있는 브리핑 화면 요약"에 나온 내용은 사실로 간주한다. 사용자가 화면에서 실패를 봤다면 인정하고 분석한다.
3. 실패 원인을 물으면 "현재 실패 중인 작업" 섹션의 stderr/로그를 인용해서 원인 분석. 로그가 없더라도 브리핑 화면에 실패가 표시됐다면 "브리핑에서 감지된 실패"로 인정하고 가능한 원인을 추론한다.
4. 상태 질문에는 숫자(실행 건수, 실패 건수, 디스크%, 시간)를 구체적으로 포함한다. 시간 창이 모호하면 **항상 "오늘 (최근 24h)" 통계만 인용**한다. 7일 누적 숫자는 "최근 7일" 이라고 명시적으로 물었을 때만 사용한다 — "오늘", "지금", "현재", "상태" 같은 질문에는 절대 7d 숫자를 쓰지 않는다.
5. 답변은 짧고 구조화해서: 핵심 결론 → 근거 데이터 → 다음 액션 제안.
6. 절대로 사용자에게 권한 허용·설정 변경·도구 활성화를 요청하지 않는다. 필요한 작업은 직접 처리하거나 불가능하다고만 답한다.`;

  const userContent = `${conversationContext ? `=== 이전 대화 ===\n${conversationContext}\n\n` : ''}${message}`;

  // ── Phase 1: incremental UPDATE 준비 (throttle 500ms or 40 tokens) ──
  const updateStmt = db.prepare(
    'UPDATE game_chat SET content = ?, updated_at = unixepoch() WHERE id = ?'
  );
  const finalizeStmt = db.prepare(
    'UPDATE game_chat SET content = ?, status = ?, updated_at = unixepoch() WHERE id = ?'
  );

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let aborted = false;
      let clientDisconnected = false;
      let lastUpdateAt = Date.now();
      let lastUpdateLen = 0;
      const UPDATE_INTERVAL_MS = 500;
      const UPDATE_TOKEN_LEN = 40;

      // Throttle 된 incremental UPDATE — 500ms 또는 40 토큰 간격
      const maybeUpdate = () => {
        const now = Date.now();
        if (now - lastUpdateAt >= UPDATE_INTERVAL_MS || fullText.length - lastUpdateLen >= UPDATE_TOKEN_LEN) {
          try {
            updateStmt.run(fullText, assistantId);
            lastUpdateAt = now;
            lastUpdateLen = fullText.length;
          } catch (updErr) {
            console.error('[game-chat] incremental UPDATE failed:', updErr);
          }
        }
      };

      // 안전한 enqueue — controller가 닫혔으면 silent drop
      const safeEnqueue = (payload: string) => {
        if (clientDisconnected) return;
        try {
          controller.enqueue(enc.encode(payload));
        } catch {
          clientDisconnected = true;
        }
      };

      // req.signal abort: 사용자가 명시적으로 ⏹ 중단 버튼을 눌렀거나 브라우저 탭이 닫힌 경우
      // D1: 팝업만 닫힌 경우엔 클라이언트가 abort 호출 안 하므로 여기 안 옴 (서버 계속 달림)
      const onAbort = () => {
        aborted = true;
      };
      req.signal?.addEventListener('abort', onAbort);

      try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const isClaudeModel = MODEL.startsWith('claude-');
        // CLI 우선 (Max 구독). SDK는 CLI 없을 때만 폴백.
        const useClaudeCLI = isClaudeModel && claudeCliExists;
        const useClaudeSDK = isClaudeModel && !claudeCliExists && !!anthropicKey;

        if (useClaudeSDK) {
          // ── Anthropic SDK (API 키 있을 때) ────────────────────────────────
          const anthropic = new Anthropic({ apiKey: anthropicKey! });

          const claudeStream = await anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
          });

          for await (const event of claudeStream) {
            if (aborted) break;
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const token = event.delta.text;
              fullText += token;
              safeEnqueue(`data: ${JSON.stringify({ token })}\n\n`);
              maybeUpdate();
            }
          }

          if (!aborted) {
            const finalMsg = await claudeStream.finalMessage();
            inputTokens = finalMsg.usage.input_tokens;
            outputTokens = finalMsg.usage.output_tokens;
          }

        } else if (useClaudeCLI) {
          // ── Claude CLI (Max 구독, API 키 불필요) ────────────────────────────
          const cliPrompt = `${systemPrompt}\n\n---\n\n${userContent}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cliEnv = { ...process.env, HOME: process.env.HOME || '/Users/ramsbaby' } as any;
          delete cliEnv.NODE_OPTIONS;
          delete cliEnv.ANTHROPIC_API_KEY;

          // Keepalive: 20초마다 SSE ping (Cloudflare 100s 타임아웃 방지)
          const keepaliveTimer = setInterval(() => {
            safeEnqueue(': ping\n\n');
          }, 20000);

          try {
            const cliText = await new Promise<string>((resolve, reject) => {
              const proc = spawn(CLAUDE_CLI, [
                '-p',
                '--model', 'sonnet',
                '--output-format', 'text',
                '--no-session-persistence',
                '--permission-mode', 'bypassPermissions',
                '--add-dir', JARVIS_HOME,
              ], { stdio: 'pipe', env: cliEnv, cwd: JARVIS_HOME });
              let out = '';
              let errOut = '';
              if (proc.stdin) {
                proc.stdin.write(cliPrompt, 'utf8');
                proc.stdin.end();
              } else {
                reject(new Error('claude CLI stdin is null'));
                return;
              }
              proc.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString(); });
              proc.stderr?.on('data', (chunk: Buffer) => { errOut += chunk.toString(); });
              proc.on('close', (code) => {
                if (code !== 0) {
                  console.error('[claude-cli fail]', errOut.slice(0, 500) || out.slice(0, 500));
                  reject(new Error(`claude CLI exit ${code}: ${errOut.slice(0, 200)}`));
                  return;
                }
                resolve(out.trim());
              });
              proc.on('error', reject);
            });
            fullText = cliText;
            if (fullText) {
              safeEnqueue(`data: ${JSON.stringify({ token: fullText })}\n\n`);
              maybeUpdate();
              inputTokens = Math.ceil(cliPrompt.length / 4);
              outputTokens = Math.ceil(fullText.length / 4);
            }
          } finally {
            clearInterval(keepaliveTimer);
          }

        } else {
          // ── Groq 스트리밍 ──────────────────────────────────────────────────
          // 주의: Groq의 signal에는 req.signal을 전달하지 않음 (D1 — 백그라운드 지속)
          // 사용자가 ⏹ 버튼 누른 경우에만 aborted=true → 우리가 직접 reader.cancel() 호출
          const groqRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              temperature: 0.3,
              stream: true,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
              ],
            }),
          });

          if (!groqRes.ok || !groqRes.body) {
            const errBody = await groqRes.text().catch(() => '');
            throw new Error(`Groq HTTP ${groqRes.status}: ${errBody.slice(0, 300)}`);
          }

          const reader = groqRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // Groq SSE는 OpenAI 호환: `data: {...}\n\n` lines, 마지막은 `data: [DONE]`
          outer: while (true) {
            if (aborted) {
              try { await reader.cancel(); } catch { /* ignore */ }
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sepIdx;
            while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, sepIdx);
              buffer = buffer.slice(sepIdx + 2);

              for (const line of rawEvent.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload) continue;
                if (payload === '[DONE]') { break outer; }
                try {
                  const parsed = JSON.parse(payload) as {
                    choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
                    usage?: { prompt_tokens?: number; completion_tokens?: number };
                    x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
                  };
                  const token = parsed.choices?.[0]?.delta?.content;
                  if (token) {
                    fullText += token;
                    safeEnqueue(`data: ${JSON.stringify({ token })}\n\n`);
                    maybeUpdate();
                  }
                  const usage = parsed.usage ?? parsed.x_groq?.usage;
                  if (usage) {
                    inputTokens = usage.prompt_tokens ?? inputTokens;
                    outputTokens = usage.completion_tokens ?? outputTokens;
                  }
                } catch { /* 비-JSON 라인 무시 */ }
              }
            }
          }
        } // end Groq branch

        // ── Phase 1: 최종 상태 결정 + DB UPDATE ──
        if (aborted) {
          // 사용자가 ⏹ 중단 버튼 누름 (또는 탭 닫힘)
          try {
            finalizeStmt.run(fullText, 'aborted', assistantId);
          } catch (upErr) {
            console.error('[game-chat] finalize aborted failed:', upErr);
          }
          safeEnqueue(`data: ${JSON.stringify({ aborted: true, id: assistantId })}\n\n`);
          try { controller.close(); } catch { /* ignore */ }
          return;
        }

        // 정상 완료
        try {
          finalizeStmt.run(fullText, 'completed', assistantId);
        } catch (upErr) {
          console.error('[game-chat] finalize completed failed:', upErr);
        }

        // Record cost (best-effort) — usage가 비어 있으면 skip
        if (inputTokens > 0 || outputTokens > 0) {
          try {
            await recordCost({ model: MODEL, inputTokens, outputTokens });
          } catch (costErr) {
            console.error('[game-chat] recordCost failed:', costErr);
          }
        }

        safeEnqueue(
          `data: ${JSON.stringify({ done: true, id: assistantId, usage: { inputTokens, outputTokens } })}\n\n`,
        );
        try { controller.close(); } catch { /* ignore */ }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[game-chat] stream error:', msg);
        // ── Phase 1: 실패 시 placeholder를 failed로 마킹 + 부분 토큰/에러 메시지 저장 ──
        try {
          const failContent = fullText.length > 0
            ? `${fullText}\n\n[오류: ${msg.slice(0, 200)}]`
            : `응답 처리 중 오류: ${msg.slice(0, 200)}`;
          finalizeStmt.run(failContent, 'failed', assistantId);
        } catch (upErr) {
          console.error('[game-chat] finalize failed failed:', upErr);
        }
        safeEnqueue(`data: ${JSON.stringify({ error: msg.slice(0, 500), id: assistantId })}\n\n`);
        try { controller.close(); } catch { /* ignore */ }
      } finally {
        req.signal?.removeEventListener('abort', onAbort);
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
