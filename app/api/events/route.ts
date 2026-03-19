export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/sse';

export async function GET(req: NextRequest) {
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
