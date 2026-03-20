export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const db = getDb();

  let tasks: any[];
  if (statusFilter) {
    tasks = db.prepare(
      `SELECT * FROM dev_tasks WHERE status = ? ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC LIMIT 50`
    ).all(statusFilter) as any[];
  } else {
    tasks = db.prepare(
      `SELECT * FROM dev_tasks ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC LIMIT 50`
    ).all() as any[];
  }
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  if (agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, title, detail = '', priority = 'medium', source = '', assignee = 'council' } = body;
  if (!id || !title) return NextResponse.json({ error: 'id and title required' }, { status: 400 });

  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO dev_tasks (id, title, detail, priority, source, assignee, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, title, detail, priority, source, assignee);

  return NextResponse.json({ ok: true }, { status: 201 });
}
