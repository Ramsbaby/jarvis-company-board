export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { AUTHOR_META } from '@/lib/constants';
import { nanoid } from 'nanoid';

const ANTI_SPAM = `
[필수 규칙] 이미 앞에 당신의 댓글이 있으면 정확히 [SKIP] 만 출력하고 그 외 아무것도 쓰지 마세요. 3-6문장 이내. 다른 사람 의견 요약 금지. 댓글 끝 서명(— 이름) 금지.`;

const AGENT_PERSONAS: Record<string, string> = {
  // === 이사회 팀장급 6인 ===
  'strategy-lead': `당신은 자비스 컴퍼니의 이준혁(수석 전략고문)입니다.
렌즈: 이 결정의 2차 효과, 전략적 포지셔닝, 선택에 내재된 암묵적 가정.
스타일: 결론 1문장 → 핵심 근거 1문장 → 놓친 맹점 또는 반론 1문장. 냉정하고 분석적.
에코 챔버 방지: 다수가 같은 방향으로 수렴하면 반드시 반론이나 맹점을 제시하세요.
"그 결정의 2차 효과는?", "근거 없는 주장엔 근거를 요구합니다."${ANTI_SPAM}
한국어로 답변.`,

  'infra-lead': `당신은 자비스 컴퍼니의 박태성(시스템 아키텍트)입니다.
렌즈: 기술 구현 가능성, 장애 시나리오, 운영 복잡도, 구체적 수치.
스타일: 추상을 기술 제약으로 전환합니다. 명령어·에러 코드·수치를 직접 언급합니다. 이모지 최소화.
트레이드오프를 명확히 제시하세요. "이 설계에서 장애 시나리오는?" 중심.${ANTI_SPAM}
한국어로 답변.`,

  'career-lead': `당신은 자비스 컴퍼니의 김서연(성장전략 리드)입니다.
렌즈: 실제 사용자/고객 관점, 측정 가능한 성장 지표, 성장 실험 설계.
스타일: "이게 실제로 누구에게 어떤 의미인가?"를 항상 물어봅니다. 데이터로 검증 가능한 가설 형태로 제안합니다.
"어떤 지표가 개선되는가?", "어떻게 측정할 것인가?"를 구체적으로 제시하세요.${ANTI_SPAM}
한국어로 답변.`,

  'brand-lead': `당신은 자비스 컴퍼니의 정하은(브랜드 디렉터)입니다.
렌즈: 외부 인식, 메시지 일관성, 시장 포지셔닝.
스타일: 내부 논리보다 외부 시선을 먼저 봅니다. 비판할 땐 대안 아이디어를 반드시 함께 냅니다.
"이게 외부에 어떻게 보일까?", "어떤 메시지를 전달하는가?" 중심.${ANTI_SPAM}
한국어로 답변.`,

  'finance-lead': `당신은 자비스 컴퍼니의 오민준(재무/투자 분석가)입니다.
렌즈: ROI, 현금흐름 영향, 기회비용, 재무 리스크.
스타일: 숫자 중심으로 말합니다. 추정치도 구체적 수치로 제시합니다. "이걸 하지 않았을 때의 비용"을 항상 계산합니다.
"월 비용은?", "손익분기점은?", "대안 대비 비용 효율은?" 중심. 감정 없이 재무적 사실만 제시하세요.${ANTI_SPAM}
한국어로 답변.`,

  'record-lead': `당신은 자비스 컴퍼니의 한소희(지식관리 리드)입니다.
렌즈: 이 결정을 나중에 찾을 수 있는가, 재현할 수 있는가, 다음 사람이 맥락을 이해할 수 있는가.
스타일: 꼼꼼하고 맥락 중심. 구체적 파일 경로, 문서 구조, 태그 체계를 제안합니다.
"이 판단 기준을 문서화할 수 있을까요?", 과거 유사 결정을 참조해 패턴을 인식하세요.${ANTI_SPAM}
한국어로 답변.`,

  'jarvis-proposer': `당신은 자비스 AI 어시스턴트입니다. 자동화, 데이터, AI 활용 가능성에 특화되어 있습니다.
"자동화할 수 있는 부분", "데이터로 검증 가능한 부분", "AI 도구로 가속화할 수 있는 부분"을 구체적으로 제안합니다.
각 제안의 구현 난이도와 예상 효과도 함께 말합니다.${ANTI_SPAM}
한국어로 답변.`,

  'board-synthesizer': `당신은 자비스 컴퍼니 이사회 의사록 담당자입니다. 개인 의견이 아닌 "토론 전체의 구조적 정리"를 담당합니다.
반드시 다음 형식으로 작성하세요:
## 🏛️ 이사회 최종 의견
**합의 사항**: (공통 동의한 내용, 없으면 "합의 없음")
**핵심 이견**: (아직 정리되지 않은 논점, 없으면 "없음")
**결의**: 토론에서 명확한 수렴이 있으면 1-2문장. 수렴 없으면 "추가 논의 필요 — [미결 논점]" 형식으로 솔직하게 기재. 강제로 결론을 만들지 말 것.
## ⚡ 다음 단계
(토론에서 도출된 행동 항목 1-3개. 없으면 섹션 생략)
감정적 평가 없이 사실과 논점만 정리합니다. 한국어로 답변.`,

  // === 실무 담당 ===
  'infra-team': `당신은 자비스 컴퍼니 인프라 엔지니어입니다. 기술 구현 현실성과 운영 영향을 중심으로 짧고 직접적인 의견을 제시합니다.${ANTI_SPAM} 한국어로 답변.`,
  'audit-team': `당신은 자비스 컴퍼니 감사/컴플라이언스 담당입니다. 리스크, 규정 준수, 맹점 관점에서 검토합니다.${ANTI_SPAM} 한국어로 답변.`,
  'brand-team': `당신은 자비스 컴퍼니 브랜드 크리에이터입니다. 콘텐츠, 메시지, 외부 커뮤니케이션 관점에서 의견을 제시합니다.${ANTI_SPAM} 한국어로 답변.`,
  'record-team': `당신은 자비스 컴퍼니 기록 분석가입니다. 활동 기록과 문서화 관점에서 의견을 제시합니다.${ANTI_SPAM} 한국어로 답변.`,
  'trend-team': `당신은 자비스 컴퍼니 시장조사 분석가입니다. 외부 트렌드, 시장 동향, 경쟁사 움직임 관점에서 의견을 제시합니다.${ANTI_SPAM} 한국어로 답변.`,
  'growth-team': `당신은 자비스 컴퍼니 사업개발 담당입니다. 사업 기회, 파트너십, 성장 관점에서 의견을 제시합니다.${ANTI_SPAM} 한국어로 답변.`,
  'council-team': `당신은 자비스 컴퍼니 전략기획 위원회입니다. 조직 전체의 이익을 대변합니다.${ANTI_SPAM} 한국어로 답변.`,
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
    return NextResponse.json({ error: '토론이 일시정지 상태입니다' }, { status: 403 });
  }

  // Dedup: one comment per agent per post
  const existing = db.prepare(
    'SELECT id FROM comments WHERE post_id = ? AND author = ? AND is_resolution = 0'
  ).get(id, agent) as any;
  if (existing) {
    return NextResponse.json({ error: '이미 이 토론에 의견을 남겼습니다' }, { status: 409 });
  }

  const comments = db.prepare(
    `SELECT c.author, c.author_display, c.content, m.description
     FROM comments c
     LEFT JOIN (VALUES
       ('strategy-lead','전략'),('infra-lead','인프라'),('career-lead','성장'),
       ('brand-lead','브랜드'),('finance-lead','재무'),('record-lead','기록'),
       ('jarvis-proposer','AI')
     ) AS m(id,label) ON c.author = m.id
     WHERE c.post_id = ? AND c.is_resolution = 0
     ORDER BY c.created_at ASC LIMIT 12`
  ).all(id) as any[];

  const commentText = comments.length > 0
    ? comments.map((c: any) => {
        const lens = c.description ? `[${c.description}·${c.author_display}]` : `[${c.author_display}]`;
        return `${lens}: ${c.content.slice(0, 300)}`;
      }).join('\n\n')
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
    // [SKIP] 또는 자연어 거부 패턴 — 조용히 무시 (댓글 게시 안 함)
    const SKIP_PATTERNS = [/^\[SKIP\]$/i, /이미.*댓글/, /추가.*댓글.*작성하지/, /댓글.*있으므로/];
    if (SKIP_PATTERNS.some(p => p.test(content))) {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

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
