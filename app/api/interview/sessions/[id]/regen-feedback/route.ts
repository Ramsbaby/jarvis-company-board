export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import { getFeedbackSystemPrompt } from '@/lib/interview-data';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';

function nanoid() {
  return `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractJson(text: string): Record<string, unknown> {
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1]); } catch {} }
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) { try { return JSON.parse(raw[0]); } catch {} }
  return {};
}

/**
 * POST /api/interview/sessions/[id]/regen-feedback
 * body: { messageId: string }
 *
 * 기존 피드백 메시지 ID를 받아 해당 Q&A 쌍을 재평가한다.
 * 스트리밍 없이 JSON 응답으로 반환 (재생성 버튼 용도).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

  const db = getDb();
  const session = db.prepare(`SELECT * FROM interview_sessions WHERE id = ?`).get(id) as {
    id: string; company: string; category: string; difficulty: string;
  } | undefined;
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // 재생성할 피드백 메시지 확인
  const feedbackMsg = db.prepare(
    `SELECT * FROM interview_messages WHERE id = ? AND session_id = ? AND role = 'feedback'`
  ).get(messageId, id) as { id: string; created_at: string } | undefined;
  if (!feedbackMsg) return NextResponse.json({ error: 'Feedback message not found' }, { status: 404 });

  // 해당 피드백 직전의 answer 찾기
  const answerMsg = db.prepare(
    `SELECT * FROM interview_messages
     WHERE session_id = ? AND role = 'answer' AND created_at < ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(id, feedbackMsg.created_at) as { id: string; content: string; created_at: string } | undefined;
  if (!answerMsg) return NextResponse.json({ error: 'Answer not found' }, { status: 404 });

  // answer 직전의 question 찾기
  const questionMsg = db.prepare(
    `SELECT * FROM interview_messages
     WHERE session_id = ? AND role = 'question' AND created_at < ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(id, answerMsg.created_at) as { id: string; content: string; created_at: string } | undefined;

  // 이전 대화 이력 (최근 3쌍, 일관성 체크용)
  const prevMessages = db.prepare(
    `SELECT role, content FROM interview_messages
     WHERE session_id = ? AND role IN ('question', 'answer') AND created_at < ?
     ORDER BY created_at ASC`
  ).all(id, answerMsg.created_at) as { role: string; content: string }[];

  let conversationHistory: string | undefined;
  const pairs: string[] = [];
  let i = 0;
  while (i < prevMessages.length - 1 && pairs.length < 3) {
    if (prevMessages[i].role === 'question' && prevMessages[i + 1].role === 'answer') {
      pairs.push(`Q: ${prevMessages[i].content.slice(0, 200)}\nA: ${prevMessages[i + 1].content.slice(0, 300)}`);
      i += 2;
    } else { i++; }
  }
  if (pairs.length > 0) conversationHistory = pairs.join('\n\n---\n\n');

  const systemPrompt = getFeedbackSystemPrompt(session.company, session.category, session.difficulty, conversationHistory);
  const userPrompt = `[면접 질문]\n${questionMsg?.content ?? '이전 질문'}\n\n[지원자 답변]\n${answerMsg.content}\n\n위 답변을 평가하여 JSON 형식으로 출력하세요.`;

  let raw: string;
  try {
    raw = await callLLM(userPrompt, {
      model: MODEL_QUALITY,
      systemPrompt,
      maxTokens: 2500,
      temperature: 0.3,
    });
  } catch {
    return NextResponse.json({ error: 'LLM 호출 실패' }, { status: 500 });
  }

  const parsed = extractJson(raw);
  const score = typeof parsed.score === 'number' ? parsed.score : null;
  const strengths = Array.isArray(parsed.strengths) ? parsed.strengths as string[] : [];
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses as string[] : [];
  const betterAnswer = typeof parsed.better_answer === 'string' ? parsed.better_answer : null;
  const missingKeywords = Array.isArray(parsed.missing_keywords) ? parsed.missing_keywords as string[] : [];

  // interview_messages 업데이트 (기존 피드백 덮어쓰기)
  db.prepare(
    `UPDATE interview_messages
     SET content = ?, score = ?, strengths = ?, weaknesses = ?, better_answer = ?, missing_keywords = ?
     WHERE id = ?`
  ).run(raw, score, JSON.stringify(strengths), JSON.stringify(weaknesses), betterAnswer, JSON.stringify(missingKeywords), messageId);

  // interview_feedback 업데이트 (UPSERT)
  if (score !== null) {
    try {
      const existing = db.prepare(`SELECT id FROM interview_feedback WHERE message_id = ?`).get(messageId) as { id: string } | undefined;
      if (existing) {
        db.prepare(
          `UPDATE interview_feedback
           SET score = ?, strengths = ?, weaknesses = ?, missing_keywords = ?, better_answer = ?, evaluator_verdict = 'regen', parse_error = 0
           WHERE message_id = ?`
        ).run(score, JSON.stringify(strengths), JSON.stringify(weaknesses), JSON.stringify(missingKeywords), betterAnswer, messageId);
      } else {
        db.prepare(
          `INSERT INTO interview_feedback (id, session_id, message_id, score, strengths, weaknesses, missing_keywords, better_answer, evaluator_verdict, parse_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'regen', 0)`
        ).run(nanoid(), id, messageId, score, JSON.stringify(strengths), JSON.stringify(weaknesses), JSON.stringify(missingKeywords), betterAnswer);
      }
    } catch { /* 무시 */ }
  }

  // 클라이언트가 메시지를 업데이트할 수 있도록 최신 상태 반환
  return NextResponse.json({
    ok: true,
    message: {
      id: messageId,
      session_id: id,
      role: 'feedback' as const,
      content: raw,
      score,
      strengths: JSON.stringify(strengths),
      weaknesses: JSON.stringify(weaknesses),
      better_answer: betterAnswer,
      missing_keywords: JSON.stringify(missingKeywords),
      created_at: feedbackMsg.created_at,
    },
  });
}
