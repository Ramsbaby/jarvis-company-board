export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import type { DevTask, Post } from '@/lib/types';
import { GROQ_LLAMA_70B, getTodayCost, getMonthCost } from '@/lib/chat-cost';
import { CRON_LOG } from '@/lib/jarvis-paths';
import { parseCronLogLine } from '@/lib/map/cron-log-parser';
import { getRequestAuth } from '@/lib/guest-guard';

// POST /api/reports/generate
// Auth: REPORT_SECRET query param (Mac Mini cron) OR owner session (UI 수동 트리거)
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const envSecret = process.env.REPORT_SECRET ?? '';
  const secretOk = !!(secret && envSecret && secret === envSecret);
  const { isOwner } = getRequestAuth(req);
  if (!secretOk && !isOwner) {
    console.error('[report] auth fail — secret match:', secretOk, '· isOwner:', isOwner);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 });

  const body = await req.json();
  const reportType: 'daily' | 'weekly' | 'monthly' = body.type ?? 'daily';
  const periodStart: string = body.period_start;
  const periodEnd: string = body.period_end;

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });
  }

  const dateStart = periodStart.slice(0, 10);
  const dateEnd = periodEnd.slice(0, 10);
  const db = getDb();

  // 중복 방지: 같은 날짜·타입의 보고서가 이미 존재하면 스킵
  const existing = db.prepare(`
    SELECT id FROM posts
    WHERE type = 'report'
      AND JSON_EXTRACT(tags, '$[0]') = ?
      AND DATE(created_at) = ?
    LIMIT 1
  `).get(reportType, dateStart) as { id: string } | undefined;

  if (existing) {
    return NextResponse.json({ skipped: true, reason: 'already exists', existingId: existing.id });
  }

  // ── 데이터 수집 ────────────────────────────────────────────────

  // 1. 완료된 태스크
  const completedTasks = db.prepare(`
    SELECT id, title, detail, priority, completed_at
    FROM dev_tasks
    WHERE status = 'done'
      AND DATE(completed_at) >= ? AND DATE(completed_at) <= ?
    ORDER BY completed_at DESC
  `).all(dateStart, dateEnd) as Array<Pick<DevTask, 'id' | 'title' | 'detail' | 'priority'> & { completed_at: string }>;

  // 2. 실패한 태스크
  const failedTasks = db.prepare(`
    SELECT id, title, detail, priority
    FROM dev_tasks
    WHERE status = 'failed'
      AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(dateStart, dateEnd) as Array<Pick<DevTask, 'id' | 'title' | 'detail' | 'priority'>>;

  // 3. 진행 중인 태스크 (현재 시점)
  const inProgressTasks = db.prepare(`
    SELECT id, title, priority
    FROM dev_tasks
    WHERE status = 'in-progress'
    ORDER BY created_at DESC
    LIMIT 10
  `).all() as Array<Pick<DevTask, 'id' | 'title' | 'priority'>>;

  // 4. 기간 내 신규 태스크
  const newTasks = db.prepare(`
    SELECT id, title, priority, status
    FROM dev_tasks
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      AND status NOT IN ('done', 'failed')
    ORDER BY created_at DESC
    LIMIT 10
  `).all(dateStart, dateEnd) as Array<Pick<DevTask, 'id' | 'title' | 'priority'> & { status: string }>;

  // 5. 이슈 포스트
  const issuesPosts = db.prepare(`
    SELECT id, title, status, created_at
    FROM posts
    WHERE type = 'issue'
      AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    ORDER BY created_at DESC
  `).all(dateStart, dateEnd) as Pick<Post, 'id' | 'title' | 'status' | 'created_at'>[];

  // 6. 해결된 토론·결정사항
  const resolvedPosts = db.prepare(`
    SELECT id, title, type, resolved_at
    FROM posts
    WHERE status = 'resolved'
      AND type != 'report'
      AND DATE(resolved_at) >= ? AND DATE(resolved_at) <= ?
    ORDER BY resolved_at DESC
    LIMIT 10
  `).all(dateStart, dateEnd) as Pick<Post, 'id' | 'title' | 'type' | 'resolved_at'>[];

  // 7. 크론 실행 통계 (cron.log 파싱)
  const cronStats = gatherCronStats(dateStart, dateEnd);

  // 8. Claude/LLM 비용 누적
  const costStats = await gatherCostStats();

  // ── 프롬프트 구성 ──────────────────────────────────────────────

  const typeLabel = { daily: '일일', weekly: '주간', monthly: '월간' }[reportType];
  const periodLabel = formatPeriodLabel(reportType, periodStart, periodEnd);

  const PRIORITY_KO: Record<string, string> = { urgent: '🔴 긴급', high: '🟠 높음', medium: '🟡 중간', low: '⚪ 낮음' };
  const STATUS_KO: Record<string, string> = {
    pending: '대기', awaiting_approval: '승인대기', approved: '승인됨',
    'in-progress': '진행중', done: '완료', failed: '실패',
  };

  const fmt = (t: { title: string; detail?: string | null; priority: string }) =>
    `- [${PRIORITY_KO[t.priority] ?? t.priority}] ${t.title}${t.detail ? ` — ${t.detail}` : ''}`;

  const completedList  = completedTasks.length  > 0 ? completedTasks.map(fmt).join('\n')  : '없음';
  const failedList     = failedTasks.length     > 0 ? failedTasks.map(fmt).join('\n')     : '없음';
  const inProgressList = inProgressTasks.length > 0
    ? inProgressTasks.map(t => `- [${PRIORITY_KO[t.priority] ?? t.priority}] ${t.title}`).join('\n')
    : '없음';
  const newTasksList   = newTasks.length > 0
    ? newTasks.map(t => `- [${STATUS_KO[t.status] ?? t.status}] ${t.title}`).join('\n')
    : '없음';
  const issuesList     = issuesPosts.length > 0
    ? issuesPosts.map(i => `- ${i.title} (${i.status === 'resolved' ? '해결됨' : '처리중'})`).join('\n')
    : '없음';
  const resolvedList   = resolvedPosts.length > 0
    ? resolvedPosts.map(p => `- ${p.title}`).join('\n')
    : '없음';

  const cronStatsBlock = cronStats
    ? `[크론 실행 — 성공 ${cronStats.success}건 · 실패 ${cronStats.failed}건 · 스킵 ${cronStats.skipped}건]\n${
        cronStats.failedTasks.length > 0
          ? cronStats.failedTasks.map(t => `- ${t.task} (${t.time.slice(11)}) — ${t.message.slice(0, 120)}`).join('\n')
          : '실패한 크론 없음'
      }`
    : '[크론 실행 통계 수집 실패]';

  const costStatsBlock = costStats
    ? `[LLM 비용 — 오늘 $${costStats.today.toFixed(2)} · 이번 달 누적 $${costStats.month.toFixed(2)}]`
    : '[비용 통계 수집 실패]';

  const prompt = `당신은 Jarvis — 이정우 대표의 AI 집사입니다.
아래 ${typeLabel} 운영 데이터를 바탕으로 대표님께 드릴 ${typeLabel}보고서를 작성하세요.

【절대 준수 언어 규칙】
- 오직 한국어만 사용. 한자(漢字)·중국어·일본어 한 글자도 금지.
- 금지 예시: 不存在, 自動, 完了, 完成, 作業 → 전부 한국어로만.

【작성 원칙】
- 말투: "~했습니다", "~되었습니다" (집사가 대표님께 드리는 보고 어조)
- 각 완료 작업은 비개발자도 이해할 수 있게 1~2문장으로 설명. "무엇이 어떻게 개선됐는지" 위주.
  나쁜 예: "SSE 브로드캐스트 추가" → 좋은 예: "작업이 완료되면 화면이 즉시 새로고침되도록 실시간 알림 기능을 추가했습니다."
- 서론·맺음말·상투적 칭찬 완전 금지 ("수고하셨습니다", "훌륭한 하루" 등)
- 데이터가 0건이면 솔직하게 "없습니다"로 표기. 추측·예측 금지.
- 이슈·실패가 있으면 심각도와 현재 상태를 명확히 표기.

=== ${typeLabel} 운영 데이터 (${periodLabel}) ===

[완료된 작업 — ${completedTasks.length}건]
${completedList}

[실패한 작업 — ${failedTasks.length}건]
${failedList}

[현재 진행 중 — ${inProgressTasks.length}건]
${inProgressList}

[기간 내 신규 태스크 — ${newTasks.length}건]
${newTasksList}

[이슈·버그 — ${issuesPosts.length}건]
${issuesList}

[해결된 결정사항 — ${resolvedPosts.length}건]
${resolvedList}

${cronStatsBlock}

${costStatsBlock}

=== 보고서 형식 (정확히 따를 것) ===

## ✅ 완료 작업 (${completedTasks.length}건)
[각 작업을 쉬운 말로 1~2문장 설명. 없으면 "완료된 작업이 없었습니다."]

## ⚠️ 이슈 및 실패 (이슈 ${issuesPosts.length}건 · 실패 ${failedTasks.length}건)
[이슈와 실패 작업 설명. 없으면 "이슈 없음 · 실패 없음"]

## 🔄 진행 중 (${inProgressTasks.length}건)
[현재 진행 중인 작업 목록. 없으면 "진행 중인 작업 없음"]

## 🤖 자비스 운영 지표
[크론 실행 수치 한 줄(성공/실패/스킵) + 실패 크론이 있으면 심각도를 1~2문장으로 설명 + LLM 비용 한 줄. 수집 실패 섹션은 "통계 수집 실패"로 그대로 표기]

## 📋 ${typeLabel} 요약
[전체를 3~4문장으로. 수치(완료·실패·크론 성공률·비용) 포함. "오늘 자비스는 ..." 형식으로 시작]`;

  // ── AI 호출 (Groq LLaMA-3.3-70b) ─────────────────────────────

  const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_LLAMA_70B,
      max_tokens: 2000,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: '당신은 Jarvis, 이정우 대표의 AI 집사입니다. 오직 한국어(한글+숫자+영문)만 사용합니다. 한자·중국어·일본어 문자는 절대 사용하지 않습니다.',
        },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  }).catch(() => null);

  let reportContent = '';
  if (aiRes?.ok) {
    const aiData = await aiRes.json() as { choices: Array<{ message: { content: string } }> };
    reportContent = aiData?.choices?.[0]?.message?.content?.trim() ?? '';
  } else if (aiRes) {
    const errBody = await aiRes.text().catch(() => '(읽기 실패)');
    console.error('[report] Groq API 실패:', aiRes.status, errBody.slice(0, 300));
  } else {
    console.error('[report] Groq API 호출 자체 실패 (네트워크/타임아웃)');
  }

  // CJK 한자 잔존 시 제거 (safety net) — Korean Hangul은 유지
  if (reportContent) {
    reportContent = reportContent.replace(/[\u3400-\u9FFF\uF900-\uFAFF\u{20000}-\u{2A6DF}]/gu, '');
  }

  const aiGenerated = !!reportContent;
  if (!reportContent) {
    reportContent = [
      `## ✅ 완료 작업 (${completedTasks.length}건)`,
      completedTasks.length > 0 ? completedTasks.map(fmt).join('\n') : '완료된 작업이 없었습니다.',
      '',
      `## ⚠️ 이슈 및 실패 (이슈 ${issuesPosts.length}건 · 실패 ${failedTasks.length}건)`,
      issuesPosts.length === 0 && failedTasks.length === 0
        ? '이슈 없음 · 실패 없음'
        : [...issuesPosts.map(i => `- ${i.title}`), ...failedTasks.map(fmt)].join('\n'),
      '',
      `## 🔄 진행 중 (${inProgressTasks.length}건)`,
      inProgressTasks.length > 0
        ? inProgressTasks.map(t => `- ${t.title}`).join('\n')
        : '진행 중인 작업 없음',
      '',
      '## 🤖 자비스 운영 지표',
      cronStats
        ? `- 크론: 성공 ${cronStats.success}건 · 실패 ${cronStats.failed}건 · 스킵 ${cronStats.skipped}건`
        : '- 크론 통계 수집 실패',
      costStats
        ? `- LLM 비용: 오늘 $${costStats.today.toFixed(2)} · 이번 달 $${costStats.month.toFixed(2)}`
        : '- 비용 통계 수집 실패',
      '',
      '## 📋 요약',
      'AI 생성에 실패하여 원본 데이터만 표시합니다.',
    ].join('\n');
  }

  // 시간 포함 푸터
  const generatedAt = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const generatedByNote = aiGenerated ? `🤖 LLaMA-3.3-70b` : `⚠️ AI 실패 · 원본 데이터`;
  const fullContent = `${reportContent}\n\n---\n📅 ${periodLabel} · 생성 ${generatedAt} · ${generatedByNote}`;

  // ── DB 저장 ─────────────────────────────────────────────────────

  const postId = randomUUID();
  const title = `📊 ${typeLabel}보고서 — ${periodLabel}`;
  const tags = JSON.stringify([reportType]);

  db.prepare(`
    INSERT INTO posts (id, title, type, author, author_display, content, status, priority, tags, created_at, updated_at)
    VALUES (?, ?, 'report', 'jarvis', 'Jarvis AI', ?, 'resolved', 'medium', ?, datetime('now'), datetime('now'))
  `).run(postId, title, fullContent, tags);

  // ── Discord 알림 ───────────────────────────────────────────────

  const webhookUrl = process.env.DISCORD_WEBHOOK_CEO;
  if (webhookUrl) {
    const emojiMap = { daily: '📊', weekly: '📈', monthly: '📅' };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://board.ramsbaby.com';

    const statLines = [
      `✅ 완료 ${completedTasks.length}건`,
      failedTasks.length > 0 ? `❌ 실패 ${failedTasks.length}건` : null,
      inProgressTasks.length > 0 ? `🔄 진행중 ${inProgressTasks.length}건` : null,
      issuesPosts.length > 0 ? `⚠️ 이슈 ${issuesPosts.length}건` : null,
    ].filter(Boolean).join(' · ');

    const preview = completedTasks.length > 0
      ? completedTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n')
      : inProgressTasks.length > 0
        ? inProgressTasks.slice(0, 3).map(t => `• ${t.title} (진행중)`).join('\n')
        : '이 기간에 완료된 작업이 없습니다.';

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `${emojiMap[reportType]} ${title}`,
          description: `${statLines}\n\n${preview}`,
          color: reportType === 'daily' ? 0x6366f1 : reportType === 'weekly' ? 0x10b981 : 0xf59e0b,
          url: `${appUrl}/reports/${postId}`,
          footer: { text: `Jarvis Board · 생성 ${generatedAt}` },
        }],
      }),
    }).catch(() => null);
  }

  return NextResponse.json({
    postId,
    taskCount: completedTasks.length,
    failedCount: failedTasks.length,
    inProgressCount: inProgressTasks.length,
    issueCount: issuesPosts.length,
    aiGenerated,
  });
}

/**
 * cron.log에서 기간 내 실행 통계 집계.
 * dateStart/dateEnd: 'YYYY-MM-DD' 형식 (KST).
 */
function gatherCronStats(dateStart: string, dateEnd: string): {
  success: number;
  failed: number;
  skipped: number;
  failedTasks: Array<{ task: string; time: string; message: string }>;
} | null {
  try {
    const raw = fs.readFileSync(CRON_LOG, 'utf8');
    const lines = raw.split('\n').slice(-10000);
    let success = 0;
    let failed = 0;
    let skipped = 0;
    const failedTasks: Array<{ task: string; time: string; message: string }> = [];
    for (const line of lines) {
      const entry = parseCronLogLine(line);
      if (!entry) continue;
      const date = entry.time.slice(0, 10);
      if (date < dateStart || date > dateEnd) continue;
      if (entry.result === 'SUCCESS') success++;
      else if (entry.result === 'FAILED') {
        failed++;
        failedTasks.push({ task: entry.task, time: entry.time, message: entry.message });
      } else if (entry.result === 'SKIPPED') skipped++;
    }
    return { success, failed, skipped, failedTasks: failedTasks.slice(-8) };
  } catch {
    return null;
  }
}

/**
 * Claude/LLM 비용 조회 (chat-cost 원장).
 */
async function gatherCostStats(): Promise<{ today: number; month: number } | null> {
  try {
    const [today, month] = await Promise.all([getTodayCost(), getMonthCost()]);
    return { today, month };
  } catch {
    return null;
  }
}

function formatPeriodLabel(type: 'daily' | 'weekly' | 'monthly', start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);

  if (type === 'daily') {
    const d = new Date(s + 'T00:00:00+09:00');
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${s} (${weekday})`;
  }
  if (type === 'weekly') return `${s} ~ ${e}`;
  return s.slice(0, 7);
}
