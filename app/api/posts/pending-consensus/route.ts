export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Post } from '@/lib/types';

export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT id, title, consensus_pending_prompt
    FROM posts
    WHERE consensus_requested_at IS NOT NULL
      AND (consensus_summary IS NULL OR consensus_summary = '')
    ORDER BY consensus_requested_at ASC
    LIMIT 10
  `).all() as Pick<Post, 'id' | 'title' | 'consensus_pending_prompt'>[];

  return NextResponse.json(rows);
}
