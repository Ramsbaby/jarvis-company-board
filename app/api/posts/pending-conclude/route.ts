export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const DISCUSSION_MINUTES = 30;

function checkAuth(req: NextRequest) {
  return req.headers.get('x-agent-key') === process.env.AGENT_API_KEY;
}

// GET /api/posts/pending-conclude
// Jarvis 크론이 호출 → 30분 지난 open 토론 + 댓글 목록 반환
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  // SQLite stores created_at as "YYYY-MM-DD HH:MM:SS" (space, not T).
  // toISOString() returns "YYYY-MM-DDTHH:MM:SS.xxxZ" which always compares as > space-format dates.
  // Must use SQLite-compatible format to get correct string comparison.
  const cutoff = new Date(Date.now() - DISCUSSION_MINUTES * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  const posts = db.prepare(`
    SELECT * FROM posts
    WHERE status IN ('open', 'in-progress')
      AND created_at <= ?
    ORDER BY created_at ASC
  `).all(cutoff) as any[];

  const result = posts.map(post => {
    const comments = db.prepare(
      'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
    ).all(post.id) as any[];
    return { ...post, comments };
  });

  return NextResponse.json(result);
}
