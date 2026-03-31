export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import { getFeedbackSystemPrompt, getEvaluatorSystemPrompt } from '@/lib/interview-data';
import Anthropic from '@anthropic-ai/sdk';

function nanoid() {
  return `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 마크다운 코드블록 우선, 없으면 raw JSON
function extractJson(text: string): Record<string, unknown> {
  // 1. ```json ... ``` 블록
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch {}
  }
  // 2. raw { ... }
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) {
    try { return JSON.parse(raw[0]); } catch {}
  }
  return {};
}

import type Database from 'better-sqlite3';

/** interview_messages에 피드백 저장 후 interview_feedback 테이블에도 듀얼 라이트 */
function saveFeedbackDual(
  db: Database.Database,
  sessionId: string,
  fullText: string,
  score: number | null,
  strengths: string[],
  weaknesses: string[],
  betterAnswer: string | null,
  missingKeywords: string[],
  parseError = false,
  evaluatorVerdict: 'fair' | 'too_generous' | 'too_harsh' = 'fair',
): string {
  const feedbackId = nanoid();
  db.prepare(
    `INSERT INTO interview_messages (id, session_id, role, content, score, strengths, weaknesses, better_answer, missing_keywords)
     VALUES (?, ?, 'feedback', ?, ?, ?, ?, ?, ?)`
  ).run(feedbackId, sessionId, fullText, score, JSON.stringify(strengths), JSON.stringify(weaknesses), betterAnswer, JSON.stringify(missingKeywords));

  // interview_feedback 정규화 테이블에도 저장 (통계 + evaluator verdict용)
  if (score !== null) {
    try {
      db.prepare(
        `INSERT OR IGNORE INTO interview_feedback (id, session_id, message_id, score, strengths, weaknesses, missing_keywords, better_answer, parse_error, evaluator_verdict)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(nanoid(), sessionId, feedbackId, score, JSON.stringify(strengths), JSON.stringify(weaknesses), JSON.stringify(missingKeywords), betterAnswer, parseError ? 1 : 0, evaluatorVerdict);
    } catch { /* 마이그레이션 전 구버전 무시 */ }
  }

  return feedbackId;
}

interface EvaluatorResult {
  verdict: 'fair' | 'too_generous' | 'too_harsh';
  adjustedScore: number;
  additionalWeaknesses: string[];
}

/**
 * Generator-Evaluator 패턴 — 완전히 새로운 컨텍스트로 1차 평가를 교차 검증
 * 우선순위: Claude Relay(독립 세션) → Groq fallback
 * LLM의 구조적 관대함(5~15점 부풀리기)을 보정한다.
 * 실패 시 defaultResult 반환 (safe fallback)
 */
async function runEvaluator(
  question: string,
  answer: string,
  generatorScore: number,
  generatorWeaknesses: string[],
  companyId: string,
): Promise<EvaluatorResult> {
  const defaultResult: EvaluatorResult = {
    verdict: 'fair',
    adjustedScore: generatorScore,
    additionalWeaknesses: [],
  };

  if (generatorScore === null) return defaultResult;

  const systemPrompt = getEvaluatorSystemPrompt(companyId);
  const userPrompt = `[면접 질문]\n${question.slice(0, 400)}\n\n[지원자 답변]\n${answer.slice(0, 600)}\n\n[1차 평가 결과]\n점수: ${generatorScore}점\n약점: ${generatorWeaknesses.slice(0, 3).join(' / ') || '없음'}\n\n위 평가를 검토하고 JSON으로만 응답하세요.`;

  const parseResult = (text: string): EvaluatorResult | null => {
    const parsed = extractJson(text);
    if (!parsed.verdict) return null;
    const rawScore = parsed.adjusted_score;
    return {
      verdict: (parsed.verdict as EvaluatorResult['verdict']) ?? 'fair',
      adjustedScore: typeof rawScore === 'number'
        ? Math.max(0, Math.min(100, rawScore))
        : generatorScore,
      additionalWeaknesses: Array.isArray(parsed.additional_weaknesses)
        ? (parsed.additional_weaknesses as string[]).slice(0, 2)
        : [],
    };
  };

  // ── 1순위: Claude Relay (독립 컨텍스트, 기존 면접 대화와 완전히 분리) ──
  const claudeRelayUrl = process.env.CLAUDE_RELAY_URL;
  const claudeRelayToken = process.env.CLAUDE_RELAY_TOKEN || 'jarvis-claude-relay-2026';
  if (claudeRelayUrl) {
    try {
      const res = await fetch(`${claudeRelayUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${claudeRelayToken}`,
        },
        body: JSON.stringify({ systemPrompt, userPrompt }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; content: string };
        const result = parseResult(data.content ?? '');
        if (result) return result;
      }
    } catch (err) {
      console.warn('[evaluator] Claude Relay 실패, Groq fallback:', err);
    }
  }

  // ── 2순위: Groq fallback ──
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return defaultResult;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return defaultResult;
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const result = parseResult(data.choices?.[0]?.message?.content ?? '');
    return result ?? defaultResult;
  } catch (err) {
    console.warn('[evaluator] Groq fallback도 실패, 원본 점수 유지:', err);
    return defaultResult;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const { answer, questionContent } = await req.json();
  if (!answer?.trim()) return new Response(JSON.stringify({ error: 'answer required' }), { status: 400 });

  const db = getDb();
  const session = db.prepare(`SELECT * FROM interview_sessions WHERE id = ?`).get(id) as {
    id: string; company: string; category: string; difficulty: string;
  } | undefined;
  if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });

  const answerId = nanoid();
  db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'answer', ?)`).run(answerId, id, answer);

  // 이전 Q&A 대화 이력 (최근 3쌍) — 일관성 체크용
  const prevMessages = db.prepare(
    `SELECT role, content FROM interview_messages
     WHERE session_id = ? AND role IN ('question', 'answer')
     ORDER BY created_at ASC`
  ).all(id) as { role: string; content: string }[];

  let conversationHistory: string | undefined;
  if (prevMessages.length >= 2) {
    const pairs: string[] = [];
    let i = 0;
    while (i < prevMessages.length - 1 && pairs.length < 3) {
      if (prevMessages[i].role === 'question' && prevMessages[i + 1].role === 'answer') {
        pairs.push(`Q: ${prevMessages[i].content.slice(0, 200)}\nA: ${prevMessages[i + 1].content.slice(0, 300)}`);
        i += 2;
      } else {
        i++;
      }
    }
    if (pairs.length > 0) {
      conversationHistory = pairs.join('\n\n---\n\n');
    }
  }

  const feedbackSystemPrompt = getFeedbackSystemPrompt(session.company, session.category, session.difficulty, conversationHistory);
  const feedbackUserPrompt = `[면접 질문]\n${questionContent ?? '이전 질문'}\n\n[지원자 답변]\n${answer}\n\n위 답변을 평가하여 JSON 형식으로 출력하세요.`;

  // Claude Relay 우선 (CLAUDE_RELAY_URL이 설정된 경우)
  const claudeRelayUrl = process.env.CLAUDE_RELAY_URL;
  const claudeRelayToken = process.env.CLAUDE_RELAY_TOKEN || 'jarvis-claude-relay-2026';

  if (claudeRelayUrl) {
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          const relayRes = await fetch(`${claudeRelayUrl}/feedback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${claudeRelayToken}`,
            },
            body: JSON.stringify({ systemPrompt: feedbackSystemPrompt, userPrompt: feedbackUserPrompt, maxTokens: 2500 }),
            signal: AbortSignal.timeout(90000),
          });

          if (!relayRes.ok) throw new Error(`Relay error: ${relayRes.status}`);
          const relayData = await relayRes.json() as { ok: boolean; content: string };
          const fullText = relayData.content || '';

          // 토큰 스트리밍 시뮬레이션 (50자씩)
          for (let i = 0; i < fullText.length; i += 50) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ token: fullText.slice(i, i + 50) })}\n\n`));
          }

          const parsed = extractJson(fullText);
          const genScore = typeof parsed.score === 'number' ? parsed.score : null;
          const strengths = Array.isArray(parsed.strengths) ? parsed.strengths as string[] : [];
          const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses as string[] : [];
          const betterAnswer = typeof parsed.better_answer === 'string' ? parsed.better_answer : '';
          const missingKeywords = Array.isArray(parsed.missing_keywords) ? parsed.missing_keywords as string[] : [];
          const nextQuestion = typeof parsed.next_question === 'string' ? parsed.next_question : null;

          // ── Evaluator: 교차 검증 ──
          const evalResult = genScore !== null
            ? await runEvaluator(questionContent ?? '', answer, genScore, weaknesses, session.company)
            : { adjustedScore: null, additionalWeaknesses: [], verdict: 'fair' as const };
          const finalScore = genScore !== null ? evalResult.adjustedScore : null;
          const allWeaknesses = [...weaknesses, ...evalResult.additionalWeaknesses];

          const parseError = Object.keys(parsed).length === 0;
          saveFeedbackDual(db, id, fullText, finalScore, strengths, allWeaknesses, betterAnswer, missingKeywords, parseError, evalResult.verdict);

          if (nextQuestion) {
            db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`)
              .run(nanoid(), id, nextQuestion);
          }

          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, score: finalScore, nextQuestion, evaluatorVerdict: evalResult.verdict })}\n\n`));
          controller.close();
        } catch (err) {
          console.error('[claude-relay] error, falling back to Groq:', err);
          // Groq fallback
          try {
            const apiKey = process.env.GROQ_API_KEY;
            if (apiKey) {
              const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  max_tokens: 2500,
                  temperature: 0.3,
                  response_format: { type: 'json_object' },
                  messages: [
                    { role: 'system', content: feedbackSystemPrompt },
                    { role: 'user', content: feedbackUserPrompt },
                  ],
                }),
              });
              if (groqRes.ok) {
                const groqData = await groqRes.json() as { choices: Array<{ message: { content: string } }> };
                const groqText = groqData.choices?.[0]?.message?.content ?? '';
                const groqParsed = extractJson(groqText);
                const genScore = typeof groqParsed.score === 'number' ? groqParsed.score : null;
                const strengths = Array.isArray(groqParsed.strengths) ? groqParsed.strengths as string[] : [];
                const weaknesses = Array.isArray(groqParsed.weaknesses) ? groqParsed.weaknesses as string[] : [];
                const betterAnswer = typeof groqParsed.better_answer === 'string' ? groqParsed.better_answer : '';
                const missingKeywords = Array.isArray(groqParsed.missing_keywords) ? groqParsed.missing_keywords as string[] : [];
                const nextQuestion = typeof groqParsed.next_question === 'string' ? groqParsed.next_question : null;

                const evalResult = genScore !== null
                  ? await runEvaluator(questionContent ?? '', answer, genScore, weaknesses, session.company)
                  : { adjustedScore: null, additionalWeaknesses: [], verdict: 'fair' as const };
                const finalScore = genScore !== null ? evalResult.adjustedScore : null;
                const allWeaknesses = [...weaknesses, ...evalResult.additionalWeaknesses];

                const groqParseError = Object.keys(groqParsed).length === 0;
                saveFeedbackDual(db, id, groqText, finalScore, strengths, allWeaknesses, betterAnswer, missingKeywords, groqParseError, evalResult.verdict);
                if (nextQuestion) {
                  db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`).run(nanoid(), id, nextQuestion);
                }
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, score: finalScore, nextQuestion, evaluatorVerdict: evalResult.verdict })}\n\n`));
                controller.close();
                return;
              }
            }
          } catch (fallbackErr) {
            console.error('[groq-fallback] error:', fallbackErr);
          }
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, score: null, nextQuestion: null, error: 'LLM 호출 실패' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      }
    });
  }

  const useClaudeApi = !!process.env.ANTHROPIC_API_KEY;

  if (useClaudeApi) {
    // Claude Sonnet 스트리밍
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        let fullText = '';

        try {
          const claudeStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 2500,
            system: feedbackSystemPrompt,
            messages: [{ role: 'user', content: feedbackUserPrompt }],
          });

          for await (const chunk of claudeStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const token = chunk.delta.text;
              fullText += token;
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ token })}\n\n`));
            }
          }

          const parsed = extractJson(fullText);
          const genScore = typeof parsed.score === 'number' ? parsed.score : null;
          const strengths = Array.isArray(parsed.strengths) ? parsed.strengths as string[] : [];
          const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses as string[] : [];
          const betterAnswer = parsed.better_answer ?? '';
          const missingKeywords = Array.isArray(parsed.missing_keywords) ? parsed.missing_keywords as string[] : [];
          const nextQuestion = parsed.next_question ?? null;

          // ── Evaluator: 교차 검증 ──
          const evalResult = genScore !== null
            ? await runEvaluator(questionContent ?? '', answer, genScore, weaknesses, session.company)
            : { adjustedScore: null, additionalWeaknesses: [], verdict: 'fair' as const };
          const finalScore = genScore !== null ? evalResult.adjustedScore : null;
          const allWeaknesses = [...weaknesses, ...evalResult.additionalWeaknesses];

          const parseError = Object.keys(parsed).length === 0;
          saveFeedbackDual(db, id, fullText, finalScore, strengths, allWeaknesses, betterAnswer as string | null, missingKeywords, parseError, evalResult.verdict);

          if (nextQuestion) {
            db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`)
              .run(nanoid(), id, nextQuestion as string);
          }

          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, score: finalScore, nextQuestion, evaluatorVerdict: evalResult.verdict })}\n\n`));
          controller.close();
        } catch {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, score: null, nextQuestion: null, error: 'LLM 호출 실패' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      }
    });
  } else {
    // Groq fallback
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return new Response('GROQ_API_KEY missing', { status: 500 });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        temperature: 0.3,
        stream: true,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: feedbackSystemPrompt },
          { role: 'user', content: feedbackUserPrompt },
        ],
      }),
    });

    if (!groqRes.ok) return new Response(JSON.stringify({ error: 'LLM error' }), { status: 500 });

    const encoder = new TextEncoder();
    let fullText = '';

    const stream = new ReadableStream({
      async start(controller) {
        const reader = groqRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content ?? '';
                if (token) {
                  fullText += token;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch { /* skip */ }
            }
          }

          let genScore: number | null = null;
          let strengths: string[] = [];
          let weaknesses: string[] = [];
          let betterAnswer: string | null = null;
          let missingKeywords: string[] = [];
          let nextQuestion: string | null = null;

          try {
            const jsonMatch = fullText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              genScore = parsed.score ?? null;
              strengths = parsed.strengths ?? [];
              weaknesses = parsed.weaknesses ?? [];
              betterAnswer = parsed.better_answer ?? null;
              missingKeywords = parsed.missing_keywords ?? [];
              nextQuestion = parsed.next_question ?? null;
            }
          } catch { /* keep nulls */ }

          // ── Evaluator: 교차 검증 ──
          const evalResult = genScore !== null
            ? await runEvaluator(questionContent ?? '', answer, genScore, weaknesses, session.company)
            : { adjustedScore: null, additionalWeaknesses: [], verdict: 'fair' as const };
          const finalScore = genScore !== null ? evalResult.adjustedScore : null;
          const allWeaknesses = [...weaknesses, ...evalResult.additionalWeaknesses];

          const parseError = genScore === null && strengths.length === 0 && weaknesses.length === 0;
          saveFeedbackDual(db, id, fullText, finalScore, strengths, allWeaknesses, betterAnswer, missingKeywords, parseError, evalResult.verdict);

          if (nextQuestion) {
            db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`).run(nanoid(), id, nextQuestion);
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, score: finalScore, nextQuestion, evaluatorVerdict: evalResult.verdict })}\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, score: null, nextQuestion: null, error: String(err) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }
}
