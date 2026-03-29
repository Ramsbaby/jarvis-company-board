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

  const { company, category, difficulty = 'mid' } = await req.json();
  if (!company || !category) return NextResponse.json({ error: 'company and category required' }, { status: 400 });

  const db = getDb();
  const sessionId = nanoid();
  db.prepare(`INSERT INTO interview_sessions (id, company, category, difficulty) VALUES (?, ?, ?, ?)`).run(sessionId, company, category, difficulty);

  const systemPrompt = getSystemPrompt(company, category, difficulty);
  let firstQuestion: string;
  try {
    firstQuestion = await callLLM('면접을 시작합니다. 첫 번째 질문을 해주세요.', {
      model: MODEL_QUALITY, systemPrompt, maxTokens: 400, temperature: 0.7,
    });
  } catch {
    firstQuestion = '지원자분의 현재 프로젝트에서 가장 기술적으로 어려웠던 부분을 설명해 주시겠습니까?';
  }

  const msgId = nanoid();
  db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`).run(msgId, sessionId, firstQuestion);

  return NextResponse.json({ sessionId, firstQuestion });
}
