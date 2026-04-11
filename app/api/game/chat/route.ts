export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getDb } from '@/lib/db';

// 팀별 시스템 프롬프트
const TEAM_PROMPTS: Record<string, string> = {
  ceo: '나는 Jarvis Company의 CEO(정우)입니다. 전체 시스템 운영 현황을 파악하고 전략적 의사결정을 내립니다. 회사 방향성과 우선순위에 대해 답변합니다.',
  'infra-lead': '나는 인프라팀장입니다. 서버, 디스크, 크론, 봇 상태를 관리하고 시스템 안정성을 책임집니다. 기술적 질문에 답변합니다.',
  'trend-lead': '나는 정보팀장입니다. 트렌드, 시장 분석, 뉴스 모니터링을 담당합니다. 시장 동향과 정보 분석에 대해 답변합니다.',
  'record-lead': '나는 기록팀장입니다. 데이터 아카이빙, RAG 인덱싱, 세션 기록을 관리합니다. 기록과 메모리 관련 질문에 답변합니다.',
  'career-lead': '나는 커리어팀장입니다. 성장 전략, 이력서, 면접 준비를 지원합니다. 커리어 관련 조언을 제공합니다.',
  'brand-lead': '나는 브랜드팀장입니다. 오픈소스 전략, 블로그, 콘텐츠를 관리합니다. 브랜딩과 콘텐츠에 대해 답변합니다.',
  'audit-lead': '나는 감사팀장입니다. 품질 관리, 크론 실패 감사, KPI 추적을 담당합니다. 시스템 품질에 대해 답변합니다.',
  'academy-lead': '나는 학습팀장입니다. 학습 큐레이션과 스터디 계획을 관리합니다. 학습 관련 질문에 답변합니다.',
};

export async function POST(req: NextRequest) {
  try {
    const { teamId, message } = await req.json();

    if (!teamId || !message) {
      return NextResponse.json({ error: 'teamId와 message는 필수입니다.' }, { status: 400 });
    }

    const systemPrompt = TEAM_PROMPTS[teamId];
    if (!systemPrompt) {
      return NextResponse.json({ error: `알 수 없는 팀: ${teamId}` }, { status: 404 });
    }

    const db = getDb();

    // 사용자 메시지 저장
    db.prepare('INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)').run(teamId, 'user', message);

    // 최근 대화 컨텍스트 (최근 10개)
    const recentMessages = db.prepare(
      'SELECT role, content FROM game_chat WHERE team_id = ? ORDER BY created_at DESC LIMIT 10'
    ).all(teamId) as Array<{ role: string; content: string }>;

    // 역순으로 되돌려서 시간순 정렬
    const conversationContext = recentMessages.reverse()
      .map(m => `${m.role === 'user' ? '사용자' : '나'}: ${m.content}`)
      .join('\n');

    const fullSystemPrompt = `${systemPrompt}\n\n짧고 자연스럽게 한국어로 답변해주세요. 이모지를 적절히 사용하세요.\n\n최근 대화:\n${conversationContext}`;

    // claude -p 호출
    const sanitizedMessage = message.replace(/'/g, "'\\''");
    const sanitizedPrompt = fullSystemPrompt.replace(/'/g, "'\\''");

    let assistantContent: string;
    try {
      assistantContent = execSync(
        `claude -p '${sanitizedMessage}' --no-input --output-format text --system-prompt '${sanitizedPrompt}'`,
        { timeout: 60_000, encoding: 'utf8', maxBuffer: 1024 * 1024 }
      ).trim();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assistantContent = `죄송합니다, 잠시 응답을 생성하지 못했습니다. (${errMsg.slice(0, 100)})`;
    }

    // 어시스턴트 응답 저장
    const result = db.prepare(
      'INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)'
    ).run(teamId, 'assistant', assistantContent);

    const saved = db.prepare('SELECT * FROM game_chat WHERE id = ?').get(result.lastInsertRowid) as {
      id: number; team_id: string; role: string; content: string; created_at: number;
    };

    return NextResponse.json({
      id: saved.id,
      role: saved.role,
      content: saved.content,
      created_at: saved.created_at,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
