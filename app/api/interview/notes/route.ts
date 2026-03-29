export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';

interface NoteRow {
  feedback_id: string;
  session_id: string;
  company: string;
  category: string;
  difficulty: string;
  question_content: string;
  score: number;
  weaknesses: string;
  missing_keywords: string;
  better_answer: string;
  session_created_at: string;
}

/**
 * GET /api/interview/notes?company=kakaopay&threshold=70
 * score < threshold인 피드백을 카테고리별로 묶어 오답노트 반환
 */
export async function GET(req: NextRequest) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company') ?? 'kakaopay';
  const threshold = Math.min(parseInt(searchParams.get('threshold') ?? '70'), 100);

  const db = getDb();

  // feedback 메시지에서 score < threshold인 항목 + 직전 question 내용 조인
  const rows = db.prepare(`
    SELECT
      f.id AS feedback_id,
      f.session_id,
      s.company,
      s.category,
      s.difficulty,
      COALESCE(
        (SELECT content FROM interview_messages q
         WHERE q.session_id = f.session_id AND q.role = 'question'
           AND q.created_at < f.created_at
         ORDER BY q.created_at DESC LIMIT 1),
        '질문 없음'
      ) AS question_content,
      f.score,
      COALESCE(f.weaknesses, '[]') AS weaknesses,
      COALESCE(f.missing_keywords, '[]') AS missing_keywords,
      COALESCE(f.better_answer, '') AS better_answer,
      s.created_at AS session_created_at
    FROM interview_messages f
    JOIN interview_sessions s ON s.id = f.session_id
    WHERE f.role = 'feedback'
      AND s.company = ?
      AND f.score IS NOT NULL
      AND f.score < ?
    ORDER BY f.score ASC, s.created_at DESC
    LIMIT 100
  `).all(company, threshold) as NoteRow[];

  // 카테고리별 그룹핑
  const grouped: Record<string, {
    category: string;
    items: Array<{
      feedback_id: string;
      session_id: string;
      difficulty: string;
      question: string;
      score: number;
      weaknesses: string[];
      missing_keywords: string[];
      better_answer: string;
      session_date: string;
    }>;
  }> = {};

  for (const row of rows) {
    if (!grouped[row.category]) {
      grouped[row.category] = { category: row.category, items: [] };
    }
    let weaknesses: string[] = [];
    let missingKw: string[] = [];
    try { weaknesses = JSON.parse(row.weaknesses); } catch { /* empty */ }
    try { missingKw = JSON.parse(row.missing_keywords); } catch { /* empty */ }

    grouped[row.category].items.push({
      feedback_id: row.feedback_id,
      session_id: row.session_id,
      difficulty: row.difficulty,
      question: row.question_content,
      score: row.score,
      weaknesses,
      missing_keywords: missingKw,
      better_answer: row.better_answer,
      session_date: row.session_created_at,
    });
  }

  return NextResponse.json({
    company,
    threshold,
    total: rows.length,
    categories: Object.values(grouped),
  });
}
