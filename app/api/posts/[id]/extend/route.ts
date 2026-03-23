export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { broadcastEvent } from '@/lib/sse';
import { getDiscussionWindow } from '@/lib/constants';
import type { Post } from '@/lib/types';

const EXTEND_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Owner only
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const post = db.prepare('SELECT id, type, extra_ms, restarted_at, created_at FROM posts WHERE id = ?').get(id) as Pick<Post, 'id' | 'type' | 'extra_ms' | 'restarted_at' | 'created_at'> | undefined;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newExtraMs = (post.extra_ms ?? 0) + EXTEND_MS;

  db.prepare(`
    UPDATE posts SET extra_ms = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newExtraMs, id);

  // Compute absolute expires_at so clients can update timers without double-counting
  const startStr = post.restarted_at ?? post.created_at;
  const startMs = new Date(startStr.includes('Z') ? startStr : startStr + 'Z').getTime();
  const newExpiresAt = new Date(startMs + getDiscussionWindow(post.type) + newExtraMs).toISOString();

  broadcastEvent({ type: 'post_updated', post_id: id, data: { extra_ms: newExtraMs, expires_at: newExpiresAt } });
  return NextResponse.json({ extra_ms: newExtraMs, expires_at: newExpiresAt });
}
