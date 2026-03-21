export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { cookies } from 'next/headers';

const SYSTEM_PROMPT = `당신은 개발 태스크 제목 작성 전문가입니다.
이사회 결의에서 파싱된 기술적 지시사항을 비개발자도 이해할 수 있는 한국어로 변환합니다.

규칙:
- title: 40자 이내, 코드 백틱 없이, "무엇을 하는 작업인지" 동사 중심으로
- detail: 이 작업이 왜 필요한지 + 무엇을 해야 하는지 2-3문장. 꼭 필요한 기술 용어는 괄호 안에 영문 표기 가능
- 어색한 기계 번역 금지, 자연스러운 한국어로

반드시 JSON만 응답: {"title":"...", "detail":"..."}`;

async function rewriteWithHaiku(
  title: string,
  detail: string,
  postTitle: string,
): Promise<{ title: string; detail: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userContent = `원문 제목: ${title}
원문 세부: ${detail || '(없음)'}
출처 토론: ${postTitle || '이사회 토론'}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as any;
    const text: string = data?.content?.[0]?.text?.trim() ?? '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    const json = JSON.parse(match[0]);
    if (!json?.title || !json?.detail) return null;

    return { title: String(json.title).slice(0, 80), detail: String(json.detail) };
  } catch {
    return null;
  }
}

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get('x-agent-key');
  if (agentKey && agentKey === process.env.AGENT_API_KEY) return true;
  // Session-based owner auth (checked synchronously, actual cookie read async below)
  return false;
}

// GET — preview which tasks would be rewritten
export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  if (!isAgent) {
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
    WHERE status = 'awaiting_approval' AND title LIKE '%\`%'
    ORDER BY created_at DESC
  `).all() as any[];

  return NextResponse.json({ count: tasks.length, tasks: tasks.map(t => ({ id: t.id, title: t.title })) });
}

// POST — batch rewrite all awaiting_approval tasks with backtick titles
export async function POST(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  if (!isAgent) {
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
    WHERE status IN ('awaiting_approval', 'pending') AND title LIKE '%\`%'
    ORDER BY created_at DESC
  `).all() as any[];

  if (tasks.length === 0) {
    return NextResponse.json({ message: '재작성할 태스크 없음', succeeded: 0, failed: 0 });
  }

  const results: { id: string; success: boolean; from?: string; to?: string; error?: string }[] = [];

  for (const task of tasks) {
    const postTitle = task.post_title || (task.source?.startsWith('board:') ? '이사회 토론' : '');
    const rewritten = await rewriteWithHaiku(task.title, task.detail || '', postTitle);

    if (rewritten) {
      db.prepare('UPDATE dev_tasks SET title = ?, detail = ? WHERE id = ?')
        .run(rewritten.title, rewritten.detail, task.id);
      results.push({ id: task.id, success: true, from: task.title, to: rewritten.title });
    } else {
      results.push({ id: task.id, success: false, from: task.title, error: 'Haiku 호출 실패' });
    }

    // 100ms 간격으로 rate limit 방지
    await new Promise(r => setTimeout(r, 150));
  }

  const succeeded = results.filter(r => r.success).length;
  return NextResponse.json({
    total: tasks.length,
    succeeded,
    failed: tasks.length - succeeded,
    results,
  });
}
