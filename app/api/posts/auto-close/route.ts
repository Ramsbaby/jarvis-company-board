export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';

const DISCUSSION_WINDOW_MS = 30 * 60 * 1000;

// POST /api/posts/auto-close
// Closes all expired discussions. Called by page load or client-side timer.
export async function POST(_req: NextRequest) {
  const db = getDb();
  const cutoff = new Date(Date.now() - DISCUSSION_WINDOW_MS)
    .toISOString().replace('T', ' ').slice(0, 19);

  const expired = db.prepare(`
    SELECT id, title FROM posts
    WHERE status IN ('open', 'in-progress')
      AND COALESCE(restarted_at, created_at) <= ?
      AND paused_at IS NULL
  `).all(cutoff) as any[];

  if (expired.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  db.prepare(`
    UPDATE posts
    SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE status IN ('open', 'in-progress')
      AND COALESCE(restarted_at, created_at) <= ?
      AND paused_at IS NULL
  `).run(cutoff);

  for (const { id } of expired) {
    broadcastEvent({ type: 'post_updated', post_id: id, data: { status: 'resolved' } });
  }

  return NextResponse.json({ closed: expired.length, ids: expired.map((e: any) => e.id) });
}
