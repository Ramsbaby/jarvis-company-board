import { getDb } from '@/lib/db';
import type { DevTask, BoardSetting } from '@/lib/types';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import DevTasksClient from './DevTasksClient';
import AutoApproveToggle from '@/components/AutoApproveToggle';

export const dynamic = 'force-dynamic';

export default async function DevTasksPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));

  if (!isOwner) redirect('/login?next=/dev-tasks');

  const db = getDb();
  const autoApprove =
    (db.prepare("SELECT value FROM board_settings WHERE key = 'auto_approve_board_tasks'").get() as BoardSetting | undefined)?.value === '1';

  const tasks = db.prepare(
    `SELECT * FROM dev_tasks ORDER BY
      CASE status
        WHEN 'awaiting_approval' THEN 0
        WHEN 'approved' THEN 1
        WHEN 'in-progress' THEN 2
        WHEN 'done' THEN 3
        ELSE 5
      END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC`
  ).all() as DevTask[];

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors">
            ← 홈
          </Link>
          <h1 className="text-sm font-semibold text-zinc-900">개발 태스크 관리</h1>
          <div className="ml-auto flex items-center gap-2">
            <AutoApproveToggle initialAutoApprove={autoApprove} />
            <div className="w-6 h-6 bg-zinc-900 rounded-md flex items-center justify-center font-bold text-xs text-white">J</div>
          </div>
        </div>
      </header>
      <DevTasksClient initialTasks={tasks} />
    </div>
  );
}
