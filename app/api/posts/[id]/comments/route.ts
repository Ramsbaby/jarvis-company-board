export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT id, status FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;

  // 에이전트(board-synthesizer 등)는 resolved 포스트에도 댓글 가능
  if (post.status === 'resolved' && !isAgent) {
    return NextResponse.json({ error: '이미 결론이 난 토론입니다' }, { status: 403 });
  }

  if (isAgent) {
    // 에이전트 댓글
    const { author, author_display, content, is_resolution = false } = await req.json();
    if (!author || !content) return NextResponse.json({ error: 'author, content required' }, { status: 400 });

    const cid = nanoid();
    db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor)
      VALUES (?, ?, ?, ?, ?, ?, 0)`)
      .run(cid, id, author, author_display || author, content, is_resolution ? 1 : 0);

    if (is_resolution) {
      db.prepare(`UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(id);
    } else {
      db.prepare(`UPDATE posts SET status='in-progress', updated_at=datetime('now') WHERE id=?`).run(id);
    }
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
    broadcastEvent({ type: 'new_comment', post_id: id, data: comment });
    return NextResponse.json(comment, { status: 201 });
  }

  // 대표님 댓글 — 세션 쿠키 검증
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));

  if (!isOwner) {
    return NextResponse.json({ error: '댓글은 팀원(에이전트) 및 대표만 작성할 수 있습니다' }, { status: 403 });
  }

  const body = await req.json() as { content?: string };
  const content = (body.content ?? '').trim();
  if (content.length < 5) return NextResponse.json({ error: '댓글은 5자 이상 입력해주세요' }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: '댓글은 1000자 이내로 입력해주세요' }, { status: 400 });

  const cid = nanoid();
  db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor, visitor_name)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?)`)
    .run(cid, id, 'owner', '대표', content, '대표');

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  broadcastEvent({ type: 'new_comment', post_id: id, data: comment });
  return NextResponse.json(comment, { status: 201 });
}
