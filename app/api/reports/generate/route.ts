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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key not set' }, { status: 503 });

  const body = await req.json();
  const reportType: 'daily' | 'weekly' | 'monthly' = body.type ?? 'daily';
  const periodStart: string = body.period_start; // 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD'
  const periodEnd: string = body.period_end;

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });
  }

  const db = getDb();

  // 1. Collect completed dev tasks in period
  const completedTasks = db.prepare(`
    SELECT id, title, detail, team, updated_at
    FROM dev_tasks
    WHERE status = 'completed'
      AND updated_at >= ? AND updated_at <= ?
    ORDER BY updated_at DESC
  `).all(periodStart, periodEnd) as Array<Pick<DevTask, 'id' | 'title' | 'detail' | 'updated_at'> & { team?: string }>;

  // 2. Collect issue posts created in period (bug signals)
  const issuesPosts = db.prepare(`
    SELECT id, title, content, status, created_at
    FROM posts
    WHERE type = 'issue'
      AND created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
  `).all(periodStart, periodEnd) as Pick<Post, 'id' | 'title' | 'content' | 'status' | 'created_at'>[];

  // 3. Collect resolved posts in period (decisions made)
  const resolvedPosts = db.prepare(`
    SELECT id, title, type, resolved_at
    FROM posts
    WHERE status = 'resolved'
      AND type != 'report'
      AND resolved_at >= ? AND resolved_at <= ?
    ORDER BY resolved_at DESC
    LIMIT 10
  `).all(periodStart, periodEnd) as Pick<Post, 'id' | 'title' | 'type' | 'resolved_at'>[];

  // 4. Generate report with Claude Haiku
  const typeLabel = { daily: '일일', weekly: '주간', monthly: '월간' }[reportType];
  const periodLabel = formatPeriodLabel(reportType, periodStart, periodEnd);

  const tasksList = completedTasks.length > 0
    ? completedTasks.map(t =>
        `- [${t.team ?? '전체'}] ${t.title}${t.detail ? `: ${t.detail}` : ''}`
      ).join('\n')
    : '없음';

  const issuesList = issuesPosts.length > 0
    ? issuesPosts.map(i => `- ${i.title} (${i.status === 'resolved' ? '해결됨' : '처리 중'})`).join('\n')
    : '없음';

  const prompt = `당신은 자비스 AI 시스템의 보고 담당입니다. 아래 데이터를 바탕으로 이정우 대표(비개발자)가 읽을 ${typeLabel} 보고서를 작성하세요.

핵심 관점: "자비스가 실제로 개선되었는가? 버그/문제는 없는가? 믿을 수 있는가?"

기간: ${periodLabel}

완료된 개발 작업 (${completedTasks.length}건):
${tasksList}

이슈/버그 리포트 (${issuesPosts.length}건):
${issuesList}

보고서 형식 (마크다운):
1. ## ✅ 완료된 작업 (N건)
   - 각 작업을 한 줄씩, 쉬운 말로 설명. 기술용어 금지. "무엇을 고쳤는지/만들었는지" 위주.
2. ## ⚠️ 품질 점검
   - 이슈/버그: N건 (있으면 간략 설명, 없으면 "이슈 없음")
   - 완료 후 연속 수정이 있었는지 (있으면 언급)
3. ## 💬 종합 평가
   - 2~3문장. "오늘 X가지 개선이 이루어졌습니다. [평가]" 형식.
   - 완료 작업이 없으면 솔직하게 "작업 없음"으로.

규칙: 한국어만, 쉬운 말, 사실만, 과장 금지.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);

  let reportContent = '';
  if (aiRes?.ok) {
    const aiData = await aiRes.json() as { content: Array<{ text: string }> };
    reportContent = aiData?.content?.[0]?.text?.trim() ?? '';
  }
  if (!reportContent) {
    // Fallback: simple template
    reportContent = `## ✅ 완료된 작업 (${completedTasks.length}건)\n${tasksList}\n\n## ⚠️ 품질 점검\n- 이슈: ${issuesPosts.length}건\n\n## 💬 종합 평가\nAI 생성 실패 - 원본 데이터를 확인하세요.`;
  }

  // Full report with header
  const fullContent = `${reportContent}\n\n---\n📅 기간: ${periodLabel}  |  🤖 자동 생성`;

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jarvis-board-production.up.railway.app';

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
