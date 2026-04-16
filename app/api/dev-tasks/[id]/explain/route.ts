export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import type { DevTask } from '@/lib/types';
import { CLAUDE_HAIKU_4_5 } from '@/lib/chat-cost';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key not set' }, { status: 503 });

  const { id } = await params;
  const db = getDb();
  const task = db.prepare('SELECT id, title, detail FROM dev_tasks WHERE id = ?').get(id) as Pick<DevTask, 'id' | 'title' | 'detail'> | undefined;
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU_4_5,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `아래는 Jarvis AI 시스템이 만들어야 할 개발 작업 제목입니다. 이정우 대표(개발자 아님)가 읽고 바로 이해할 수 있도록 쉬운 한국어로 2문장 이내로 설명해주세요. 영어·기술 용어 뒤에는 괄호로 쉬운 말을 붙이세요. 설명문만 출력.

작업 제목: ${task.title}`,
      }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return NextResponse.json({ error: 'AI 호출 실패' }, { status: 502 });
  const data = await res.json() as { content: Array<{ text: string }> };
  const explanation = data?.content?.[0]?.text?.trim() ?? '';
  if (!explanation) return NextResponse.json({ error: '설명 생성 실패' }, { status: 500 });

  // detail이 비어있으면 저장
  if (!task.detail || task.detail.trim() === '') {
    db.prepare('UPDATE dev_tasks SET detail = ? WHERE id = ?').run(explanation, id);
  }

  return NextResponse.json({ explanation });
}
