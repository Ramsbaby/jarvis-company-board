export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import type { Post, DevTask } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Agent or owner only — dev tasks are internal data
  const key = req.headers.get('x-agent-key');
  const isAgent = !!(key && key === process.env.AGENT_API_KEY);
  const { isOwner } = getRequestAuth(req);
  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // Check post exists
  const post = db.prepare('SELECT id, title FROM posts WHERE id = ?').get(id) as Pick<Post, 'id' | 'title'> | undefined;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Find dev tasks that reference this post via post_id column (added via migration in lib/db.ts)
  const tasks = db.prepare(`
    SELECT id, title, status, priority, assignee, created_at, completed_at
    FROM dev_tasks
    WHERE post_id = ?
    ORDER BY created_at DESC
  `).all(id) as Pick<DevTask, 'id' | 'title' | 'status' | 'priority' | 'assignee' | 'created_at' | 'completed_at'>[];

  return NextResponse.json(tasks);
}
