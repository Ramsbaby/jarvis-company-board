export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';
import { getSystemPrompt } from '@/lib/interview-data';

function nanoid() {
  return `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  // 1시간 이상 경과한 미완료 세션 자동 종료
  db.prepare(
    `UPDATE interview_sessions SET status = 'abandoned', completed_at = datetime('now')
     WHERE status NOT IN ('completed', 'abandoned')
     AND created_at < datetime('now', '-1 hour')`
  ).run();
  const sessions = db.prepare(`SELECT * FROM interview_sessions ORDER BY created_at DESC LIMIT 20`).all();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { company, category, difficulty = 'mid', focusKeywords } = await req.json();
  if (!company || !category) return NextResponse.json({ error: 'company and category required' }, { status: 400 });

  const db = getDb();
  const sessionId = nanoid();

  // LLM 호출 먼저 (실패 시 세션 자체를 생성하지 않음)
  const systemPrompt = getSystemPrompt(company, category, difficulty, focusKeywords);
  let firstQuestion: string;
  try {
    firstQuestion = await callLLM('면접을 시작합니다. 첫 번째 질문을 해주세요.', {
      model: MODEL_QUALITY, systemPrompt, maxTokens: 400, temperature: 0.7,
    });
  } catch {
    // LLM 실패 시 fallback 질문 사용 (세션은 계속 생성)
    firstQuestion = '지원자분의 현재 프로젝트에서 가장 기술적으로 어려웠던 부분을 설명해 주시겠습니까?';
  }

  // 트랜잭션으로 세션 + 첫 질문 원자적 삽입 (부분 저장 방지)
  try {
    const insertAll = db.transaction(() => {
      db.prepare(`INSERT INTO interview_sessions (id, company, category, difficulty) VALUES (?, ?, ?, ?)`).run(sessionId, company, category, difficulty);
      const msgId = nanoid();
      db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`).run(msgId, sessionId, firstQuestion);
    });
    insertAll();
  } catch (err) {
    console.error('[session/create] DB 저장 실패:', err);
    return NextResponse.json({ error: '세션 생성 중 오류가 발생했습니다. 다시 시도해 주세요.' }, { status: 500 });
  }

  return NextResponse.json({ sessionId, firstQuestion });
}
