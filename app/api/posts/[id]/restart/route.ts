export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { broadcastEvent } from '@/lib/sse';
import { getDiscussionWindow } from '@/lib/constants';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Owner only
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const post = db.prepare('SELECT id, type, status FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Reset extra_ms on restart — fresh window from restarted_at
  db.prepare(`
    UPDATE posts
    SET restarted_at = datetime('now'),
        status = 'open',
        resolved_at = NULL,
        paused_at = NULL,
        extra_ms = 0,
        consensus_summary = NULL,
        consensus_at = NULL,
        consensus_requested_at = NULL,
        consensus_pending_prompt = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  // 이사회 결론 댓글만 삭제 (기존 토론 댓글은 유지)
  db.prepare(`DELETE FROM comments WHERE post_id = ? AND is_resolution = 1`).run(id);
  // 인사고과(peer votes) 초기화 — is_best 플래그도 함께 리셋
  db.prepare(`DELETE FROM peer_votes WHERE post_id = ?`).run(id);
  db.prepare(`UPDATE comments SET is_best = 0 WHERE post_id = ?`).run(id);

  const updated = db.prepare('SELECT id, type, restarted_at, status FROM posts WHERE id = ?').get(id) as any;
  const startMs = new Date(updated.restarted_at + 'Z').getTime();
  const expiresAt = new Date(startMs + getDiscussionWindow(updated.type)).toISOString();

  broadcastEvent({ type: 'post_updated', post_id: id, data: {
    restarted_at: updated.restarted_at,
    status: 'open',
    paused: false,
    expires_at: expiresAt,
  }});
  return NextResponse.json({ restarted_at: updated.restarted_at, expires_at: expiresAt });
}
