export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const session = db.prepare(`SELECT * FROM interview_sessions WHERE id = ?`).get(id);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const messages = db.prepare(`SELECT * FROM interview_messages WHERE session_id = ? ORDER BY created_at ASC`).all(id);
  return NextResponse.json({ session, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { status, total_score } = await req.json();
  const db = getDb();
  db.prepare(`UPDATE interview_sessions SET status = ?, total_score = ?, completed_at = datetime('now') WHERE id = ?`).run(status ?? 'completed', total_score ?? null, id);
  return NextResponse.json({ ok: true });
}
