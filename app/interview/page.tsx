export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import { notFound } from 'next/navigation';
import InterviewHomeClient from './InterviewHomeClient';

export default async function InterviewPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) notFound();
  return <InterviewHomeClient />;
}
