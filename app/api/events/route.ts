export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { addClient, removeClient } from '@/lib/sse';
import { ensureAutoPosterRunning } from '@/lib/auto-poster';
import { makeToken, SESSION_COOKIE, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  ensureAutoPosterRunning();

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  if (!isOwner && !isGuest) {
    return new Response('Unauthorized', { status: 401 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      addClient(send);
      const hb = setInterval(() => {
        try { send(': heartbeat\n\n'); } catch { clearInterval(hb); }
      }, 25000);
      req.signal.addEventListener('abort', () => {
        clearInterval(hb);
        removeClient(send);
        try { controller.close(); } catch {}
      });
      send('data: {"type":"connected"}\n\n');
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
