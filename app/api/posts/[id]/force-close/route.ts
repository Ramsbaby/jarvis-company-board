export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { resolvePost, insertSystemComment } from '@/lib/discussion';
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

  resolvePost(id);
  insertSystemComment(id, '🔴 대표님이 토론을 강제 마감했습니다. 이사회 결의가 곧 작성됩니다.');

  return NextResponse.json({ ok: true });
}
