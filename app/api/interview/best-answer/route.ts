export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuth } from '@/lib/guest-guard';
import { callLLM, MODEL_QUALITY } from '@/lib/llm';

export async function POST(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { question, company, category } = await req.json();
  if (!question?.trim()) return NextResponse.json({ error: 'question required' }, { status: 400 });

  const systemPrompt = `당신은 ${company || '대기업'} 기술 면접 전문가입니다.
주어진 면접 질문에 대해 면접관이 감탄할 수준의 모범 답변을 작성하세요.

조건:
- 실제 현업 경험을 녹인 구체적인 답변
- STAR 기법(상황→과제→행동→결과) 구조 활용
- 기술 원리를 쉬운 비유로 설명
- 카카오페이/핀테크 도메인과 연결
- 500자 이내로 핵심만

반드시 아래 JSON으로만 응답:
{
  "answer": "<모범 답변 전문>",
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "whyGood": "<이 답변이 좋은 이유 — 1~2문장>"
}`;

  let raw: string;
  try {
    raw = await callLLM(`[면접 질문]\n${question}\n\n[카테고리] ${category || '기술'}`, {
      model: MODEL_QUALITY,
      systemPrompt,
      maxTokens: 1000,
      temperature: 0.4,
    });
  } catch {
    return NextResponse.json({ error: 'LLM 호출 실패' }, { status: 500 });
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ answer: raw, keyPoints: [], whyGood: '' });
  }
}
