export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import type { DevTask } from '@/lib/types';

/**
 * POST /api/dev-tasks/migrate-hierarchy
 * Agent-key protected. One-time migration that:
 * 1. Groups unmigrated tasks by group_id (if set) or source (board:xxx / board_consensus)
 * 2. Creates a group_parent task for each group with 2+ tasks
 * 3. Links children via parent_id + task_type='child'
 */
export async function POST(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // All unmigrated tasks
  const tasks = db.prepare(
    `SELECT * FROM dev_tasks WHERE task_type IS NULL ORDER BY created_at ASC`,
  ).all() as DevTask[];

  // Group by group_id (preferred) or source
  const groups = new Map<string, DevTask[]>();
  for (const task of tasks) {
    const key = task.group_id ?? task.source ?? null;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }

  const migrated: Array<{ key: string; parentId: string; count: number; status: string }> = [];
  const skipped: Array<{ key: string; reason: string }> = [];

  for (const [key, groupTasks] of groups) {
    // Skip singletons — no parent needed
    if (groupTasks.length < 2) {
      skipped.push({ key, reason: '단일 태스크' });
      continue;
    }

    const source = groupTasks[0].source ?? '';

    // Only migrate board-originated tasks
    if (!source.startsWith('board:') && source !== 'board_consensus') {
      skipped.push({ key, reason: `비이사회 소스 (${source})` });
      continue;
    }

    // Use existing group_id or generate new one
    const groupId = groupTasks[0].group_id ?? `grp-migrated-${nanoid(8)}`;

    // Determine parent status from children
    const statuses = groupTasks.map(t => t.status);
    const allTerminal = statuses.every(s => ['done', 'rejected', 'failed'].includes(s));
    const anyInProgress = statuses.includes('in-progress');
    const anyApproved = statuses.includes('approved');
    const allDone = statuses.every(s => s === 'done');

    let parentStatus: string;
    if (allDone) parentStatus = 'done';
    else if (allTerminal) parentStatus = 'done';
    else if (anyInProgress) parentStatus = 'in-progress';
    else if (anyApproved) parentStatus = 'approved';
    else parentStatus = 'awaiting_approval';

    // Best post_title from children
    const postTitle = groupTasks.find(t => t.post_title)?.post_title ?? '';
    const postId = groupTasks.find(t => t.post_id)?.post_id ?? null;

    const parentId = `parent-${groupId}`;
    const parentTitle = postTitle
      ? `[이사회 결의] ${postTitle}`
      : source === 'board_consensus'
        ? `[이사회 결의] DB 장애 대응`
        : `[이사회 결의] ${source.replace('board:', '').slice(0, 24)}`;

    // Insert parent (idempotent — OR IGNORE)
    db.prepare(`
      INSERT OR IGNORE INTO dev_tasks
        (id, title, detail, priority, source, assignee, status,
         created_at, post_title, group_id, post_id, task_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parentId,
      parentTitle,
      `소급 마이그레이션 — 논의 결의에서 생성된 태스크 그룹 (${groupTasks.length}개)`,
      'medium',
      source,
      'council',
      parentStatus,
      now,
      postTitle,
      groupId,
      postId,
      'group_parent',
    );

    // Link all children
    const childIds = groupTasks.map(t => t.id);
    const ph = childIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE dev_tasks
         SET parent_id = ?, task_type = 'child', group_id = ?
       WHERE id IN (${ph}) AND task_type IS NULL`,
    ).run(parentId, groupId, ...childIds);

    migrated.push({ key, parentId, count: groupTasks.length, status: parentStatus });
  }

  return NextResponse.json({
    migrated: migrated.length,
    skipped: skipped.length,
    details: migrated,
    skipped_keys: skipped,
  });
}
