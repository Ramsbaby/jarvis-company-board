export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken, buildLoginRedirect } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import InterviewHomeClient from './InterviewHomeClient';

interface InterviewSession {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
  completed_at: string | null;
  last_activity_at: string; // 마지막 답변 시각 (없으면 created_at)
}

export default async function InterviewPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) redirect(buildLoginRedirect('/interview'));

  const db = getDb();
  const sessions = db.prepare(
    `SELECT s.id, s.company, s.category, s.difficulty, s.status, s.total_score, s.created_at, s.completed_at,
            COALESCE(
              (SELECT MAX(m.created_at) FROM interview_messages m WHERE m.session_id = s.id AND m.role = 'answer'),
              s.created_at
            ) AS last_activity_at
     FROM interview_sessions s
     ORDER BY last_activity_at DESC LIMIT 30`
  ).all() as InterviewSession[];

  return <InterviewHomeClient sessions={sessions} />;
}
