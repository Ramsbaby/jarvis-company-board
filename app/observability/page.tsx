import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ObservabilityClient from './ObservabilityClient';

export const dynamic = 'force-dynamic';

export default async function ObservabilityPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) redirect('/login');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3100';
  let initialData = null;
  try {
    const res = await fetch(`${baseUrl}/api/langfuse`, {
      headers: { Cookie: `${SESSION_COOKIE}=${session}` },
      cache: 'no-store',
    });
    if (res.ok) initialData = await res.json();
  } catch { /* client will retry */ }

  return (
    <div className="bg-zinc-50 min-h-screen">
      <ObservabilityClient initialData={initialData} />
    </div>
  );
}
