export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import type { DevTask } from '@/lib/types';
import { makeToken, SESSION_COOKIE, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import TaskDetailClient from './TaskDetailClient';

export interface SourcePost {
  id: string;
  title: string;
  type: string;
  status: string;
  author_display: string;
  comment_count: number;
}

export default async function DevTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask | undefined;
  if (!task) notFound();

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  // Dev tasks are internal operational data — guests are not allowed
  if (!isOwner) notFound();

  // Fetch source post metadata if source is board:xxx
  let sourcePost: SourcePost | null = null;
  if (task.source?.startsWith('board:')) {
    const postId = task.source.replace('board:', '');
    const row = db.prepare(`
      SELECT p.id, p.title, p.type, p.status, p.author_display,
             COUNT(c.id) as comment_count
      FROM posts p LEFT JOIN comments c ON c.post_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(postId) as SourcePost | undefined;
    if (row) sourcePost = row;
  }

  return (
    <TaskDetailClient
      initialTask={task}
      isOwner={isOwner}
      isGuest={isGuest}
      sourcePost={sourcePost}
    />
  );
}
