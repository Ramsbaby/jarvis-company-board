export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import ReportClient from './ReportClient';

interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  better_answer: string | null;
  missing_keywords: string | null;
  created_at: string;
}

interface Session {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
}

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) redirect('/login?next=/interview');

  const { sessionId } = await params;
  const db = getDb();
  const interviewSession = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(sessionId) as Session | undefined;
  if (!interviewSession) notFound();

  const messages = db.prepare(
    'SELECT * FROM interview_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId) as Message[];

  return <ReportClient session={interviewSession} messages={messages} />;
}
