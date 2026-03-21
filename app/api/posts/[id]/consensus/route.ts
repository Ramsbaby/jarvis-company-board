export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';

export const SYSTEM_PROMPT = `당신은 자비스 컴퍼니 이사회 수석 결의 담당자입니다.

## 역할
토론의 모든 의견을 분석하여 두 독자가 즉시 활용할 수 있는 결의안을 작성합니다.
- **독자 A (이정우 대표/경영진)**: 이 결의로 무엇을 승인하고 어떤 자원을 배분할지 즉시 판단 가능해야 함
- **독자 B (Jarvis AI 코더)**: 이 결의를 읽고 첫 줄부터 코딩을 시작할 수 있어야 함

## 핵심 원칙
1. **쉬운 언어 절대 준수**: 모든 전문 용어·영어 단어 뒤에 즉시 괄호로 한국어 설명
   - 좋은 예: "벡터 검색(단어 뜻을 숫자로 바꿔 의미가 비슷한 것을 찾는 방식)"
   - 나쁜 예: "벡터 검색 최적화" (설명 없음)
2. **모호한 표현 금지**: "검토", "고려", "방향 수립" 단독 사용 금지
3. **실행 항목 5요소 필수**: [누가][무엇을][어떻게][언제까지][완료 기준]
4. **합의 미도달 항목 포함 금지**: 토론에서 명확히 합의된 것만 실행 항목에 넣음
5. **코딩 지시는 즉시 실행 가능한 수준**: 파일명·함수명·코드 예시까지 포함

## 출력 형식 (이 구조를 정확히 따를 것)

## 🏛️ 이사회 최종 결의

### 한 줄 요약
[이번 결의의 핵심을 20자 이내 평이한 문장으로. 예: "RAG 가중치 실험을 1주 내에 진행한다"]

### 합의된 사항
[토론에서 실질적으로 합의된 사항 2~4줄. 합의 미도달 시 "이번 토론에서 명확한 합의에 이르지 못했습니다" 명시]

### 이견 및 리스크
[의견이 나뉜 사항 또는 앞으로 주의할 점. 없으면 "주요 이견 없음"]

---

## ⚡ 실행 계획

> 합의된 항목만 포함. 합의되지 않은 항목은 절대 추가하지 않음.

### 비개발 작업
[아래 형식으로 각 항목 작성. 없으면 "비개발 작업 없음"]
- [ ] **[작업명]** — [담당자/팀], [기한]까지
  - 할 일: [구체적으로 무엇을 어떻게]
  - 완료 기준: [어떤 상태가 되면 이 작업이 끝난 것인지]

---

## 🤖 Jarvis 코딩 지시사항

> Jarvis 코더가 이 섹션만 읽고 바로 코딩을 시작할 수 있어야 합니다.
> 개발 작업이 없으면 "이번 결의에서 코딩 작업 없음"으로 명시.

### 🔴 HIGH — 지금 바로 시작
[아래 형식으로. 없으면 생략]
- [ ] **[작업명]**
  - 파일: \`경로/파일명\`
  - 할 일: [무엇을, 왜 바꾸는지 구체적으로]
  - 코드 힌트:
    \`\`\`
    // 변경 전 → 변경 후, 또는 추가할 코드 예시
    \`\`\`
  - 완료 기준: [어떤 테스트나 확인으로 완료를 알 수 있는지]

### 🟡 MEDIUM — 이번 주 내
[위와 같은 형식. 없으면 생략]

### 🟢 LOW — 여유 있을 때
[위와 같은 형식. 없으면 생략]

---
*자비스 컴퍼니 이사회 결의*

언어: 한국어. 경어체.
쉬운 말 절대 준수: 전문 용어·영어 단어를 쓸 때는 즉시 괄호로 쉬운 설명을 붙일 것. 처음 보는 사람도 바로 이해할 수 있어야 함.`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT consensus_summary, consensus_at, consensus_requested_at, consensus_pending_prompt FROM posts WHERE id = ?').get(id) as any;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pending = !!(row.consensus_requested_at && !row.consensus_summary);

  // Agent auth: expose pending_prompt so Mac Mini poller can process it
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = !!(agentKey && agentKey === process.env.AGENT_API_KEY);

  return NextResponse.json({
    consensus: row.consensus_summary ?? null,
    consensus_at: row.consensus_at ?? null,
    pending,
    ...(isAgent && pending ? {
      pending_prompt: row.consensus_pending_prompt ?? null,
      system_prompt: SYSTEM_PROMPT,
    } : {}),
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;

  // Allow either: owner session OR agent key (for Jarvis to submit results)
  const isOwner = !!(password && session && session === makeToken(password));
  const agentKey = _req.headers.get('x-agent-key');
  const isAgent = !!(agentKey && agentKey === process.env.AGENT_API_KEY);

  if (!isOwner && !isAgent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If agent is submitting results (x-agent-key + body has consensus field)
  if (isAgent) {
    const body = await _req.json().catch(() => ({})) as any;
    if (body.consensus) {
      const now = new Date().toISOString();
      db.prepare('UPDATE posts SET consensus_summary = ?, consensus_at = ?, consensus_requested_at = NULL, consensus_pending_prompt = NULL WHERE id = ?')
        .run(body.consensus, now, id);
      return NextResponse.json({ consensus: body.consensus, consensus_at: now });
    }
  }

  // Owner requesting new consensus — build prompt and set pending
  const allComments = db.prepare(`
    SELECT author, author_display, content, is_visitor FROM comments
    WHERE post_id = ? AND (is_resolution IS NULL OR is_resolution = 0)
    ORDER BY created_at ASC
  `).all(id) as any[];

  if (allComments.length === 0) {
    return NextResponse.json({ error: '분석할 의견이 없습니다' }, { status: 400 });
  }

  const agentComments = allComments.filter((c: any) => !c.is_visitor);
  const visitorComments = allComments.filter((c: any) => c.is_visitor);
  const agentText = agentComments.map((c: any) => `[${c.author_display || c.author}]: ${c.content}`).join('\n\n');
  const visitorSection = visitorComments.length > 0
    ? `\n\n### 방문자/외부 의견 (${visitorComments.length}건)\n${visitorComments.map((c: any) => `[${c.author_display || c.author}]: ${c.content}`).join('\n\n')}`
    : '';
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const userPrompt = `## 토론 정보\n제목: ${post.title}\n유형: ${post.type ?? 'discussion'}\n날짜: ${today}\n총 의견 수: ${allComments.length}개 (에이전트 ${agentComments.length}명, 방문자 ${visitorComments.length}명)\n\n## 팀 에이전트 의견 (${agentComments.length}건)\n${agentText || '(에이전트 의견 없음)'}${visitorSection}\n\n---\n위 토론의 모든 의견을 종합하여 이사회 최종 결의안을 작성해주세요.\n지정된 마크다운 형식을 정확히 따르고, 모호한 표현 없이 실행 가능한 수준으로 작성하세요.`;

  // Groq로 직접 동기 처리 (크론 대기 없이 5~15초 내 완료)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const consensus = await callLLM(userPrompt, {
        model: MODEL_QUALITY,
        maxTokens: 3500,
        timeoutMs: 55000,
        systemPrompt: SYSTEM_PROMPT,
      });
      const consensusAt = new Date().toISOString();
      db.prepare('UPDATE posts SET consensus_summary = ?, consensus_at = ?, consensus_requested_at = NULL, consensus_pending_prompt = NULL WHERE id = ?')
        .run(consensus, consensusAt, id);
      return NextResponse.json({ consensus, consensus_at: consensusAt, pending: false });
    } catch (e: any) {
      // Groq 실패 시 Mac Mini 크론 fallback
      console.error('[consensus] Groq 실패, 크론 fallback:', e.message);
    }
  }

  // Fallback: Mac Mini 크론 (GROQ_API_KEY 없거나 Groq 실패 시)
  const now = new Date().toISOString();
  db.prepare('UPDATE posts SET consensus_requested_at = ?, consensus_pending_prompt = ?, consensus_summary = NULL, consensus_at = NULL WHERE id = ?')
    .run(now, userPrompt, id);

  return NextResponse.json({ pending: true, consensus: null, consensus_at: null }, { status: 202 });
}
