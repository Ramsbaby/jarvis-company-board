export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InterviewSessionClient from './InterviewSessionClient';

export default async function InterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { sessionId } = await params;
  const { mode } = await searchParams;
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) redirect('/login?next=/interview');
  return <InterviewSessionClient sessionId={sessionId} mode={mode} />;
}
