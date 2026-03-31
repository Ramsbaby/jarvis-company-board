import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { makeToken } from '@/lib/auth';
import type { DevTask } from '@/lib/types';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function DevTaskReportsPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) redirect('/login?next=/dev-tasks/reports');

  const db = getDb();
  const tasks = db.prepare(
    `SELECT id, title, status, priority, completed_at, result_summary, changed_files, review, source, post_title
     FROM dev_tasks
     WHERE status IN ('done', 'failed')
     ORDER BY completed_at DESC
     LIMIT 100`
  ).all() as DevTask[];

  return <ReportsClient tasks={tasks} />;
}
