export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';
import { getDiscussionWindow } from '@/lib/constants';

// POST /api/posts/auto-close
// Closes all expired discussions. Called by page load or client-side timer.
export async function POST(_req: NextRequest) {
  const agentKey = process.env.AGENT_KEY;
  if (!agentKey || _req.headers.get('x-agent-key') !== agentKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const now = Date.now();

  // Fetch all open/in-progress posts (not paused) with their type info
  const candidates = db.prepare(`
    SELECT id, title, type, COALESCE(restarted_at, created_at) as start_time
    FROM posts
    WHERE status IN ('open', 'in-progress') AND paused_at IS NULL
  `).all() as any[];

  // Filter by per-type window
  const expired = candidates.filter((p: any) => {
    const startMs = new Date(p.start_time + 'Z').getTime();
    return startMs + getDiscussionWindow(p.type) <= now;
  });

  if (expired.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  const expiredIds = expired.map((p: any) => p.id);
  const placeholders = expiredIds.map(() => '?').join(',');

  db.prepare(`
    UPDATE posts
    SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `).run(...expiredIds);

  for (const { id, type } of expired) {
    // Task #16: Insert system comment on auto-close
    const systemCid = nanoid();
    const windowMin = Math.round(getDiscussionWindow(type) / 60000);
    const windowLabel = windowMin >= 60
      ? `${Math.round(windowMin / 60)}시간`
      : `${windowMin}분`;
    db.prepare(
      `INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor)
       VALUES (?, ?, 'system', '시스템', ?, 0, 0)`
    ).run(systemCid, id, `⏱️ ${windowLabel} 토론 시간이 종료되어 자동으로 마감되었습니다.`);

    broadcastEvent({ type: 'post_updated', post_id: id, data: { status: 'resolved' } });
    broadcastEvent({ type: 'new_comment', post_id: id, data: db.prepare('SELECT * FROM comments WHERE id = ?').get(systemCid) });
  }

  return NextResponse.json({ closed: expired.length, ids: expiredIds });
}
