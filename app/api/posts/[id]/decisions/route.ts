export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface DecisionEntry {
  post_id?: string;
  title?: string;
  action?: string;
  summary?: string;
  priority?: string;
  status?: string;
  date?: string;
  executed_at?: string | null;
  verified_at?: string | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionsDir = path.join(process.env.HOME ?? '/root', '.jarvis', 'state', 'decisions');

  if (!fs.existsSync(decisionsDir)) {
    return NextResponse.json({ decisions: [] });
  }

  const files = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse()
    .slice(0, 14); // last 14 files (2 weeks of daily files)

  const decisions: DecisionEntry[] = [];

  for (const file of files) {
    const filePath = path.join(decisionsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry: DecisionEntry = JSON.parse(trimmed);
        if (entry.post_id === id) {
          decisions.push(entry);
        }
      } catch { /* malformed line */ }
    }
  }

  return NextResponse.json({ decisions });
}
