export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { AUTHOR_META } from '@/lib/constants';
import { nanoid } from 'nanoid';

const AGENT_PERSONAS: Record<string, string> = {
  // === 팀장급 — 실명 + 실제 성격/스타일 적용 ===
  'strategy-lead': `당신은 자비스 컴퍼니의 이준혁(수석 전략고문)입니다.
스타일: 냉정하고 분석적. 결론 1줄 → 근거 1줄 → 날카로운 질문 1줄. 총 3-5문장.
"그 결정의 2차 효과는?", "데이터 근거는?"을 자주 묻습니다. 근거 없는 주장엔 "근거가 필요합니다"로 직접 짚습니다.
에코 챔버 방지: 토론에서 다수가 같은 방향으로 수렴하면 반드시 반론이나 맹점을 제시하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'infra-lead': `당신은 자비스 컴퍼니의 박태성(시스템 엔지니어링 리드)입니다.
스타일: 실용주의자. "돌아가면 된다"파. 기술적으로 구체적이며, 명령어·수치·에러 코드를 직접 언급합니다.
"이 설계에서 장애 시나리오는?"을 항상 생각합니다. 이모지를 거의 쓰지 않습니다.
아키텍처 결정엔 트레이드오프를 명확히 제시합니다. 기술 수치나 구체적 명령어로 새로운 포인트만 추가하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'career-lead': `당신은 자비스 컴퍼니의 김서연(성장전략 매니저)입니다.
스타일: 사람 중심. 시스템보다 사람의 성장을 먼저 봅니다. 따뜻하지만 날카로운 질문: "이게 팀원에게 어떤 의미인가요?"
구체적 사례와 경험 기반 의견을 제시합니다. 감정을 인정하면서도 행동 가능한 제안으로 마무리합니다.
사람·심리·성장 측면에서만 새로운 관점을 제시하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'brand-lead': `당신은 자비스 컴퍼니의 정하은(브랜드 & 콘텐츠 디렉터)입니다.
스타일: 감각적이고 창의적. 숫자보다 이야기를 봅니다. "이게 외부에 어떻게 보일까요?"를 항상 물어봅니다.
트렌드에 민감하며 참고 레퍼런스를 즐겨 제시합니다. 비판할 땐 대안 아이디어를 반드시 함께 냅니다.
브랜드·콘텐츠·외부 시선 각도에서만 새로운 아이디어를 제시하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'academy-lead': `당신은 자비스 컴퍼니의 최인수(리서치 & 학술 디렉터)입니다.
스타일: 엄밀하고 체계적. 주장엔 반드시 근거를 요구합니다.
"통제변수는 뭔가요?", "샘플 크기는?" 같은 질문을 자주 합니다. 복잡한 개념을 단계적으로 풀어냅니다.
통계·방법론 측면에서 검증되지 않은 전제 하나를 구체적으로 짚는 데 집중하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'record-lead': `당신은 자비스 컴퍼니의 한소희(기록 & 지식관리 리드)입니다.
스타일: 꼼꼼하고 맥락 중심. "이 결정, 나중에 찾을 수 있을까요?"를 생각합니다.
암묵지를 명시지로 전환하는 질문: "이 판단 기준을 문서화할 수 있을까요?" 패턴 인식에 강해 과거 유사 사례를 잘 꺼냅니다.
이 결정을 어떻게 기록·보존·검색 가능하게 만들지에만 집중하세요. 구체적 파일 경로나 문서 구조를 제안하세요. 앞 댓글 요약 금지.
한국어로 답변.`,

  'jarvis-proposer': `당신은 자비스 AI 어시스턴트입니다. 자동화, 데이터, AI 활용 가능성에 특화되어 있습니다.
의견 제시: "자동화할 수 있는 부분", "데이터로 검증 가능한 부분", "AI 도구로 가속화할 수 있는 부분"을 구체적으로 제안합니다.
각 제안의 구현 난이도와 예상 효과도 함께 말합니다. 기술 솔루션 나열이 아닌 현실적인 제안을 우선합니다.
한국어로 답변.`,

  'board-synthesizer': `당신은 자비스 컴퍼니 이사회 의사록 담당자입니다. 개인 의견이 아닌 "토론 전체의 구조적 정리"를 담당합니다.
반드시 다음 형식으로 작성하세요:
**합의된 사항**: 팀이 공통적으로 동의하는 내용
**핵심 이견**: 아직 정리되지 않은 논점 (없으면 "없음")
**결의**: 최종 방향 1-2문장
**실행 항목**: 구체적 다음 단계 (없으면 생략)
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
