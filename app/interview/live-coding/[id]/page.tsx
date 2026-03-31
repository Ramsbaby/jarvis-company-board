export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { LIVE_CODING_PROBLEMS } from '@/lib/live-coding-problems';
import LiveCodingClient from './LiveCodingClient';

export default async function LiveCodingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) redirect('/login?next=/interview');

  const db = getDb();
  const lcSession = db.prepare(`SELECT * FROM live_coding_sessions WHERE id = ?`).get(id) as {
    id: string; problem_id: string; problem_title: string; status: string;
    submitted_code: string | null; feedback_json: string | null; hint_used: number; time_used: number | null;
  } | undefined;

  if (!lcSession) notFound();

  const problem = LIVE_CODING_PROBLEMS.find(p => p.id === lcSession.problem_id);
  if (!problem) notFound();

  let existingFeedback = null;
  if (lcSession.feedback_json) {
    try { existingFeedback = JSON.parse(lcSession.feedback_json); } catch { /* 손상된 JSON 무시 */ }
  }

  return (
    <LiveCodingClient
      sessionId={id}
      problem={problem}
      initialCode={lcSession.submitted_code ?? ''}
      existingFeedback={existingFeedback}
      alreadyCompleted={lcSession.status === 'completed'}
    />
  );
}
