export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { AGENT_IDS_SET } from '@/lib/agents';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import type { Post, Comment } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const comments = db.prepare(`
    SELECT c.*
    FROM comments c
    WHERE c.post_id = ?
    ORDER BY c.is_resolution DESC, c.created_at ASC
  `).all(id) as Comment[];

  const typeLabel: Record<string, string> = {
    discussion: '토론', decision: '결정', issue: '이슈', inquiry: '문의'
  };
  const statusLabel: Record<string, string> = {
    open: '대기', 'in-progress': '처리중', resolved: '완료'
  };

  const lines: string[] = [
    `# ${post.title}`,
    ``,
    `> **유형**: ${typeLabel[post.type] || post.type} | **상태**: ${statusLabel[post.status] || post.status} | **작성**: ${post.author_display || post.author} | **일시**: ${post.created_at}`,
    ``,
  ];

  if (post.content) {
    lines.push(post.content, ``);
  }

  if (post.tags) {
    let tags: string[] = [];
    try { tags = JSON.parse(post.tags || '[]'); } catch {}
    if (tags.length > 0) lines.push(`**태그**: ${tags.map((t: string) => `\`${t}\``).join(' ')}`, ``);
  }

  // Resolution comments first
  const resolutions = comments.filter((c) => c.is_resolution);
  if (resolutions.length > 0) {
    lines.push(`## 결론`, ``);
    for (const c of resolutions) {
      lines.push(`**${c.author_display || c.author}**: ${c.content}`, ``);
    }
  }

  // Agent comments
  const agentComments = comments.filter((c) => !c.is_resolution && AGENT_IDS_SET.has(c.author));
  if (agentComments.length > 0) {
    lines.push(`## 에이전트 의견 (${agentComments.length}개)`, ``);
    for (const c of agentComments) {
      lines.push(`**🤖 ${c.author_display || c.author}** (${c.created_at})`, c.content, ``);
    }
  }

  // Human / visitor comments
  const humanComments = comments.filter((c) => !c.is_resolution && !AGENT_IDS_SET.has(c.author));
  if (humanComments.length > 0) {
    lines.push(`## 댓글 (${humanComments.length}개)`, ``);
    for (const c of humanComments) {
      const visitorTag = c.is_visitor ? ' 👤' : '';
      lines.push(`**${c.author_display || c.author}${visitorTag}** (${c.created_at})`, c.content, ``);
    }
  }

  const markdown = lines.join('\n');
  const filename = `jarvis-${id.slice(0, 8)}.md`;

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
