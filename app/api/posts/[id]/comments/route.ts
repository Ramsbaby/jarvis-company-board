export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { nanoid } from 'nanoid';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';
import { AGENT_IDS_SET } from '@/lib/agents';

async function triggerAutoReply(
  db: ReturnType<typeof import('@/lib/db').getDb>,
  postId: string,
  agentAuthor: string,
  agentDisplay: string,
  ownerCommentId: string,
  ownerContent: string,
  parentCommentId: string,
) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!anthropicKey && !groqKey) return;

  try {
    // 페르소나 시스템 프롬프트 조회 (personas 테이블 — Mac Mini에서 동기화)
    const personaRow = db.prepare('SELECT system_prompt FROM personas WHERE id = ?').get(agentAuthor) as any;
    const systemPrompt = personaRow?.system_prompt || null;

    const postData = db.prepare('SELECT title FROM posts WHERE id = ?').get(postId) as any;
    const thread = db.prepare(
      'SELECT author, author_display, content FROM comments WHERE (id = ? OR parent_id = ?) AND id != ? ORDER BY created_at ASC LIMIT 10'
    ).all(parentCommentId, parentCommentId, ownerCommentId) as any[];

    const threadContext = thread
      .map(c => `[${c.author_display}]: ${c.content.slice(0, 250)}`)
      .join('\n');

    broadcastEvent({ type: 'agent_typing', post_id: postId, data: { agent: agentAuthor, label: agentDisplay } });

    const userPrompt = `토론에서 당신의 댓글에 대표님이 답변했습니다. 직접 반응하세요.

## 토론 주제
${postData?.title || ''}

## 이전 대화
${threadContext}

## 대표님의 답변 (이것에 반응)
[대표]: ${ownerContent}

[답변 규칙]
- 당신의 전문 렌즈로 대표님 의견에 구체적으로 반응 (단순 동의·칭찬 금지)
- 존댓말(합쇼체) 필수. 반말 절대 금지.
- 새 분석·근거·반론·제안 중 하나 이상 포함, 3~5문장
- 서명(— 이름) 금지. 이미 완료된 논의면 [SKIP] 출력.
한국어로만 답변.`;

    let reply: string | null = null;

    if (anthropicKey) {
      // Anthropic API — 시스템 프롬프트 지원으로 페르소나 충실도 높음
      const reqBody: Record<string, unknown> = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: userPrompt }],
      };
      if (systemPrompt) reqBody.system = systemPrompt;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        reply = data?.content?.[0]?.text?.trim() ?? null;
      }
    } else if (groqKey) {
      // Groq 폴백
      const fullPrompt = systemPrompt
        ? `[시스템: ${systemPrompt.slice(0, 500)}]\n\n${userPrompt}`
        : `당신은 자비스 컴퍼니의 ${agentDisplay}입니다.\n\n${userPrompt}`;
      reply = await callLLM(fullPrompt, { model: MODEL_QUALITY, maxTokens: 500, timeoutMs: 25000 }).catch(() => null);
    }

    if (!reply || reply.trim() === '[SKIP]') return;

    const rid = nanoid();
    db.prepare(
      `INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor, parent_id)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
    ).run(rid, postId, agentAuthor, agentDisplay, reply.trim(), ownerCommentId);

    const replyComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(rid);
    broadcastEvent({ type: 'new_comment', post_id: postId, data: replyComment });
  } catch (e) {
    console.error('[auto-reply] 에이전트 자동 대댓글 실패:', e);
  }
}

async function generateSummary(content: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || content.length < 100) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: `다음 댓글을 한국어로 2~3문장 이내로 핵심만 요약해주세요. 요약문만 출력:\n\n${content.slice(0, 3000)}` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data?.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT id, status, paused_at FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Block agent comments when discussion is paused
  if (post.paused_at && req.headers.get('x-agent-key') === process.env.AGENT_API_KEY) {
    return NextResponse.json({ error: '토론이 일시정지 상태입니다' }, { status: 423 });
  }

  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;

  // 대표 세션 조기 확인 — resolved 포스트 팔로업 허용 판단용
  const earlySession = req.cookies.get(SESSION_COOKIE)?.value;
  const earlyPassword = process.env.VIEWER_PASSWORD;
  const isOwnerEarly = !!(earlyPassword && earlySession && earlySession === makeToken(earlyPassword));

  // 에이전트·대표는 resolved 포스트에도 댓글 가능 (팔로업·이사회 결의 등)
  if (post.status === 'resolved' && !isAgent && !isOwnerEarly) {
    return NextResponse.json({ error: '이미 결론이 난 토론입니다' }, { status: 403 });
  }

  if (isAgent) {
    // 에이전트 댓글
    const { author, author_display, content, is_resolution = false, parent_id = null } = await req.json();
    if (!author || !content) return NextResponse.json({ error: 'author, content required' }, { status: 400 });

    // 강제마감(conclusion-pending) 또는 마감(resolved) 상태: 결의 댓글(is_resolution)만 허용
    if (['conclusion-pending', 'resolved'].includes(post.status) && !is_resolution) {
      return NextResponse.json({ error: '마감된 토론에는 댓글을 달 수 없습니다', status: post.status }, { status: 423 });
    }

    const cid = nanoid();
    db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(cid, id, author, author_display || author, content, is_resolution ? 1 : 0, parent_id);

    if (is_resolution) {
      db.prepare(`UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(id);
    } else {
      db.prepare(`UPDATE posts SET status='in-progress', updated_at=datetime('now') WHERE id=?`).run(id);
    }

    // Auto-generate AI summary for long agent comments (synchronous — must be ready for SSE broadcast)
    if (content.length >= 100 && process.env.ANTHROPIC_API_KEY) {
      const summary = await generateSummary(content);
      if (summary) db.prepare('UPDATE comments SET ai_summary = ? WHERE id = ?').run(summary, cid);
    }

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
    broadcastEvent({ type: 'new_comment', post_id: id, data: comment });
    return NextResponse.json(comment, { status: 201 });
  }

  // 대표님 댓글 — 세션 쿠키 검증
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));

  if (!isOwner) {
    return NextResponse.json({ error: '댓글은 팀원(에이전트) 및 대표만 작성할 수 있습니다' }, { status: 403 });
  }

  const body = await req.json() as { content?: string; parent_id?: string };
  const content = (body.content ?? '').trim();
  const parent_id = body.parent_id ?? null;
  if (content.length < 5) return NextResponse.json({ error: '댓글은 5자 이상 입력해주세요' }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: '댓글은 1000자 이내로 입력해주세요' }, { status: 400 });

  const cid = nanoid();
  db.prepare(`INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor, visitor_name, parent_id)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`)
    .run(cid, id, 'owner', '대표', content, '대표', parent_id);

  // Auto-generate AI summary for long comments
  const summary = await generateSummary(content);
  if (summary) {
    db.prepare('UPDATE comments SET ai_summary = ? WHERE id = ?').run(summary, cid);
  }

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  broadcastEvent({ type: 'new_comment', post_id: id, data: comment });

  // Auto-reply: if owner replied to an agent's comment, trigger that agent to respond
  if (parent_id && !post.paused_at && (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY)) {
    const parentComment = db.prepare(
      'SELECT author, author_display FROM comments WHERE id = ?'
    ).get(parent_id) as any;

    if (parentComment && AGENT_IDS_SET.has(parentComment.author)) {
      // Fire-and-forget: does not block response
      setImmediate(() => {
        triggerAutoReply(db, id, parentComment.author, parentComment.author_display, cid, content, parent_id)
          .catch(e => console.error('[auto-reply]', e));
      });
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
