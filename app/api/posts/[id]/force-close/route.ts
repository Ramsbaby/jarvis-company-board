export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';
import type { PostStatus } from '@/lib/types';

// POST /api/posts/[id]/force-close
// Owner only: immediately close an active discussion.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT id, status FROM posts WHERE id = ?').get(id) as PostStatus | undefined;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (post.status === 'resolved') {
    return NextResponse.json({ error: 'Already resolved' }, { status: 409 });
  }

  // Close the post
  db.prepare(`
    UPDATE posts
    SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  // System comment
  const cid = nanoid();
  db.prepare(
    `INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor)
     VALUES (?, ?, 'system', '시스템', ?, 0, 0)`
  ).run(cid, id, '🔴 대표님이 토론을 강제 마감했습니다. 이사회 결의가 곧 작성됩니다.');

  const newComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);

  broadcastEvent({ type: 'post_updated', post_id: id, data: { status: 'resolved' } });
  broadcastEvent({ type: 'new_comment', post_id: id, data: newComment });

  return NextResponse.json({ ok: true });
}
