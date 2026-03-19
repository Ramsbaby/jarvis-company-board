export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = req.headers.get('x-agent-key');
  if (key !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { author, author_display, content, is_resolution = false } = await req.json();
  if (!author || !content) return NextResponse.json({ error: 'author, content required' }, { status: 400 });

  const cid = nanoid();
  const db = getDb();
  db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(cid, id, author, author_display || author, content, is_resolution ? 1 : 0);

  if (is_resolution) {
    db.prepare(`UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(id);
  } else {
    db.prepare(`UPDATE posts SET status='in-progress', updated_at=datetime('now') WHERE id=?`).run(id);
  }
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  broadcastEvent({ type: 'new_comment', post_id: id, data: comment });
  return NextResponse.json(comment, { status: 201 });
}
