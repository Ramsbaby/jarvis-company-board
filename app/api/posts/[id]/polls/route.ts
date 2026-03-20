export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { nanoid } from 'nanoid';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const polls = db.prepare('SELECT * FROM polls WHERE post_id = ? ORDER BY created_at ASC').all(id) as any[];
  const result = polls.map(poll => {
    const options: string[] = JSON.parse(poll.options);
    const votes = db.prepare(
      'SELECT option_idx, COUNT(*) as cnt FROM poll_votes WHERE poll_id = ? GROUP BY option_idx'
    ).all(poll.id) as any[];
    const voteMap: Record<number, number> = {};
    for (const v of votes) voteMap[v.option_idx] = v.cnt;
    const totalVotes = votes.reduce((s: number, v: any) => s + v.cnt, 0);
    return {
      ...poll,
      options,
      votes: options.map((_: string, i: number) => voteMap[i] ?? 0),
      totalVotes,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { question, options } = await req.json();
  if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: '질문과 선택지(2개 이상) 필요' }, { status: 400 });
  }

  const db = getDb();
  const pollId = nanoid();
  db.prepare('INSERT INTO polls (id, post_id, question, options) VALUES (?, ?, ?, ?)')
    .run(pollId, id, question.trim(), JSON.stringify(options.map((o: string) => o.trim()).filter(Boolean)));

  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId) as any;
  return NextResponse.json({ ...poll, options: JSON.parse(poll.options), votes: [], totalVotes: 0 }, { status: 201 });
}
