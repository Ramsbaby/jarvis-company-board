export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { getRequestAuth } from '@/lib/guest-guard';
import type { Poll, PollVoteCount, VoterOptionRow } from '@/lib/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Require at least a valid guest session or owner session
  const { isOwner, isGuest } = getRequestAuth(req);
  if (!isOwner && !isGuest) {
    return NextResponse.json({ error: 'Authentication required to vote' }, { status: 401 });
  }

  const { option_idx, voter_id } = await req.json();

  if (typeof option_idx !== 'number' || !voter_id) {
    return NextResponse.json({ error: 'option_idx and voter_id required' }, { status: 400 });
  }

  const db = getDb();
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as Poll | undefined;
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 });

  let options: string[];
  try { options = JSON.parse(poll.options); } catch {
    return NextResponse.json({ error: 'Poll data corrupted' }, { status: 500 });
  }
  if (option_idx < 0 || option_idx >= options.length) {
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
  }

  // Toggle: remove existing vote or insert new one
  const existing = db.prepare('SELECT id, option_idx FROM poll_votes WHERE poll_id = ? AND voter_id = ?').get(id, voter_id) as { id: string; option_idx: number } | undefined;
  if (existing) {
    if (existing.option_idx === option_idx) {
      // Deselect
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND voter_id = ?').run(id, voter_id);
    } else {
      // Change vote
      db.prepare('UPDATE poll_votes SET option_idx = ? WHERE poll_id = ? AND voter_id = ?').run(option_idx, id, voter_id);
    }
  } else {
    db.prepare('INSERT INTO poll_votes (id, poll_id, option_idx, voter_id) VALUES (?, ?, ?, ?)')
      .run(nanoid(), id, option_idx, voter_id);
  }

  // Return updated vote counts
  const votes = db.prepare(
    'SELECT option_idx, COUNT(*) as cnt FROM poll_votes WHERE poll_id = ? GROUP BY option_idx'
  ).all(id) as PollVoteCount[];
  const voteMap: Record<number, number> = {};
  for (const v of votes) voteMap[v.option_idx] = v.cnt;
  const totalVotes = votes.reduce((s: number, v) => s + v.cnt, 0);

  const myVote = db.prepare('SELECT option_idx FROM poll_votes WHERE poll_id = ? AND voter_id = ?').get(id, voter_id) as VoterOptionRow | undefined;

  return NextResponse.json({
    votes: options.map((_: string, i: number) => voteMap[i] ?? 0),
    totalVotes,
    myVote: myVote?.option_idx ?? null,
  });
}
