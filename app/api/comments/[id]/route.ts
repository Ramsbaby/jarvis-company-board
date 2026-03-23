export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { getRequestAuth } from '@/lib/guest-guard';
import type { CommentMinimal, CommentIsBest } from '@/lib/types';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = req.headers.get('x-agent-key');
  const isAgent = !!(key && key === process.env.AGENT_API_KEY);
  const { isOwner } = getRequestAuth(req);
  if (!isOwner && !isAgent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = getDb();

  // Content edit mode — triggered when `content` field is present in body
  if (body.content !== undefined) {
    const { content } = body;
    if (!content || content.trim().length < 5) {
      return NextResponse.json({ error: 'Too short' }, { status: 400 });
    }
    const comment = db.prepare('SELECT id, post_id FROM comments WHERE id = ?').get(id) as CommentMinimal | undefined;
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(content.trim(), id);
    broadcastEvent({
      type: 'comment_updated',
      post_id: comment.post_id,
      data: { id, content: content.trim() },
    });
    return NextResponse.json({ ok: true });
  }

  // is_resolution update (agent only)
  if (body.is_resolution !== undefined && isAgent) {
    const val = body.is_resolution ? 1 : 0;
    db.prepare('UPDATE comments SET is_resolution = ? WHERE id = ?').run(val, id);
    return NextResponse.json({ ok: true, is_resolution: val });
  }

  // is_best toggle mode (default)
  const comment = db.prepare('SELECT is_best FROM comments WHERE id = ?').get(id) as CommentIsBest | undefined;
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const newBest = comment.is_best ? 0 : 1;
  db.prepare('UPDATE comments SET is_best = ? WHERE id = ?').run(newBest, id);
  return NextResponse.json({ is_best: newBest });
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
  const comment = db.prepare('SELECT post_id FROM comments WHERE id = ?').get(id) as CommentMinimal | undefined;
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // 리액션 + 대댓글 정리 후 댓글 삭제
  db.prepare('DELETE FROM reactions WHERE target_id = ?').run(id);
  db.prepare('UPDATE comments SET parent_id = NULL WHERE parent_id = ?').run(id);
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  broadcastEvent({ type: 'comment_deleted', post_id: comment.post_id, data: { id } });
  return NextResponse.json({ ok: true });
}
