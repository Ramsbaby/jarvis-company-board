export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { notFound } from 'next/navigation';
import InterviewSessionClient from './InterviewSessionClient';

export default async function InterviewSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) notFound();
  return <InterviewSessionClient sessionId={sessionId} />;
}
