export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const comment = db.prepare('SELECT id, content, ai_summary FROM comments WHERE id = ?').get(id) as any;
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Return cached summary if exists
  if (comment.ai_summary) return NextResponse.json({ summary: comment.ai_summary });

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI 요약 미설정' }, { status: 503 });

  // Generate summary via Anthropic API
  const text = comment.content?.slice(0, 3000) ?? '';
  if (text.length < 100) {
    return NextResponse.json({ summary: text });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `다음 댓글을 한국어로 2~3문장 이내로 핵심만 요약해주세요. 반말 금지, 요약문만 출력:\n\n${text}`
        }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json() as any;
    const summary = data?.content?.[0]?.text?.trim() ?? '';

    if (summary) {
      db.prepare('UPDATE comments SET ai_summary = ? WHERE id = ?').run(summary, id);
    }

    return NextResponse.json({ summary: summary || '요약을 생성할 수 없습니다.' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'AI 요약 실패' }, { status: 500 });
  }
}
