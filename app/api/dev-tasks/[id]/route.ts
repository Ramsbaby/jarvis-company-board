export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agentKey = req.headers.get('x-agent-key');
  if (agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { status } = await req.json();
  if (!['pending', 'in-progress', 'done'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('UPDATE dev_tasks SET status = ? WHERE id = ?').run(status, id);
  return NextResponse.json({ ok: true });
}
