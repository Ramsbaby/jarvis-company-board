export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { checkAndConsume, getKey } from '@/lib/rate-limit';
import { recordCost, getTodayCost, getDailyCap, GROQ_LLAMA_70B } from '@/lib/chat-cost';
import { CHAT_CONTEXT_TTL_MS } from '@/lib/cache-config';

const TEAM_PROMPTS: Record<string, string> = {
  president: '나는 자비스 컴퍼니의 대표 이정우입니다. AI 경영 현황(이사회·KPI·경영 점검)과 개인 데이터(약속·Claude 세션·메모리)를 통합 관리하는 이정우 본인의 공간이라 답변합니다.',
  'infra-lead': '나는 인프라팀장 박태성입니다. 서버, 디스크, 크론, Discord 봇 상태를 관리합니다. 시스템 상태에 대해 쉽게 설명합니다.',
  'academy-lead': '나는 학습팀장 신유진입니다. 기술 학습 큐레이션 전담 — CS/아키텍처/시스템 디자인/책 요약을 관리합니다. 면접 준비는 커리어팀 소관이라 학습팀에서 다루지 않습니다.',
  'trend-lead': '나는 정보팀장 강나연입니다. 뉴스, 시장 트렌드, 기술 동향을 분석합니다. 시장 상황을 쉽게 설명합니다.',
  'record-lead': '나는 기록팀장 한소희입니다. 일일 대화 기록, RAG 인덱싱, 데이터 아카이빙을 담당합니다.',
  'career-lead': '나는 커리어팀장 김서연입니다. 채용 시장 분석, 이력서, 면접 준비를 지원합니다.',
  'brand-lead': '나는 브랜드팀장 정하은입니다. 오픈소스 전략, 기술 블로그, GitHub 성장을 관리합니다.',
  'audit-lead': '나는 감사팀장 류태환입니다. 크론 실패 추적, E2E 테스트, 시스템 품질을 감시합니다.',
  'cron-engine': '나는 크론 엔진 관리자입니다. 자동화 태스크 스케줄링과 실행 상태를 관리합니다.',
  'discord-bot': '나는 Discord 봇 관리자입니다. 봇 프로세스 상태와 채팅 시스템을 관리합니다.',
  'disk-storage': '나는 디스크 스토리지 관리자입니다. 로컬 스토리지 사용량과 정리 상태를 관리합니다.',
};

// --- Team context gathering ---

const JARVIS_HOME = path.join(process.env.HOME || '', '.jarvis');
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
  if (cached && Date.now() - cached.ts < CHAT_CONTEXT_TTL_MS) return cached.value;

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
    case 'president': {
      // 대표실 — AI 경영 데이터 + 오너 개인 데이터 통합
      const minutesFile = latestFileIn(path.join(JARVIS_HOME, 'state', 'board-minutes'), /\.md$/);
      const minutes = minutesFile ? safeRead(minutesFile, 5000) : '';
      const contextBus = safeRead(path.join(JARVIS_HOME, 'state', 'context-bus.md'), 3000);
      const stats = cronStats(cronLog);
      const commits = grepLines(cronLog, ['board-meeting', 'ceo-daily-digest', 'council'], 8);
      value = `자비스 AI 경영 최근 활동:\n${commits || '(없음)'}\n\n최근 보드 미팅${minutesFile ? ` (${path.basename(minutesFile)})` : ''}:\n${tailLines(minutes, 30) || '(없음)'}\n\n컨텍스트 버스:\n${tailLines(contextBus, 20) || '(없음)'}\n\n오늘 전체 통계:\n- 크론 실행: ${stats.total}\n- 실패: ${stats.fail}\n- 디스크: ${diskUsage()}\n- Discord 봇: ${botStatus()}`;
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

// TODO(frontend): ChatPanel.tsx / VirtualOffice.tsx의 sendMessage는 SSE 파싱으로 전환 필요.
// 응답은 JSON이 아닌 text/event-stream (data: {"token":"..."} / data: {"done":true,"id":N}).

// Groq llama-3.3-70b-versatile (OpenAI 호환 SSE 스트리밍)
// MODEL 문자열은 lib/chat-cost.ts SSoT에서 import — typo 시 price table miss → costUsd=0 방지
const MODEL = GROQ_LLAMA_70B;
const MAX_TOKENS = 1200;
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
  try {
    const body = await req.json();
    teamId = body.teamId;
    message = body.message;
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
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
  const persona = systemPrompt.split('입니다')[0] + '입니다';

  const userContent = `=== 오늘 팀의 실제 활동 데이터 ===
${teamContext || '(수집된 데이터 없음)'}

=== 이전 대화 ===
${conversationContext}

=== 사용자 질문 ===
${message}

위 실제 데이터를 근거로 ${persona}의 입장에서 한국어로 답변하세요. 데이터에 없는 내용을 지어내지 마세요. 짧고 구체적으로. 절대 "이전 세션" 같은 말 하지 마세요.`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let aborted = false;

      const onAbort = () => {
        aborted = true;
      };
      req.signal?.addEventListener('abort', onAbort);

      try {
        const groqRes = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: 0.5,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }),
          signal: req.signal,
        });

        if (!groqRes.ok || !groqRes.body) {
          const errBody = await groqRes.text().catch(() => '');
          throw new Error(`Groq HTTP ${groqRes.status}: ${errBody.slice(0, 300)}`);
        }

        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Groq SSE는 OpenAI 호환: `data: {...}\n\n` lines, 마지막은 `data: [DONE]`
        // 마지막 청크 직전(stream_options 없이도)에 `usage` 필드가 포함된 chunk가 옴
        outer: while (true) {
          if (aborted) {
            try { await reader.cancel(); } catch { /* ignore */ }
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE 이벤트 단위 분리: 빈 줄(\n\n)이 구분자
          let sepIdx;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            // 각 이벤트는 여러 줄 가능하지만 Groq는 보통 단일 `data: ` 라인
            for (const line of rawEvent.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload) continue;
              if (payload === '[DONE]') {
                break outer;
              }
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
                  usage?: { prompt_tokens?: number; completion_tokens?: number };
                  x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
                };
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
                // usage는 마지막 chunk에 옴 (top-level 또는 x_groq 안)
                const usage = parsed.usage ?? parsed.x_groq?.usage;
                if (usage) {
                  inputTokens = usage.prompt_tokens ?? inputTokens;
                  outputTokens = usage.completion_tokens ?? outputTokens;
                }
              } catch {
                // 비-JSON 라인은 무시
              }
            }
          }
        }

        if (aborted) {
          controller.close();
          return;
        }

        // Persist assistant message
        const result = db.prepare(
          'INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)'
        ).run(teamId, 'assistant', fullText);
        const savedId = Number(result.lastInsertRowid);

        // Record cost (best-effort) — usage가 비어 있으면 skip
        if (inputTokens > 0 || outputTokens > 0) {
          try {
            await recordCost({ model: MODEL, inputTokens, outputTokens });
          } catch (costErr) {
            console.error('[game-chat] recordCost failed:', costErr);
          }
        }

        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ done: true, id: savedId, usage: { inputTokens, outputTokens } })}\n\n`),
        );
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[game-chat] stream error:', msg);
        try {
          // 실패한 사용자 메시지에 대해 에러 컨텐츠도 assistant로 남겨서 UI 일관성 유지
          if (fullText.length === 0) {
            db.prepare('INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)')
              .run(teamId, 'assistant', `응답 처리 중 오류: ${msg.slice(0, 200)}`);
          }
        } catch {
          /* ignore persistence error */
        }
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg.slice(0, 500) })}\n\n`));
        } catch {
          /* controller may be closed */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      } finally {
        req.signal?.removeEventListener('abort', onAbort);
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
