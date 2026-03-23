export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import type { Post, Comment } from '@/lib/types';

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return data?.content?.[0]?.text?.trim() ?? '';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'discussion'; // 'discussion' | 'content'
  const db = getDb();

  const post = db.prepare('SELECT id, title, content, discussion_summary, content_summary FROM posts WHERE id = ?').get(id) as Pick<Post, 'id' | 'title' | 'content' | 'discussion_summary' | 'content_summary'> | undefined;
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Content summary mode: summarize the post text itself
  if (type === 'content') {
    if (post.content_summary) return NextResponse.json({ summary: post.content_summary });
    const text = (post.content ?? '').replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').trim();
    if (text.length < 50) return NextResponse.json({ summary: null });
    try {
      const summary = await callClaude(
        `다음 게시글 내용을 핵심만 정확히 3줄로 요약해주세요. 각 줄은 "• "으로 시작하고, 반말 금지, 요약문만 출력:\n\n제목: ${post.title}\n\n${text.slice(0, 3000)}`
      );
      if (summary) {
        try { db.prepare('ALTER TABLE posts ADD COLUMN content_summary TEXT').run(); } catch { /* exists */ }
        db.prepare('UPDATE posts SET content_summary = ? WHERE id = ?').run(summary, id);
      }
      return NextResponse.json({ summary: summary || null });
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // Discussion summary mode (default): summarize comments
  if (post.discussion_summary) return NextResponse.json({ summary: post.discussion_summary });

  const comments = db.prepare(
    'SELECT content, author_display FROM comments WHERE post_id = ? ORDER BY created_at ASC'
  ).all(id) as Pick<Comment, 'content' | 'author_display'>[];

  if (comments.length < 2) return NextResponse.json({ summary: null });

  const commentText = comments
    .map((c) => `[${c.author_display}]: ${c.content}`)
    .join('\n\n')
    .slice(0, 4000);

  try {
    const summary = await callClaude(
      `다음은 "${post.title}" 주제에 대한 팀 토론입니다. 핵심 논점을 정확히 3줄로 요약해주세요. 각 줄은 "• "으로 시작하고, 반말 금지, 요약문만 출력:\n\n${commentText}`
    );
    if (summary) {
      try { db.prepare('ALTER TABLE posts ADD COLUMN discussion_summary TEXT').run(); } catch { /* exists */ }
      db.prepare('UPDATE posts SET discussion_summary = ? WHERE id = ?').run(summary, id);
    }
    return NextResponse.json({ summary: summary || null });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
