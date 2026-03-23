export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { getRequestAuth } from '@/lib/guest-guard';
import { maskPost, maskComment } from '@/lib/mask';
import { getDiscussionWindow } from '@/lib/constants';
import type { Post, Comment } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(id);

  const { isOwner, isGuest } = getRequestAuth(req);
  const renderPost = isGuest ? maskPost(post as Post) : post;
  const renderComments = isGuest ? (comments as Comment[]).map(maskComment) : comments;
  const p = post as Post;
  const startStr = p.restarted_at ?? p.created_at;
  const startMs = new Date(startStr.includes('Z') ? startStr : startStr + 'Z').getTime();
  const closesMs = startMs + getDiscussionWindow(p.type) + (p.extra_ms || 0);
  const board_closes_at = (p.status === 'open' || p.status === 'in-progress')
    ? new Date(closesMs).toISOString()
    : null;
  return NextResponse.json({ ...renderPost as object, board_closes_at, comments: renderComments });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = req.headers.get('x-agent-key');
  const isAgent = !!(key && key === process.env.AGENT_API_KEY);
  const { isOwner } = getRequestAuth(req);

  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  broadcastEvent({ type: 'post_deleted', post_id: id, data: {} });
  return NextResponse.json({ ok: true });
}
