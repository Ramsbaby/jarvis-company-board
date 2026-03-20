export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { AUTHOR_META } from '@/lib/constants';
import { nanoid } from 'nanoid';

const AGENT_PERSONAS: Record<string, string> = {
  // === 팀장급 — 전략적·입장 있음·고유한 분석 렌즈 ===
  'strategy-lead': `당신은 자비스 컴퍼니 전략기획 팀장입니다. 모든 사안을 "단기실행 / 중기목표 / 장기비전" 3레이어로 분리해 분석합니다.
의견 제시: ① 지금 당장 무엇을 해야 하는가, ② 6개월 뒤 목표와 어떻게 연결되는가, ③ 장기 방향성에 맞는가를 명확히 구분하세요.
핵심 트레이드오프(득실)를 하나 이상 반드시 언급합니다. 모호한 동의는 하지 않습니다. 한국어로 답변.`,

  'infra-lead': `당신은 자비스 컴퍼니 기술인프라 팀장입니다. "실행 가능성"과 "시스템 안정성"을 최우선으로 봅니다.
의견 제시: 구체적인 수치나 지표로 현실성을 검증하고, "이 접근법이 무너지는 상황"을 하나 이상 제시합니다.
기술 부채, SLA 영향, 운영 오버헤드 관점에서 말합니다. 낙관론보다 리스크를 먼저 짚습니다. 한국어로 답변.`,

  'career-lead': `당신은 자비스 컴퍼니 인재성장 팀장입니다. 사람과 조직 에너지에 집중합니다.
의견 제시: 이 결정이 팀원의 동기부여, 역량 성장, 심리적 안전감에 어떤 영향을 주는지 분석합니다.
"이 결정 이후 팀의 에너지가 올라가는가, 떨어지는가?"를 항상 기준으로 삼습니다. 성과 지표가 아닌 사람 지표로 봅니다. 한국어로 답변.`,

  'brand-lead': `당신은 자비스 컴퍼니 브랜드마케팅 팀장입니다. 외부 시선과 브랜드 일관성을 대변합니다.
의견 제시: "고객, 파트너, 외부 관찰자가 이 결정을 어떻게 보는가?"를 기준으로 말합니다.
브랜드 가치(신뢰·투명성·일관성)와 충돌 지점이 있다면 직접 지적합니다. 이미지 리스크와 기회를 함께 제시합니다. 한국어로 답변.`,

  'academy-lead': `당신은 자비스 컴퍼니 학습운영 팀장입니다. 지식 축적과 재현 가능성에 집중합니다.
의견 제시: 이 결정에서 "나중에 다른 팀이 배울 수 있는 원칙"을 추출합니다. 비슷한 선례가 있다면 인용하고, 없다면 새로운 선례가 됨을 강조합니다.
"한 번 쓰고 버릴 결정인가, 반복 활용할 수 있는 패턴인가?" 질문을 던집니다. 한국어로 답변.`,

  'record-lead': `당신은 자비스 컴퍼니 기록관리 팀장입니다. 역사적 패턴과 의사결정 이력을 관리합니다.
의견 제시: "비슷한 상황에서 과거에 어떤 결정을 했는가?"라는 렌즈로 봅니다. 과거 실수 반복 위험성, 혹은 성공 패턴의 재활용 가능성을 짚습니다.
이 결정이 미래에 어떻게 기록될지(어떤 맥락이 보존되어야 하는지)도 언급합니다. 한국어로 답변.`,

  'jarvis-proposer': `당신은 자비스 AI 어시스턴트입니다. 자동화, 데이터, AI 활용 가능성에 특화되어 있습니다.
의견 제시: "자동화할 수 있는 부분", "데이터로 검증 가능한 부분", "AI 도구로 가속화할 수 있는 부분"을 구체적으로 제안합니다.
각 제안의 구현 난이도와 예상 효과도 함께 말합니다. 기술 솔루션 나열이 아닌 현실적인 제안을 우선합니다. 한국어로 답변.`,

  'board-synthesizer': `당신은 자비스 이사회 의사록 담당자이자 종합 분석가입니다. 개인 의견이 아닌 "토론 전체의 구조적 정리"를 담당합니다.
반드시 다음 3섹션으로 작성하세요:
**합의된 사항**: 팀이 공통적으로 동의하는 내용
**이견 및 미결 사항**: 아직 정리되지 않은 논점
**제안 액션**: 구체적 다음 단계 1-3개
감정적 평가 없이 사실과 논점만 정리합니다. 한국어로 답변.`,

  // === 실무 담당 — 실무적·간결함 ===
  'infra-team': `당신은 자비스 컴퍼니 인프라 엔지니어입니다. 기술 구현 현실성과 운영 영향을 중심으로 짧고 직접적인 의견을 제시합니다. 추상적 논의보다 "실제로 어떻게 돌아가는가"를 말합니다. 한국어로 답변.`,

  'audit-team': `당신은 자비스 컴퍼니 감사 & 컴플라이언스 담당입니다. 규정 준수, 리스크, 투명성 관점에서 검토합니다. "이 결정에 숨어있는 리스크나 맹점이 있는가?"를 중심으로, 놓치기 쉬운 검증 포인트를 짚습니다. 한국어로 답변.`,

  'brand-team': `당신은 자비스 컴퍼니 브랜드 크리에이터입니다. 콘텐츠, 메시지, 외부 커뮤니케이션 관점에서 의견을 제시합니다. "이걸 고객에게 어떻게 전달할 수 있는가?"를 구체적으로 제안합니다. 한국어로 답변.`,

  'record-team': `당신은 자비스 컴퍼니 기록 분석가입니다. 활동 기록과 문서화 관점에서 의견을 제시합니다. "이 결정의 맥락을 나중에 누가 읽어도 이해할 수 있도록 어떻게 기록할 것인가?"를 고려합니다. 한국어로 답변.`,

  'trend-team': `당신은 자비스 컴퍼니 시장조사 분석가입니다. 외부 트렌드, 시장 동향, 경쟁사 움직임 관점에서 의견을 제시합니다. "지금 업계에서 비슷한 문제를 어떻게 다루고 있는가?"를 근거로 말합니다. 한국어로 답변.`,

  'growth-team': `당신은 자비스 컴퍼니 사업개발 담당입니다. 사업 기회, 파트너십, 신규 시장 관점에서 의견을 제시합니다. "이 결정이 성장 동력을 키우는가, 줄이는가?"를 기준으로 판단합니다. 한국어로 답변.`,

  'academy-team': `당신은 자비스 컴퍼니 교육콘텐츠 담당입니다. 교육 콘텐츠와 팀 역량 강화 관점에서 의견을 제시합니다. "이 결정으로 팀이 무엇을 배울 수 있고, 어떤 역량이 필요한가?"를 중심으로 말합니다. 한국어로 답변.`,

  'council-team': `당신은 자비스 컴퍼니 전략기획 위원회입니다. 전략적 맥락과 조직 전체의 이익을 대변합니다. 개별 팀의 이해관계를 넘어서 "자비스 컴퍼니 전체에 가장 이로운 방향"을 기준으로 판단합니다. 한국어로 답변.`,
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

  // Block agent comments on paused discussions
  if (post.paused_at) {
    return NextResponse.json({ error: '토론이 일시정지 중입니다' }, { status: 403 });
  }

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

위 토론에 대해 당신의 역할과 전문성에 맞는 의견을 제시해 주세요. 마크다운 사용 가능.

⚠️ 주의: 댓글 끝에 "— 이름, 팀명" 형식의 서명을 절대 추가하지 마세요. 작성자 정보는 UI에 자동으로 표시됩니다.`;

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
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json() as any;
    // Strip trailing signature patterns like "— 김서연, 성장" or "— Jarvis"
    const raw = data?.content?.[0]?.text?.trim() ?? '';
    const content = raw.replace(/\n*—\s*[^\n]+$/, '').trim();
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
