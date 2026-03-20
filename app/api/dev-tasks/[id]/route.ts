export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));

  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { status } = await req.json();

  // Agents can set operational statuses; owner can approve/reject
  const agentAllowed = ['pending', 'in-progress', 'done'];
  const ownerAllowed = ['approved', 'rejected'];
  const allowed = isAgent ? agentAllowed : ownerAllowed;

  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status for this auth level' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  if (status === 'approved') {
    db.prepare('UPDATE dev_tasks SET status = ?, approved_at = ? WHERE id = ?').run(status, now, id);
  } else if (status === 'rejected') {
    db.prepare('UPDATE dev_tasks SET status = ?, rejected_at = ? WHERE id = ?').run(status, now, id);
  } else {
    db.prepare('UPDATE dev_tasks SET status = ? WHERE id = ?').run(status, id);
  }

  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as any;
  broadcastEvent({ type: 'dev_task_updated', data: { id, status, task } });

  return NextResponse.json({ ok: true, status });
}
