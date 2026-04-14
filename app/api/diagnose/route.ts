export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { checkAndConsume, getKey } from '@/lib/rate-limit';
import { recordCost, getTodayCost, getDailyCap, computeCostUsd, GROQ_LLAMA_70B } from '@/lib/chat-cost';
import { CRON_LOG, TASKS_JSON } from '@/lib/jarvis-paths';

// Groq llama-3.3-70b-versatile (OpenAI 호환, JSON 모드 지원)
// MODEL 문자열은 lib/chat-cost.ts SSoT에서 import — typo 시 price table miss → costUsd=0 방지
const MODEL = GROQ_LLAMA_70B;
const MAX_TOKENS = 800;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const RATE_LIMIT = { perMin: 10, perDay: 100 };

interface TaskDef {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: string;
}

interface TasksFile {
  tasks: TaskDef[];
}

interface DiagnoseResult {
  causes: string[];
  fix: string;
}

function readCronTail(maxLines = 500): string[] {
  const file = CRON_LOG;
  if (!existsSync(file)) return [];
  try {
    // Read last ~256KB to avoid huge files — then tail maxLines.
    const MAX_BYTES = 256 * 1024;
    const raw = readFileSync(file, 'utf8');
    const sliced = raw.length > MAX_BYTES ? raw.slice(-MAX_BYTES) : raw;
    const lines = sliced.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function readTaskDef(cronId: string): TaskDef | null {
  const file = TASKS_JSON;
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as TasksFile;
    if (!Array.isArray(parsed.tasks)) return null;
    return parsed.tasks.find((t) => t.id === cronId) ?? null;
  } catch {
    return null;
  }
}

function extractCronEntries(lines: string[], cronId: string, max = 20): string[] {
  const needle = cronId.toLowerCase();
  const hits: string[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes(needle)) {
      hits.push(line);
    }
  }
  return hits.slice(-max);
}

function parseDiagnoseJson(text: string): DiagnoseResult {
  // Strip code fences if present
  const stripped = text.replace(/```json\s*|```\s*/g, '').trim();
  // Attempt direct parse, then regex fallback
  try {
    const parsed = JSON.parse(stripped);
    const causes = Array.isArray(parsed.causes)
      ? parsed.causes.map((c: unknown) => String(c)).slice(0, 3)
      : [];
    const fix = typeof parsed.fix === 'string' ? parsed.fix : '';
    return { causes, fix };
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const causes = Array.isArray(parsed.causes)
          ? parsed.causes.map((c: unknown) => String(c)).slice(0, 3)
          : [];
        const fix = typeof parsed.fix === 'string' ? parsed.fix : '';
        return { causes, fix };
      } catch {
        /* fallthrough */
      }
    }
    return { causes: [], fix: '' };
  }
}

export async function POST(req: NextRequest) {
  let cronId: string;
  try {
    const body = await req.json();
    cronId = body?.cronId;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!cronId || typeof cronId !== 'string') {
    return NextResponse.json({ error: 'cronId는 필수입니다.' }, { status: 400 });
  }

  // Rate limit (전용 키)
  const rlKey = `diagnose:${getKey(req)}`;
  const rl = checkAndConsume(rlKey, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.reason ?? ''}`.trim() },
      { status: 429 },
    );
  }

  // Cost cap
  try {
    const [today, cap] = await Promise.all([getTodayCost(), getDailyCap()]);
    if (today >= cap) {
      return NextResponse.json(
        { error: `비용 상한 도달 (오늘 $${today.toFixed(4)} / 상한 $${cap.toFixed(2)})` },
        { status: 429 },
      );
    }
  } catch (err) {
    console.error('[diagnose] cost check failed:', err);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // Gather data
  const tail = readCronTail(500);
  const entries = extractCronEntries(tail, cronId, 20);
  const taskDef = readTaskDef(cronId);

  const taskDesc = taskDef
    ? `id: ${taskDef.id}
name: ${taskDef.name ?? '(이름 없음)'}
schedule: ${taskDef.schedule ?? '(없음)'}
description: ${taskDef.description ?? '(없음)'}
prompt: ${(taskDef.prompt ?? '').slice(0, 400)}`
    : `(tasks.json에서 ${cronId} 정의를 찾지 못함)`;

  const logBlock = entries.length > 0 ? entries.join('\n') : '(최근 로그 없음)';

  const systemPrompt =
    '너는 크론 실패 진단 엔진이다. 주어진 로그와 태스크 정의를 보고 실패 원인 최대 3가지와 즉시 실행 가능한 해결책 1가지를 JSON으로 답한다. 형식: {"causes": ["원인1", "원인2"], "fix": "해결책"}';

  const userPrompt = `[태스크 정의]
${taskDesc}

[최근 크론 로그 엔트리]
${logBlock}

이 크론의 최근 실패를 분석해줘. 반드시 위 JSON 형식만 출력하라.`;

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text().catch(() => '');
      throw new Error(`Groq HTTP ${groqRes.status}: ${errBody.slice(0, 300)}`);
    }

    const groqData = (await groqRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const fullText = groqData.choices?.[0]?.message?.content ?? '';
    const parsed = parseDiagnoseJson(fullText);
    const inputTokens = groqData.usage?.prompt_tokens ?? 0;
    const outputTokens = groqData.usage?.completion_tokens ?? 0;
    const costUsd = computeCostUsd(MODEL, inputTokens, outputTokens);

    // Record cost (best-effort)
    try {
      await recordCost({ model: MODEL, inputTokens, outputTokens });
    } catch (costErr) {
      console.error('[diagnose] recordCost failed:', costErr);
    }

    if (parsed.causes.length === 0 && !parsed.fix) {
      return NextResponse.json(
        {
          causes: ['모델 응답 파싱 실패'],
          fix: '수동으로 로그를 확인하세요.',
          costUsd,
          raw: fullText.slice(0, 500),
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      causes: parsed.causes,
      fix: parsed.fix,
      costUsd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[diagnose] error:', msg);
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500 });
  }
}
