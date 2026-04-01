export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import type { DevTask, Post } from '@/lib/types';

// POST /api/reports/generate
// Protected by REPORT_SECRET query param
// Called by Mac Mini cron at 23:50 daily/weekly/monthly
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const body = await req.json();
  const reportType: 'daily' | 'weekly' | 'monthly' = body.type ?? 'daily';
  const periodStart: string = body.period_start; // 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD'
  const periodEnd: string = body.period_end;

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });
  }

  const db = getDb();

  // Normalize to YYYY-MM-DD for DATE() comparisons
  // (DB stores ISO 8601 like 2026-03-31T08:37Z; space-delimited strings fail string compare)
  const dateStart = periodStart.slice(0, 10);
  const dateEnd = periodEnd.slice(0, 10);

  // 1. Collect completed dev tasks in period
  const completedTasks = db.prepare(`
    SELECT id, title, detail, priority, completed_at
    FROM dev_tasks
    WHERE status = 'done'
      AND DATE(completed_at) >= ? AND DATE(completed_at) <= ?
    ORDER BY completed_at DESC
  `).all(dateStart, dateEnd) as Array<Pick<DevTask, 'id' | 'title' | 'detail' | 'priority'> & { completed_at: string }>;

  // 2. Collect issue posts created in period (bug signals)
  const issuesPosts = db.prepare(`
    SELECT id, title, content, status, created_at
    FROM posts
    WHERE type = 'issue'
      AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    ORDER BY created_at DESC
  `).all(dateStart, dateEnd) as Pick<Post, 'id' | 'title' | 'content' | 'status' | 'created_at'>[];

  // 3. Collect resolved posts in period (decisions made)
  const resolvedPosts = db.prepare(`
    SELECT id, title, type, resolved_at
    FROM posts
    WHERE status = 'resolved'
      AND type != 'report'
      AND DATE(resolved_at) >= ? AND DATE(resolved_at) <= ?
    ORDER BY resolved_at DESC
    LIMIT 10
  `).all(dateStart, dateEnd) as Pick<Post, 'id' | 'title' | 'type' | 'resolved_at'>[];

  // 4. Generate report with Claude Haiku
  const typeLabel = { daily: '일일', weekly: '주간', monthly: '월간' }[reportType];
  const periodLabel = formatPeriodLabel(reportType, periodStart, periodEnd);

  const PRIORITY_KO: Record<string, string> = { urgent: '긴급', high: '높음', medium: '중간', low: '낮음' };
  const tasksList = completedTasks.length > 0
    ? completedTasks.map(t =>
        `- [${PRIORITY_KO[t.priority] ?? t.priority}] ${t.title}${t.detail ? `: ${t.detail}` : ''}`
      ).join('\n')
    : '없음';

  const issuesList = issuesPosts.length > 0
    ? issuesPosts.map(i => `- ${i.title} (${i.status === 'resolved' ? '해결됨' : '처리 중'})`).join('\n')
    : '없음';

  const resolvedList = resolvedPosts.length > 0
    ? resolvedPosts.map(p => `- ${p.title}`).join('\n')
    : '없음';

  const prompt = `당신은 Jarvis — 이정우 대표의 AI 집사입니다. 아래 ${typeLabel} 데이터를 바탕으로 대표님께 드릴 업무 보고서를 작성하세요.

⚠️ 언어 규칙: 반드시 한국어로만 작성하세요. 중국어·한자·일본어 절대 금지. 영어 기술 용어도 쉬운 한국어로 바꾸세요.

기간: ${periodLabel}

[완료된 개발 작업 — ${completedTasks.length}건]
${tasksList}

[이슈·버그 — ${issuesPosts.length}건]
${issuesList}

[해결된 토론·결정사항 — ${resolvedPosts.length}건]
${resolvedList}

---
작성 지침:
- 말투: 집사가 대표님께 드리는 보고 어조 (~했습니다, ~되었습니다). 공손하되 딱딱하지 않게.
- 각 완료 작업은 비개발자도 이해할 수 있게 1~2문장으로 풀어서 설명. "무엇이 어떻게 개선됐는지" 위주.
  나쁜 예: "SSE 브로드캐스트 추가" → 좋은 예: "작업이 완료될 때 화면이 즉시 새로고침되도록 실시간 알림 기능을 추가했습니다."
- 완료 작업이 없으면 "오늘은 완료된 작업이 없었습니다"라고 솔직하게 쓰세요.
- 서론·맺음말·상투적 칭찬 ("훌륭한 하루", "열심히 일했습니다" 등) 금지.
- 이슈가 있으면 심각도와 현재 상태를 명확히.
- 해결된 토론·결정사항이 있으면 간략하게 언급.

보고서 구조 (이 형식을 정확히 따르세요):

## ✅ 완료 작업 (${completedTasks.length}건)
[각 작업을 쉬운 말로 설명. 작업이 없으면 "오늘은 완료된 작업이 없었습니다."]

## 🔍 품질 현황
[이슈 건수 및 상태, 해결된 결정사항 요약. 모두 없으면 "이슈 없음 · 특이사항 없음"]

## 📋 오늘의 요약
[전체를 2~3문장으로. 수치 포함. "오늘 자비스는 ..." 형식으로 시작]`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);

  let reportContent = '';
  if (aiRes?.ok) {
    const aiData = await aiRes.json() as { content: Array<{ text: string }> };
    reportContent = aiData?.content?.[0]?.text?.trim() ?? '';
  }
  const aiGenerated = !!reportContent;
  if (!reportContent) {
    // Fallback: simple template (AI 호출 실패 시)
    reportContent = `## ✅ 완료된 작업 (${completedTasks.length}건)\n${tasksList}\n\n## ⚠️ 품질 점검\n- 이슈: ${issuesPosts.length}건\n\n## 💬 종합 평가\nAI 생성에 실패하여 원본 데이터만 표시합니다.`;
  }

  // Full report with header
  const generatedBy = aiGenerated ? '' : ' · ⚠️ AI 실패(원본 데이터)';
  const fullContent = `${reportContent}\n\n---\n📅 ${periodLabel}${generatedBy}`;

  // 5. Store as post with type='report'
  const postId = randomUUID();
  const title = `📊 ${typeLabel}보고서 — ${periodLabel}`;
  const tags = JSON.stringify([reportType]);

  db.prepare(`
    INSERT INTO posts (id, title, type, author, author_display, content, status, priority, tags, created_at, updated_at)
    VALUES (?, ?, 'report', 'jarvis', 'Jarvis AI', ?, 'resolved', 'medium', ?, datetime('now'), datetime('now'))
  `).run(postId, title, fullContent, tags);

  // 6. Discord notification to #jarvis-ceo
  const webhookUrl = process.env.DISCORD_WEBHOOK_CEO;
  if (webhookUrl) {
    const emojiMap = { daily: '📊', weekly: '📈', monthly: '📅' };
    const shortSummary = completedTasks.length > 0
      ? completedTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n')
      : '완료된 작업 없음';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://board.ramsbaby.com';

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `${emojiMap[reportType]} ${title}`,
          description: `완료 ${completedTasks.length}건 · 이슈 ${issuesPosts.length}건\n\n${shortSummary}`,
          color: reportType === 'daily' ? 0x6366f1 : reportType === 'weekly' ? 0x10b981 : 0xf59e0b,
          url: `${appUrl}/reports/${postId}`,
          footer: { text: `Jarvis Board · ${periodLabel}` },
        }],
      }),
    }).catch(() => null);
  }

  return NextResponse.json({ postId, taskCount: completedTasks.length, issueCount: issuesPosts.length });
}

function formatPeriodLabel(type: 'daily' | 'weekly' | 'monthly', start: string, end: string): string {
  const s = start.slice(0, 10); // YYYY-MM-DD
  const e = end.slice(0, 10);
  if (type === 'daily') return s;
  if (type === 'weekly') return `${s} ~ ${e}`;
  return s.slice(0, 7); // YYYY-MM
}
