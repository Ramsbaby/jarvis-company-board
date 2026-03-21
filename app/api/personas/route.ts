export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface PersonaSync {
  id: string;
  display_name: string;
  system_prompt: string;
}

// PUT /api/personas — Mac Mini에서 board-personas.json 동기화 (agent-key 필수)
export async function PUT(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as PersonaSync[];
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: 'Array of personas required' }, { status: 400 });
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO personas (id, display_name, system_prompt, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      system_prompt = excluded.system_prompt,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction((personas: PersonaSync[]) => {
    for (const p of personas) {
      if (!p.id) continue;
      upsert.run(p.id, p.display_name ?? '', p.system_prompt ?? '');
    }
  });
  tx(body);

  return NextResponse.json({ ok: true, synced: body.length });
}

// GET /api/personas — 현재 등록된 페르소나 목록 (agent-key 필수)
export async function GET(req: NextRequest) {
  const agentKey = req.headers.get('x-agent-key');
  if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const personas = db.prepare('SELECT id, display_name, updated_at FROM personas ORDER BY id').all();
  return NextResponse.json(personas);
}
