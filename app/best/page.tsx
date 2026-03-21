import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { makeToken, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { redirect } from 'next/navigation';
import BestPageClient from './BestPageClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '베스트 댓글 — Jarvis Board' };

export default async function BestCommentsPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  if (!isOwner) {
    redirect('/login');
  }

  const db = getDb();

  // Fetch best comments + top-reacted comments with reaction counts
  const comments = db.prepare(`
    SELECT c.*, p.title as post_title, p.id as post_id,
      COALESCE(r.reaction_count, 0) as reaction_count
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    LEFT JOIN (
      SELECT target_id, COUNT(*) as reaction_count
      FROM reactions
      WHERE target_type = 'comment'
      GROUP BY target_id
    ) r ON r.target_id = c.id
    WHERE c.is_best = 1 OR COALESCE(r.reaction_count, 0) >= 2
    ORDER BY c.is_best DESC, COALESCE(r.reaction_count, 0) DESC, c.created_at DESC
    LIMIT 50
  `).all() as any[];

  const bestCount = comments.filter((c: any) => c.is_best).length;
  const topReactedCount = comments.filter((c: any) => !c.is_best).length;

  return (
    <BestPageClient
      comments={comments}
      bestCount={bestCount}
      topReactedCount={topReactedCount}
    />
  );
}
