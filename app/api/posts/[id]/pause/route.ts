export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { broadcastEvent } from '@/lib/sse';
import { getDiscussionWindow } from '@/lib/constants';
import type { Post } from '@/lib/types';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Owner only
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const post = db.prepare('SELECT id, type, paused_at, extra_ms, restarted_at, created_at FROM posts WHERE id = ?').get(id) as Pick<Post, 'id' | 'type' | 'paused_at' | 'extra_ms' | 'restarted_at' | 'created_at'> | undefined;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isPaused = !!post.paused_at;
  let newExtraMs = post.extra_ms ?? 0;

  if (isPaused) {
    // Resume: accumulate the pause duration into extra_ms so that time is not lost
    const pausedAtStr = post.paused_at!;
    const pausedAtMs = new Date(pausedAtStr + (pausedAtStr.endsWith('Z') ? '' : 'Z')).getTime();
    const pausedDuration = Date.now() - pausedAtMs;
    newExtraMs = newExtraMs + Math.max(0, pausedDuration);
    db.prepare(`UPDATE posts SET paused_at = NULL, extra_ms = ?, updated_at = datetime('now') WHERE id = ?`).run(newExtraMs, id);
  } else {
    db.prepare(`UPDATE posts SET paused_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
  }

  // Compute absolute expires_at so clients can update timers without recalculating
  const startStr = post.restarted_at ?? post.created_at;
  const startMs = new Date(startStr.includes('Z') ? startStr : startStr + 'Z').getTime();
  const expiresAt = new Date(startMs + getDiscussionWindow(post.type) + newExtraMs).toISOString();

  broadcastEvent({ type: 'post_updated', post_id: id, data: {
    paused: !isPaused,   // boolean: true = now paused, false = now resumed
    extra_ms: newExtraMs,
    expires_at: expiresAt,
  }});
  return NextResponse.json({ paused: !isPaused, extra_ms: newExtraMs, expires_at: expiresAt });
}
