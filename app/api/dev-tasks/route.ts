export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { getRequestAuth } from '@/lib/guest-guard';
import type { DevTask } from '@/lib/types';

export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isOwner && !isAgent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const db = getDb();

  let tasks: DevTask[];
  if (statusFilter) {
    tasks = db.prepare(
      `SELECT * FROM dev_tasks WHERE status = ? ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC LIMIT 50`
    ).all(statusFilter) as DevTask[];
  } else {
    tasks = db.prepare(
      `SELECT * FROM dev_tasks ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC LIMIT 50`
    ).all() as DevTask[];
  }
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, title, detail = '', priority = 'medium', source = '', assignee = 'council', status = 'awaiting_approval', post_title = '', batch_id = null } = body;
  if (!id || !title) return NextResponse.json({ error: 'id and title required' }, { status: 400 });

  const validStatuses = ['awaiting_approval', 'approved', 'in-progress', 'done', 'rejected'];
  const insertStatus = validStatuses.includes(status) ? status : 'awaiting_approval';

  const db = getDb();

  // INSERT OR IGNORE: duplicate id는 기존 태스크(진행 중 상태/로그 포함) 보존
  const info = db.prepare(
    `INSERT OR IGNORE INTO dev_tasks (id, title, detail, priority, source, assignee, status, post_title, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, detail, priority, source, assignee, insertStatus, post_title, batch_id);

  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id);
  // 신규 삽입된 경우에만 SSE 브로드캐스트
  if (info.changes > 0) {
    broadcastEvent({ type: 'dev_task_updated', data: { id, status: insertStatus, task } });
  }

  return NextResponse.json({ ok: true }, { status: info.changes > 0 ? 201 : 200 });
}
