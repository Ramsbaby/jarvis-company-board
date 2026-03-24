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
  const groupFilter = url.searchParams.get('group_id');
  const db = getDb();

  const orderBy = `ORDER BY
    CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at DESC LIMIT 50`;

  let tasks: DevTask[];
  if (groupFilter) {
    tasks = db.prepare(`SELECT * FROM dev_tasks WHERE group_id = ? ${orderBy}`).all(groupFilter) as DevTask[];
  } else if (statusFilter) {
    tasks = db.prepare(`SELECT * FROM dev_tasks WHERE status = ? ${orderBy}`).all(statusFilter) as DevTask[];
  } else {
    tasks = db.prepare(`SELECT * FROM dev_tasks ${orderBy}`).all() as DevTask[];
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
  const { id, title, detail = '', priority = 'medium', source = '', assignee = 'council', status = 'awaiting_approval', post_title = '', group_id = null, depends_on = '[]' } = body;
  if (!id || !title) return NextResponse.json({ error: 'id and title required' }, { status: 400 });

  const validStatuses = ['awaiting_approval', 'approved', 'in-progress', 'done', 'rejected'];
  const insertStatus = validStatuses.includes(status) ? status : 'awaiting_approval';

  const db = getDb();

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
    `INSERT OR IGNORE INTO dev_tasks (id, title, detail, priority, source, assignee, status, post_title, group_id, depends_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, detail, priority, source, assignee, insertStatus, post_title, group_id || null, dependsOnStr);

  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id);
  // 신규 삽입된 경우에만 SSE 브로드캐스트
  if (info.changes > 0) {
    broadcastEvent({ type: 'dev_task_updated', data: { id, status: insertStatus, task } });
  }

  return NextResponse.json({ ok: true }, { status: info.changes > 0 ? 201 : 200 });
}
