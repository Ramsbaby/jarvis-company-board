export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { cookies } from 'next/headers';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';
import type { DevTask } from '@/lib/types';

const REWRITE_PROMPT_TEMPLATE = (title: string, detail: string, postTitle: string) =>
  `당신은 개발 태스크 제목 작성 전문가입니다.
이사회 결의에서 파싱된 기술적 지시사항을 비개발자도 이해할 수 있는 자연스러운 한국어로 변환해주세요.

규칙:
- title: 40자 이내, 코드 백틱 없이, "무엇을 하는 작업인지" 동사 중심으로
- detail: 이 작업이 왜 필요한지 + 구체적으로 무엇을 해야 하는지 2-3문장. 기술 용어는 괄호 안에 영문 표기 가능
- 자연스러운 한국어, 직역 금지

원문 제목: ${title}
원문 세부: ${detail || '(없음)'}
출처 토론: ${postTitle || '이사회 토론'}

JSON만 응답 (다른 텍스트 없이):
{"title":"...", "detail":"..."}`;

async function rewriteTitle(
  title: string,
  detail: string,
  postTitle: string,
): Promise<{ title: string; detail: string } | null> {
  try {
    const prompt = REWRITE_PROMPT_TEMPLATE(title, detail, postTitle);
    const text = await callLLM(prompt, { model: MODEL_QUALITY, maxTokens: 400, timeoutMs: 20000 });
    // Extract JSON — greedy match to handle nested braces
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const json = JSON.parse(match[0]);
    if (!json?.title || !json?.detail) return null;
    return { title: String(json.title).slice(0, 80), detail: String(json.detail) };
  } catch {
    return null;
  }
}

function checkAuth(req: NextRequest): Promise<boolean> | boolean {
  const agentKey = req.headers.get('x-agent-key');
  return agentKey === process.env.AGENT_API_KEY;
}

// GET — preview which tasks would be rewritten
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE)?.value;
    const password = process.env.VIEWER_PASSWORD;
    if (!password || !session || session !== makeToken(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();
  const tasks = db.prepare(`
    SELECT id, title FROM dev_tasks
    WHERE status IN ('awaiting_approval') AND title LIKE '%\`%'
    ORDER BY created_at DESC
  `).all() as Pick<DevTask, 'id' | 'title'>[];

  return NextResponse.json({ count: tasks.length, tasks: tasks.map(t => ({ id: t.id, title: t.title })) });
}

// POST — batch rewrite all awaiting_approval/pending tasks with backtick titles
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE)?.value;
    const password = process.env.VIEWER_PASSWORD;
    if (!password || !session || session !== makeToken(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();
  const tasks = db.prepare(`
    SELECT id, title, detail, post_title, source FROM dev_tasks
    WHERE status IN ('awaiting_approval') AND title LIKE '%\`%'
    ORDER BY created_at DESC
  `).all() as Pick<DevTask, 'id' | 'title' | 'detail' | 'post_title' | 'source'>[];

  if (tasks.length === 0) {
    return NextResponse.json({ message: '재작성할 태스크 없음', succeeded: 0, failed: 0, total: 0 });
  }

  const results: { id: string; success: boolean; from?: string; to?: string; error?: string }[] = [];

  for (const task of tasks) {
    const postTitle = task.post_title || (task.source?.startsWith('board:') ? '이사회 토론' : '');
    const rewritten = await rewriteTitle(task.title, task.detail || '', postTitle);

    if (rewritten) {
      db.prepare('UPDATE dev_tasks SET title = ?, detail = ? WHERE id = ?')
        .run(rewritten.title, rewritten.detail, task.id);
      results.push({ id: task.id, success: true, from: task.title, to: rewritten.title });
    } else {
      results.push({ id: task.id, success: false, from: task.title, error: 'LLM 호출 실패' });
    }

    // 200ms 간격으로 rate limit 방지
    await new Promise(r => setTimeout(r, 200));
  }

  const succeeded = results.filter(r => r.success).length;
  return NextResponse.json({
    total: tasks.length,
    succeeded,
    failed: tasks.length - succeeded,
    results,
  });
}
