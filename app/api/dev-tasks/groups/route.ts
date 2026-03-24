export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import type { DevTask } from '@/lib/types';

/**
 * GET /api/dev-tasks/groups
 * Returns tasks grouped by group_id with summary stats per group.
 */
export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isOwner && !isAgent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();

  // Fetch group summaries: group_id, count, progress (done/total), earliest created_at
  const groups = db.prepare(`
    SELECT
      group_id,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as active_count,
      MIN(created_at) as first_created,
      MAX(created_at) as last_created
    FROM dev_tasks
    WHERE group_id IS NOT NULL
    GROUP BY group_id
    ORDER BY first_created DESC
  `).all() as Array<{
    group_id: string;
    total: number;
    done_count: number;
    failed_count: number;
    active_count: number;
    first_created: string;
    last_created: string;
  }>;

  // For each group, also fetch the first task's title as group label
  const result = groups.map(g => {
    const firstTask = db.prepare(
      'SELECT title, post_id, post_title, source FROM dev_tasks WHERE group_id = ? ORDER BY created_at ASC LIMIT 1'
    ).get(g.group_id) as Pick<DevTask, 'title' | 'post_id' | 'post_title' | 'source'> | undefined;

    return {
      group_id: g.group_id,
      label: firstTask?.post_title || firstTask?.title || g.group_id,
      post_id: firstTask?.post_id || null,
      source: firstTask?.source || '',
      total: g.total,
      done: g.done_count,
      failed: g.failed_count,
      active: g.active_count,
      pending: g.total - g.done_count - g.failed_count - g.active_count,
      first_created: g.first_created,
      last_created: g.last_created,
    };
  });

  return NextResponse.json(result);
}
