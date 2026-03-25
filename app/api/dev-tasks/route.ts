export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { getRequestAuth } from '@/lib/guest-guard';
import type { DevTask, BoardSetting } from '@/lib/types';

export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isOwner && !isAgent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const groupFilter = url.searchParams.get('group_id');
  const db = getDb();

  const orderBy = `ORDER BY
    CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at DESC`;

  let tasks: DevTask[];
  if (groupFilter) {
    tasks = db.prepare(`SELECT * FROM dev_tasks WHERE group_id = ? ${orderBy}`).all(groupFilter) as DevTask[];
  } else if (statusFilter) {
    tasks = db.prepare(`SELECT * FROM dev_tasks WHERE status = ? ${orderBy}`).all(statusFilter) as DevTask[];
  } else {
    tasks = db.prepare(`SELECT * FROM dev_tasks ${orderBy}`).all() as DevTask[];
  }
  // Attach children to group_parent tasks (in-memory, no extra DB queries)
  const parentMap = new Map<string, DevTask[]>();
  for (const task of tasks) {
    if (task.parent_id) {
      const siblings = parentMap.get(task.parent_id) || [];
      siblings.push(task);
      parentMap.set(task.parent_id, siblings);
    }
  }
  const result = tasks.map(task =>
    task.task_type === 'group_parent'
      ? { ...task, children: parentMap.get(task.id) || [] }
      : task
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, title, detail = '', priority = 'medium', source = '', assignee = 'council', status = 'awaiting_approval', post_title = '', group_id = null, depends_on = '[]', parent_id = null, task_type = null } = body;
  if (!id || !title) return NextResponse.json({ error: 'id and title required' }, { status: 400 });

  const validStatuses = ['awaiting_approval', 'approved', 'in-progress', 'done', 'rejected'];
  let insertStatus = validStatuses.includes(status) ? status : 'awaiting_approval';

  const db = getDb();

  // 자동 승인: 이사회 토론 태스크이고 auto_approve_board_tasks = '1'이면 바로 approved
  const now = new Date().toISOString();
  let isAutoApproved = false;
  if (insertStatus === 'awaiting_approval' && source && source.startsWith('board:')) {
    try {
      const autoApproveSetting = (db.prepare(
        "SELECT value FROM board_settings WHERE key = 'auto_approve_board_tasks'"
      ).get() as BoardSetting | undefined)?.value;
      if (autoApproveSetting === '1') {
        insertStatus = 'approved';
        isAutoApproved = true;
      }
    } catch {
      // DB 오류 시 안전하게 awaiting_approval 유지 (자동승인 skip)
    }
  }
  // approved 상태로 삽입될 때는 항상 approved_at 기록 (자동승인이든 에이전트 직접 설정이든)
  const approvedAtValue = insertStatus === 'approved' ? now : null;

  // 중복 검사: 같은 source(board:postId)로 이미 태스크가 5개 이상이면 차단
  if (source && source.startsWith('board:')) {
    const existingCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM dev_tasks WHERE source = ? AND status != ?'
    ).get(source, 'rejected') as { cnt: number })?.cnt ?? 0;
    if (existingCount >= 5) {
      return NextResponse.json(
        { error: 'duplicate_limit', message: `같은 토론에서 이미 ${existingCount}개 태스크 존재`, existing: existingCount },
        { status: 409 }
      );
    }
  }

  // INSERT OR IGNORE: duplicate id는 기존 태스크(진행 중 상태/로그 포함) 보존
  const dependsOnStr = typeof depends_on === 'string' ? depends_on : JSON.stringify(depends_on || []);
  const info = db.prepare(
    `INSERT OR IGNORE INTO dev_tasks (id, title, detail, priority, source, assignee, status, approved_at, post_title, group_id, depends_on, parent_id, task_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, detail, priority, source, assignee, insertStatus, approvedAtValue, post_title, group_id || null, dependsOnStr, parent_id || null, task_type || null);

  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id);
  // 신규 삽입된 경우에만 SSE 브로드캐스트
  if (info.changes > 0) {
    broadcastEvent({ type: 'dev_task_updated', data: { id, status: insertStatus, task } });

    // 자동 승인된 경우 Discord 알림 (board 설정으로 자동승인된 것만, 에이전트 직접 approved 제외)
    if (isAutoApproved && process.env.DISCORD_WEBHOOK_CEO) {
      fetch(process.env.DISCORD_WEBHOOK_CEO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🤖 **자동승인** (에이전트 자동승인 ON)\n**[${priority?.toUpperCase()}] ${title}**\n> ${(detail || '').slice(0, 150)}`,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true }, { status: info.changes > 0 ? 201 : 200 });
}
