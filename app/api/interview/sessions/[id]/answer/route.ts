export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';
import { getFeedbackSystemPrompt } from '@/lib/interview-data';

function nanoid() {
  return `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const { answer, questionContent } = await req.json();
  if (!answer?.trim()) return new Response(JSON.stringify({ error: 'answer required' }), { status: 400 });

  const db = getDb();
  const session = db.prepare(`SELECT * FROM interview_sessions WHERE id = ?`).get(id) as {
    id: string; company: string; category: string; difficulty: string;
  } | undefined;
  if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });

  const answerId = nanoid();
  db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'answer', ?)`).run(answerId, id, answer);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return new Response('GROQ_API_KEY missing', { status: 500 });

  const systemPrompt = getFeedbackSystemPrompt(session.company, session.category, session.difficulty);
  // 답변이 "모르겠어요", "모름", 공백 등 비어있어도 반드시 JSON 평가를 수행하도록 명시
  const answerNote = answer.trim().length < 20
    ? `(지원자가 짧게 답변하였습니다. 내용이 부족하더라도 반드시 JSON 형식으로 평가하세요.)`
    : '';
  const prompt = `[지원자 답변]\n${answer}\n${answerNote}\n\n[질문]\n${questionContent ?? '이전 질문'}\n\n위 답변에 대해 반드시 JSON 형식으로만 평가해주세요. 답변이 불충분하더라도 score:0과 함께 weaknesses와 better_answer를 반드시 포함하세요.`;

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      temperature: 0.3,
      stream: true,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!groqRes.ok) return new Response(JSON.stringify({ error: 'LLM error' }), { status: 500 });

  const encoder = new TextEncoder();
  let fullText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content ?? '';
              if (token) {
                fullText += token;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }

        let score: number | null = null;
        let strengths: string[] = [];
        let weaknesses: string[] = [];
        let betterAnswer: string | null = null;
        let nextQuestion: string | null = null;

        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            score = parsed.score ?? null;
            strengths = parsed.strengths ?? [];
            weaknesses = parsed.weaknesses ?? [];
            betterAnswer = parsed.better_answer ?? null;
            nextQuestion = parsed.next_question ?? null;
          }
        } catch { /* keep nulls */ }

        const feedbackId = nanoid();
        db.prepare(
          `INSERT INTO interview_messages (id, session_id, role, content, score, strengths, weaknesses, better_answer) VALUES (?, ?, 'feedback', ?, ?, ?, ?, ?)`
        ).run(feedbackId, id, fullText, score, JSON.stringify(strengths), JSON.stringify(weaknesses), betterAnswer);

        if (nextQuestion) {
          db.prepare(`INSERT INTO interview_messages (id, session_id, role, content) VALUES (?, ?, 'question', ?)`).run(nanoid(), id, nextQuestion);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, score, nextQuestion })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Railway/Nginx 버퍼링 방지
    },
  });
}
