export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { closeExpiredDiscussions } from '@/lib/discussion';

// POST /api/posts/auto-close
// Closes all expired discussions. Called by daemon or client-side timer.
export async function POST(_req: NextRequest) {
  const agentKey = process.env.AGENT_API_KEY;
  if (!agentKey || _req.headers.get('x-agent-key') !== agentKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = closeExpiredDiscussions();
  return NextResponse.json(result);
}
