export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

const TEAM_PROMPTS: Record<string, string> = {
  ceo: '나는 Jarvis Company의 CEO(이정우)입니다. 전체 시스템 운영 현황을 파악하고 전략적 의사결정을 내립니다. 질문에 대표로서 답변합니다.',
  'infra-lead': '나는 인프라팀장 박태성입니다. 서버, 디스크, 크론, Discord 봇 상태를 관리합니다. 시스템 상태에 대해 쉽게 설명합니다.',
  'trend-lead': '나는 정보팀장 강나연입니다. 뉴스, 시장 트렌드, 기술 동향을 분석합니다. 시장 상황을 쉽게 설명합니다.',
  'record-lead': '나는 기록팀장 한소희입니다. 일일 대화 기록, RAG 인덱싱, 데이터 아카이빙을 담당합니다.',
  'career-lead': '나는 커리어팀장 김서연입니다. 채용 시장 분석, 이력서, 면접 준비를 지원합니다.',
  'brand-lead': '나는 브랜드팀장 정하은입니다. 오픈소스 전략, 기술 블로그, GitHub 성장을 관리합니다.',
  'audit-lead': '나는 감사팀장 류태환입니다. 크론 실패 추적, E2E 테스트, 시스템 품질을 감시합니다.',
  'academy-lead': '나는 학습팀장 신유진입니다. 학습 계획, 스터디 큐레이션을 관리합니다.',
  'cron-engine': '나는 크론 엔진 관리자입니다. 자동화 태스크 스케줄링과 실행 상태를 관리합니다.',
  'discord-bot': '나는 Discord 봇 관리자입니다. 봇 프로세스 상태와 채팅 시스템을 관리합니다.',
  'disk-storage': '나는 디스크 스토리지 관리자입니다. 로컬 스토리지 사용량과 정리 상태를 관리합니다.',
};

// --- Team context gathering ---

const JARVIS_HOME = path.join(process.env.HOME || '', '.jarvis');
const CONTEXT_TTL_MS = 30_000;
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

function gatherTeamContext(teamId: string): string {
  const cached = contextCache.get(teamId);
  if (cached && Date.now() - cached.ts < CONTEXT_TTL_MS) return cached.value;

  const cronLog = readCronLog();
  let value = '';

  switch (teamId) {
    case 'infra-lead': {
      const crons = grepLines(cronLog, ['infra-daily', 'system-doctor', 'system-health', 'disk-alert', 'scorecard-enforcer', 'glances'], 15);
      const minutesFile = latestFileIn(path.join(JARVIS_HOME, 'state', 'board-minutes'), /\.md$/);
      const minutes = minutesFile ? safeRead(minutesFile, 4000) : '';
      const infraSection = grepLines(minutes, ['인프라', 'Infra', 'infra'], 10);
      value = `오늘 실행된 인프라 크론 (최근):\n${crons || '(없음)'}\n\n현재 시스템 상태:\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}\n\n보드 미팅 인프라 섹션:\n${infraSection || '(없음)'}`;
      break;
    }
    case 'trend-lead': {
      const crons = grepLines(cronLog, ['news-briefing', 'market-alert', 'tqqq-monitor', 'macro-briefing', 'github-monitor', 'trend'], 15);
      const reportFile = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^trend.*\.md$/);
      const report = reportFile ? safeRead(reportFile, 3000) : '';
      const contextBus = safeRead(path.join(JARVIS_HOME, 'state', 'context-bus.md'), 4000);
      const trendBus = grepLines(contextBus, ['정보', 'trend', '뉴스', '시장'], 8);
      value = `오늘 정보팀 크론 활동:\n${crons || '(없음)'}\n\n최근 트렌드 리포트${reportFile ? ` (${path.basename(reportFile)})` : ''}:\n${tailLines(report, 20) || '(없음)'}\n\n컨텍스트 버스 (정보 관련):\n${trendBus || '(없음)'}`;
      break;
    }
    case 'record-lead': {
      const crons = grepLines(cronLog, ['record-daily', 'memory', 'session-sum', 'compact', 'rag-index'], 15);
      const ragData = safeExec('du', ['-sh', path.join(JARVIS_HOME, 'rag', 'data')]);
      value = `오늘 기록팀 크론 활동:\n${crons || '(없음)'}\n\nRAG 데이터 크기:\n${ragData || 'unknown'}`;
      break;
    }
    case 'career-lead': {
      const crons = grepLines(cronLog, ['career', 'commitment', 'interview', 'job'], 15);
      const reportFile = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^career.*\.md$/);
      const report = reportFile ? safeRead(reportFile, 3000) : '';
      value = `오늘 커리어팀 크론 활동:\n${crons || '(없음)'}\n\n최근 커리어 리포트${reportFile ? ` (${path.basename(reportFile)})` : ''}:\n${tailLines(report, 20) || '(없음)'}`;
      break;
    }
    case 'brand-lead': {
      const crons = grepLines(cronLog, ['brand', 'openclaw', 'blog', 'oss', 'github-star'], 15);
      value = `오늘 브랜드팀 크론 활동:\n${crons || '(없음)'}`;
      break;
    }
    case 'audit-lead': {
      const crons = grepLines(cronLog, ['audit', 'cron-failure', 'kpi', 'e2e', 'regression', 'doc-sync'], 15);
      const stats = cronStats(cronLog);
      value = `오늘 감사팀 크론 활동:\n${crons || '(없음)'}\n\n오늘 전체 크론 통계:\n- 총 실행 라인: ${stats.total}\n- 실패/에러 라인: ${stats.fail}`;
      break;
    }
    case 'academy-lead': {
      const crons = grepLines(cronLog, ['academy', 'learning', 'study'], 15);
      const reportFile = latestFileIn(path.join(JARVIS_HOME, 'rag', 'teams', 'reports'), /^academy.*\.md$/);
      const report = reportFile ? safeRead(reportFile, 3000) : '';
      value = `오늘 학습팀 크론 활동:\n${crons || '(없음)'}\n\n최근 학습 리포트${reportFile ? ` (${path.basename(reportFile)})` : ''}:\n${tailLines(report, 20) || '(없음)'}`;
      break;
    }
    case 'ceo': {
      const minutesFile = latestFileIn(path.join(JARVIS_HOME, 'state', 'board-minutes'), /\.md$/);
      const minutes = minutesFile ? safeRead(minutesFile, 5000) : '';
      const contextBus = safeRead(path.join(JARVIS_HOME, 'state', 'context-bus.md'), 3000);
      const stats = cronStats(cronLog);
      value = `최근 보드 미팅${minutesFile ? ` (${path.basename(minutesFile)})` : ''}:\n${tailLines(minutes, 30) || '(없음)'}\n\n컨텍스트 버스:\n${tailLines(contextBus, 20) || '(없음)'}\n\n오늘 크론 전체 통계:\n- 실행 라인: ${stats.total}\n- 실패 라인: ${stats.fail}\n- 디스크 /: ${diskUsage()}\n- Discord 봇: ${botStatus()}`;
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
    default:
      value = '';
  }

  contextCache.set(teamId, { value, ts: Date.now() });
  return value;
}

export async function POST(req: NextRequest) {
  try {
    const { teamId, message } = await req.json();

    if (!teamId || !message) {
      return NextResponse.json({ error: 'teamId와 message는 필수입니다.' }, { status: 400 });
    }

    const systemPrompt = TEAM_PROMPTS[teamId] || `나는 Jarvis Company의 ${teamId} 담당자입니다. 질문에 답변합니다.`;
    const db = getDb();

    db.prepare('INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)').run(teamId, 'user', message);

    const recentMessages = db.prepare(
      'SELECT role, content FROM game_chat WHERE team_id = ? ORDER BY created_at DESC LIMIT 6'
    ).all(teamId) as Array<{ role: string; content: string }>;

    const conversationContext = recentMessages.reverse()
      .map(m => `${m.role === 'user' ? '사용자' : '나'}: ${m.content}`)
      .join('\n');

    const teamContext = gatherTeamContext(teamId);

    let assistantContent: string;
    const CLAUDE_BIN = process.env.CLAUDE_BINARY ||
      (existsSync(`${process.env.HOME}/.local/bin/claude`) ? `${process.env.HOME}/.local/bin/claude` : 'claude');

    try {
      const realHome = process.env.HOME || '/Users/ramsbaby';
      const cleanEnv: Record<string, string> = {
        HOME: realHome,
        USER: process.env.USER || 'ramsbaby',
        PATH: `${realHome}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
        TERM: 'dumb',
        LANG: 'en_US.UTF-8',
      };

      const persona = systemPrompt.split('입니다')[0] + '입니다';
      const contextualMessage = `${systemPrompt}

=== 오늘 팀의 실제 활동 데이터 ===
${teamContext || '(수집된 데이터 없음)'}

=== 이전 대화 ===
${conversationContext}

=== 사용자 질문 ===
${message}

위 실제 데이터를 근거로 ${persona}의 입장에서 한국어로 답변하세요. 데이터에 없는 내용을 지어내지 마세요. 짧고 구체적으로. 절대 "이전 세션" 같은 말 하지 마세요.`;

      const { stdout } = await execFileAsync(CLAUDE_BIN, [
        '-p', contextualMessage,
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ], {
        timeout: 60_000,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        cwd: '/tmp',
        env: cleanEnv as unknown as NodeJS.ProcessEnv,
      });
      assistantContent = stdout.trim();
    } catch (err: unknown) {
      const e = err as { message?: string; stderr?: Buffer | string; status?: number; code?: string };
      const stderrStr = e.stderr ? (Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf8') : String(e.stderr)) : '';
      const detail = stderrStr || e.message || String(err);
      assistantContent = `잠시 응답을 처리하지 못했어요.\n상세: ${detail.slice(0, 400)}\nstatus=${e.status} code=${e.code}`;
      console.error('[game-chat] claude error:', { message: e.message, stderr: stderrStr.slice(0, 500), status: e.status, code: e.code });
    }

    const result = db.prepare(
      'INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)'
    ).run(teamId, 'assistant', assistantContent);

    const saved = db.prepare('SELECT * FROM game_chat WHERE id = ?').get(result.lastInsertRowid) as {
      id: number; team_id: string; role: string; content: string; created_at: number;
    };

    return NextResponse.json({
      id: saved.id,
      role: saved.role,
      content: saved.content,
      created_at: saved.created_at,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
