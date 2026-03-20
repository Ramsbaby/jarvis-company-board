export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { AUTHOR_META } from '@/lib/constants';
import { nanoid } from 'nanoid';

const AGENT_PERSONAS: Record<string, string> = {
  'strategy-lead':    '당신은 자비스 컴퍼니 전략팀 리더입니다. 비즈니스 전략과 의사결정 관점에서 통찰력 있는 의견을 제시합니다.',
  'infra-lead':       '당신은 자비스 컴퍼니 인프라팀 리더입니다. 기술적 관점에서 실행 가능성과 시스템 안정성을 중심으로 의견을 제시합니다.',
  'career-lead':      '당신은 자비스 컴퍼니 성장팀 리더입니다. 성장 가능성, 학습, 커리어 개발 관점에서 의견을 제시합니다.',
  'brand-lead':       '당신은 자비스 컴퍼니 브랜드팀 리더입니다. 마케팅과 브랜드 아이덴티티 관점에서 의견을 제시합니다.',
  'academy-lead':     '당신은 자비스 컴퍼니 학술팀 리더입니다. 교육과 지식 체계화 관점에서 의견을 제시합니다.',
  'record-lead':      '당신은 자비스 컴퍼니 기록팀 리더입니다. 문서화, 이력 추적, 지식 보존 관점에서 의견을 제시합니다.',
  'jarvis-proposer':  '당신은 자비스 AI 시스템 제안자입니다. 자동화와 AI 활용 가능성 관점에서 혁신적인 의견을 제시합니다.',
  'board-synthesizer': '당신은 자비스 보드 종합 분석가입니다. 모든 팀의 의견을 종합하여 균형 잡힌 결론을 제시합니다.',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Auth: owner only
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent } = await req.json();
  if (!agent || !AGENT_PERSONAS[agent]) {
    return NextResponse.json({ error: 'Invalid agent' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI 미설정' }, { status: 503 });

  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const comments = db.prepare(
    'SELECT author_display, content FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 10'
  ).all(id) as any[];

  const commentText = comments.length > 0
    ? comments.map((c: any) => `[${c.author_display}]: ${c.content}`).join('\n\n')
    : '(아직 댓글이 없습니다)';

  const persona = AGENT_PERSONAS[agent];
  const agentMeta = AUTHOR_META[agent as keyof typeof AUTHOR_META];

  const prompt = `${persona}

다음은 팀 토론 게시글입니다:

**제목**: ${post.title}
**내용**: ${post.content.slice(0, 800)}

**현재까지의 댓글**:
${commentText.slice(0, 1500)}

위 토론에 대해 당신의 역할과 전문성에 맞는 의견을 3-5문장으로 제시해 주세요. 마크다운 사용 가능. 한국어로 답변.`;

  // #21 Broadcast typing indicator before AI call
  broadcastEvent({ type: 'agent_typing', post_id: id, data: { agent, label: agentMeta?.label ?? agent } });

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
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json() as any;
    const content = data?.content?.[0]?.text?.trim() ?? '';
    if (!content) throw new Error('Empty response');

    // Post as agent comment
    const cid = nanoid();
    db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor)
      VALUES (?, ?, ?, ?, ?, 0, 0)`)
      .run(cid, id, agent, agentMeta?.label || agent, content);

    db.prepare(`UPDATE posts SET status='in-progress', updated_at=datetime('now') WHERE id=? AND status='open'`).run(id);

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
    broadcastEvent({ type: 'new_comment', post_id: id, data: comment });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
