export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { notFound } from 'next/navigation';
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
}

export default async function InterviewPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) notFound();

  const db = getDb();
  const sessions = db.prepare(
    `SELECT id, company, category, difficulty, status, total_score, created_at, completed_at
     FROM interview_sessions ORDER BY created_at DESC LIMIT 30`
  ).all() as InterviewSession[];

  return <InterviewHomeClient sessions={sessions} />;
}
