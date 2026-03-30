export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';

interface FeedbackRow {
  strengths: string;
  weaknesses: string;
  score: number;
  category: string;
  difficulty: string;
  parse_error: number;
}

/**
 * GET /api/interview/tendency?company=kakaopay
 * 전체 세션 답변 패턴 분석: 강점 습관 / 약점 습관 / 점수 분포
 * interview_feedback 정규화 테이블 우선 사용, 없으면 interview_messages fallback.
 */
export async function GET(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company') ?? 'kakaopay';

  const db = getDb();

  let rows: FeedbackRow[] = [];
  try {
    rows = db.prepare(`
      SELECT
        COALESCE(f.strengths, '[]') AS strengths,
        COALESCE(f.weaknesses, '[]') AS weaknesses,
        f.score,
        s.category,
        s.difficulty,
        f.parse_error
      FROM interview_feedback f
      JOIN interview_sessions s ON s.id = f.session_id
      WHERE s.company = ?
        AND s.status = 'completed'
        AND f.score IS NOT NULL
        AND f.parse_error = 0
      ORDER BY s.created_at DESC
      LIMIT 200
    `).all(company) as FeedbackRow[];
  } catch {
    // interview_feedback 테이블 없을 경우 legacy fallback
    rows = db.prepare(`
      SELECT
        COALESCE(f.strengths, '[]') AS strengths,
        COALESCE(f.weaknesses, '[]') AS weaknesses,
        f.score,
        s.category,
        s.difficulty,
        0 AS parse_error
      FROM interview_messages f
      JOIN interview_sessions s ON s.id = f.session_id
      WHERE f.role = 'feedback'
        AND s.company = ?
        AND s.status = 'completed'
        AND f.score IS NOT NULL
      ORDER BY s.created_at DESC
      LIMIT 200
    `).all(company) as FeedbackRow[];
  }

  if (rows.length === 0) {
    return NextResponse.json({ company, session_count: 0, message: '완료된 세션이 없습니다.' });
  }

  // 강점/약점 키워드 빈도 집계
  const strengthMap = new Map<string, number>();
  const weaknessMap = new Map<string, number>();
  const scores: number[] = [];
  let parseFailCount = 0;

  for (const row of rows) {
    scores.push(row.score);
    try {
      const ss = JSON.parse(row.strengths) as string[];
      for (const s of ss) {
        const key = s.slice(0, 40).trim();
        if (key) strengthMap.set(key, (strengthMap.get(key) ?? 0) + 1);
      }
    } catch { parseFailCount++; }
    try {
      const ws = JSON.parse(row.weaknesses) as string[];
      for (const w of ws) {
        const key = w.slice(0, 40).trim();
        if (key) weaknessMap.set(key, (weaknessMap.get(key) ?? 0) + 1);
      }
    } catch { parseFailCount++; }
  }

  if (parseFailCount > 0) {
    console.warn(`[tendency] JSON 파싱 실패 건수: ${parseFailCount}`);
  }

  // 점수 분포
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const over80 = scores.filter(s => s >= 80).length;
  const over60 = scores.filter(s => s >= 60 && s < 80).length;
  const under60 = scores.filter(s => s < 60).length;

  // 성향 진단
  const tendency: string[] = [];
  const weaknessTop = [...weaknessMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const strengthTop = [...strengthMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  if (under60 / scores.length > 0.4) tendency.push('❌ 전체 답변의 40% 이상이 60점 미만 — 핵심 개념 재정립 필요');
  if (avg >= 75) tendency.push('✅ 평균 75점 이상 — 카카오페이 합격권 수준 유지 중');
  if (avg >= 60 && avg < 75) tendency.push('⚠️ 평균 60~74점 — 실무 구체성이 부족한 답변이 반복됨');

  const abstractPattern = weaknessTop.some(([k]) => k.includes('구체') || k.includes('추상') || k.includes('예시'));
  if (abstractPattern) tendency.push('📌 답변이 추상적 — 실제 구현/수치/장애 사례를 더 포함하세요');

  const implPattern = weaknessTop.some(([k]) => k.includes('구현') || k.includes('코드') || k.includes('세부'));
  if (implPattern) tendency.push('📌 구현 세부사항 미흡 — "어떻게 구현했는지" 코드 수준 설명 연습 필요');

  return NextResponse.json({
    company,
    total_answers: scores.length,
    avg_score: avg,
    score_distribution: { over80, over60, under60 },
    top_strengths: strengthTop.map(([text, count]) => ({ text, count })),
    top_weaknesses: weaknessTop.map(([text, count]) => ({ text, count })),
    tendency_diagnosis: tendency,
  });
}
