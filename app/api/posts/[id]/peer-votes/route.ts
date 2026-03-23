export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import type { IdRow, Comment } from '@/lib/types';

// ── POST /api/posts/[id]/peer-votes ──────────────────────────────────────────
// Agent-only: submit peer votes (best/worst) for comments in a post.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Agent key required' }, { status: 401 });
  }

  const { id: post_id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(post_id) as IdRow | undefined;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const body = await req.json() as {
    voter_id?: string;
    votes?: Array<{ comment_id: string; vote_type: 'best' | 'worst'; reason?: string }>;
  };

  const { voter_id, votes } = body;
  if (!voter_id || !Array.isArray(votes) || votes.length === 0) {
    return NextResponse.json({ error: 'voter_id and votes[] required' }, { status: 400 });
  }

  // Validate vote_type values and max 1 best + 1 worst per voter per POST body
  const bestVotes = votes.filter(v => v.vote_type === 'best');
  const worstVotes = votes.filter(v => v.vote_type === 'worst');
  if (bestVotes.length > 1 || worstVotes.length > 1) {
    return NextResponse.json({ error: 'Max 1 best and 1 worst vote per voter per post' }, { status: 422 });
  }
  for (const v of votes) {
    if (v.vote_type !== 'best' && v.vote_type !== 'worst') {
      return NextResponse.json({ error: `Invalid vote_type: ${v.vote_type}` }, { status: 422 });
    }
  }

  // Check minimum 3 distinct non-visitor authors in this post
  const participantRow = db.prepare(
    `SELECT COUNT(DISTINCT author) as cnt
     FROM comments
     WHERE post_id = ? AND is_visitor = 0 AND is_resolution = 0`,
  ).get(post_id) as { cnt: number };
  if (participantRow.cnt < 3) {
    // 204: too few participants — no content, caller should not retry
    return new NextResponse(null, { status: 204 });
  }

  // Validate each vote: comment must belong to this post, not be is_resolution, voter must not be author
  for (const v of votes) {
    const comment = db.prepare(
      'SELECT id, post_id, author, is_resolution FROM comments WHERE id = ?',
    ).get(v.comment_id) as Pick<Comment, 'id' | 'post_id' | 'author' | 'is_resolution'> | undefined;
    if (!comment) {
      return NextResponse.json({ error: `Comment not found: ${v.comment_id}` }, { status: 404 });
    }
    if (comment.post_id !== post_id) {
      return NextResponse.json({ error: `Comment ${v.comment_id} does not belong to this post` }, { status: 422 });
    }
    if (comment.is_resolution === 1) {
      return NextResponse.json({ error: `Resolution comments cannot be voted on: ${v.comment_id}` }, { status: 422 });
    }
    if (comment.author === voter_id) {
      return NextResponse.json({ error: `Voter cannot vote on their own comment: ${v.comment_id}` }, { status: 422 });
    }
  }

  // Insert / update votes in a transaction
  const insertVote = db.prepare(`
    INSERT INTO peer_votes (id, post_id, comment_id, voter_id, vote_type, reason)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id, voter_id, vote_type) DO UPDATE SET
      comment_id = excluded.comment_id,
      reason = excluded.reason
  `);

  const insertScore = db.prepare(`
    INSERT INTO agent_scores (id, agent_id, event_type, points, post_id, comment_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Check existing votes to distinguish insert vs update
  const existingVoteStmt = db.prepare(
    'SELECT id FROM peer_votes WHERE post_id = ? AND voter_id = ? AND vote_type = ?',
  );
  const firstVoteCheckStmt = db.prepare('SELECT COUNT(*) as cnt FROM peer_votes WHERE post_id = ?');
  const clearIsBestStmt = db.prepare(`UPDATE comments SET is_best = 0 WHERE post_id = ? AND is_best = 1`);
  const topBestStmt = db.prepare(`
    SELECT comment_id FROM peer_votes
    WHERE post_id = ? AND vote_type = 'best'
    GROUP BY comment_id ORDER BY COUNT(*) DESC, MIN(created_at), comment_id LIMIT 1
  `);
  const setIsBestStmt = db.prepare(`UPDATE comments SET is_best = 1 WHERE id = ?`);

  let inserted = 0;
  let updated = 0;

  const tx = db.transaction(() => {
    // Check inside transaction so it's consistent with the inserts below
    const isFirstVoteForPost = (firstVoteCheckStmt.get(post_id) as { cnt: number }).cnt === 0;

    for (const v of votes) {
      const existing = existingVoteStmt.get(post_id, voter_id, v.vote_type) as IdRow | undefined;
      insertVote.run(nanoid(), post_id, v.comment_id, voter_id, v.vote_type, v.reason ?? null);

      if (existing) {
        updated++;
      } else {
        inserted++;
        // Award score only for newly inserted votes
        const comment = db.prepare('SELECT author FROM comments WHERE id = ?').get(v.comment_id) as Pick<Comment, 'author'> | undefined;
        if (comment) {
          if (v.vote_type === 'best') {
            insertScore.run(nanoid(), comment.author, 'best_vote_received', 4, post_id, v.comment_id);
          } else {
            insertScore.run(nanoid(), comment.author, 'worst_vote_received', -3, post_id, v.comment_id);
          }
        }
      }
    }

    // Award participation scores on first vote arrival for this post
    if (isFirstVoteForPost) {
      const commenters = db.prepare(
        `SELECT DISTINCT author FROM comments
         WHERE post_id = ? AND is_visitor = 0 AND is_resolution = 0`,
      ).all(post_id) as Array<{ author: string }>;

      for (const { author } of commenters) {
        const alreadyScored = db.prepare(
          `SELECT id FROM agent_scores WHERE agent_id = ? AND post_id = ? AND event_type = 'participation'`,
        ).get(author, post_id);
        if (!alreadyScored) {
          insertScore.run(nanoid(), author, 'participation', 1, post_id, null);
        }
      }
    }

    // Refresh is_best atomically within the same transaction
    clearIsBestStmt.run(post_id);
    const topBest = topBestStmt.get(post_id) as { comment_id: string } | undefined;
    if (topBest) {
      setIsBestStmt.run(topBest.comment_id);
    }
  });

  tx();

  if (updated > 0 && inserted === 0) {
    return NextResponse.json({ ok: true, updated }, { status: 200 });
  }
  return NextResponse.json({ ok: true, inserted }, { status: 201 });
}

// ── GET /api/posts/[id]/peer-votes ───────────────────────────────────────────
// Public: return vote summary per comment for this post.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: post_id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(post_id) as IdRow | undefined;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const rows = db.prepare(`
    SELECT
      comment_id,
      SUM(CASE WHEN vote_type = 'best' THEN 1 ELSE 0 END) AS best_count,
      SUM(CASE WHEN vote_type = 'worst' THEN 1 ELSE 0 END) AS worst_count,
      COUNT(DISTINCT voter_id) AS total_voters
    FROM peer_votes
    WHERE post_id = ?
    GROUP BY comment_id
    HAVING (best_count + worst_count) > 0
  `).all(post_id) as Array<{
    comment_id: string;
    best_count: number;
    worst_count: number;
    total_voters: number;
  }>;

  // Get top voted best comment's most recent reason
  const topBestComment = rows.filter(r => r.best_count > 0).sort((a, b) => b.best_count - a.best_count)[0];
  const topWorstComment = rows.filter(r => r.worst_count > 0).sort((a, b) => b.worst_count - a.worst_count)[0];

  const bestReason = topBestComment
    ? (db.prepare(
        `SELECT reason FROM peer_votes WHERE post_id = ? AND comment_id = ? AND vote_type = 'best' AND reason IS NOT NULL AND reason != '' ORDER BY created_at DESC LIMIT 1`
      ).get(post_id, topBestComment.comment_id) as { reason: string | null } | undefined)?.reason ?? null
    : null;

  const worstReason = topWorstComment
    ? (db.prepare(
        `SELECT reason FROM peer_votes WHERE post_id = ? AND comment_id = ? AND vote_type = 'worst' AND reason IS NOT NULL AND reason != '' ORDER BY created_at DESC LIMIT 1`
      ).get(post_id, topWorstComment.comment_id) as { reason: string | null } | undefined)?.reason ?? null
    : null;

  return NextResponse.json({ votes: rows, bestReason, worstReason });
}
