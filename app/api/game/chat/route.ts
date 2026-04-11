export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { getDb } from '@/lib/db';

// 팀별 시스템 프롬프트
const TEAM_PROMPTS: Record<string, string> = {
  ceo: '나는 Jarvis Company의 CEO(이정우)입니다. 전체 시스템 운영 현황을 파악하고 전략적 의사결정을 내립니다. 질문에 대표로서 답변합니다.',
  'infra-lead': '나는 인프라팀장 박태성입니다. 서버, 디스크, 크론, Discord 봇 상태를 관리합니다. 시스템 상태에 대해 쉽게 설명합니다.',
  'trend-lead': '나는 정보팀장 강나연입니다. 뉴스, 시장 트렌드, 기술 동향을 분석합니다. 시장 상황을 쉽게 설명합니다.',
  'record-lead': '나는 기록팀장 한소희입니다. 일일 대화 기록, RAG 인덱싱, 데이터 아카이빙을 담당합니다.',
  'career-lead': '나는 커리어팀장 김서연입니다. 채용 시장 분석, 이력서, 면접 준비를 지원합니다.',
  'brand-lead': '나는 브랜드팀장 정하은입니다. 오픈소스 전략, 기술 블로그, GitHub 성장을 관리합니다.',
  'audit-lead': '나는 감사팀장 류태환입니다. 크론 실패 추적, E2E 테스트, 시스템 품질을 감시합니다.',
  'academy-lead': '나는 학습팀장 신유진입니다. 학습 계획, 스터디 큐레이션을 관리합니다.',
  'cron-engine': '나는 크론 엔진 관리자입니다. 자동화 태스크 스케줄링과 실행 상태를 관리합니다.',
  'discord-bot': '나는 Discord 봇 관리자입니다. 봇 프로세스 상태와 채팅 시스템을 관리합니다.',
};

export async function POST(req: NextRequest) {
  try {
    const { teamId, message } = await req.json();

    if (!teamId || !message) {
      return NextResponse.json({ error: 'teamId와 message는 필수입니다.' }, { status: 400 });
    }

    const systemPrompt = TEAM_PROMPTS[teamId] || `나는 Jarvis Company의 ${teamId} 담당자입니다. 질문에 답변합니다.`;
    const db = getDb();

    // 사용자 메시지 저장
    db.prepare('INSERT INTO game_chat (team_id, role, content) VALUES (?, ?, ?)').run(teamId, 'user', message);

    // 최근 대화 컨텍스트 (최근 6개)
    const recentMessages = db.prepare(
      'SELECT role, content FROM game_chat WHERE team_id = ? ORDER BY created_at DESC LIMIT 6'
    ).all(teamId) as Array<{ role: string; content: string }>;

    const conversationContext = recentMessages.reverse()
      .map(m => `${m.role === 'user' ? '사용자' : '나'}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\n짧고 자연스럽게 한국어로 답변해주세요.\n\n최근 대화:\n${conversationContext}`;

    // 임시 파일로 프롬프트 전달 (따옴표 이스케이프 문제 방지)
    const promptFile = path.join(tmpdir(), `jarvis-chat-${Date.now()}.txt`);
    const messageFile = path.join(tmpdir(), `jarvis-msg-${Date.now()}.txt`);

    let assistantContent: string;
    try {
      writeFileSync(promptFile, fullPrompt, 'utf8');
      writeFileSync(messageFile, message, 'utf8');

      assistantContent = execSync(
        `cat "${messageFile}" | claude -p --output-format text --system-prompt "$(cat "${promptFile}")"`,
        {
          timeout: 60_000,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          shell: '/bin/bash',
          env: { ...process.env, TERM: 'dumb' },
        }
      ).trim();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assistantContent = `잠시 응답을 생성하지 못했습니다. 다시 시도해주세요.`;
      console.error('[game-chat] claude error:', errMsg.slice(0, 200));
    } finally {
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      try { unlinkSync(messageFile); } catch { /* ignore */ }
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
