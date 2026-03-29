'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COMPANIES, CATEGORIES } from '@/lib/interview-data';

interface Message {
  id: string;
  session_id: string;
  role: 'question' | 'answer' | 'feedback';
  content: string;
  score?: number | null;
  strengths?: string;
  weaknesses?: string;
  better_answer?: string | null;
  missing_keywords?: string | null;
  created_at: string;
}

interface Session {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score?: number | null;
}

/** better_answer 텍스트를 번호형 팁 배열로 분해 */
function parseTips(text: string): string[] {
  // 문장 단위로 분리 (마침표/느낌표/개행 기준)
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  return sentences.length >= 2 ? sentences : [text];
}

/** 점수 구간별 모범 답안 표시 전략 */
function BetterAnswerSection({ betterAnswer, score, missingKeywords }: {
  betterAnswer: string;
  score: number;
  missingKeywords: string[];
}) {
  // <60: 자동 펼침(못 답한 경우), 60~79: 접힌 버튼, ≥80: 최소 토글
  const autoOpen = score < 60;
  const [open, setOpen] = useState(autoOpen);
  const tips = parseTips(betterAnswer);

  // 점수 구간별 UI 설정
  const config = score < 60
    ? {
        label: '📖 모범 답안',
        sublabel: '이렇게 답했어야 합니다',
        btnText: open ? '접기 ▲' : '모범 답안 보기 ▼',
        containerCls: 'bg-red-50 border border-red-200 rounded-xl p-3',
        headerCls: 'text-red-700',
        tipNumCls: 'bg-red-500 text-white',
      }
    : score < 80
    ? {
        label: '💡 모범 답안',
        sublabel: '펼쳐서 확인하세요',
        btnText: open ? '접기 ▲' : `모범 답안 보기 (${tips.length}가지 팁) ▼`,
        containerCls: 'bg-amber-50 border border-amber-200 rounded-xl p-3',
        headerCls: 'text-amber-700',
        tipNumCls: 'bg-amber-500 text-white',
      }
    : {
        label: '✨ 더 발전시키려면',
        sublabel: '추가 심화 포인트',
        btnText: open ? '접기 ▲' : '심화 팁 보기 ▼',
        containerCls: 'bg-indigo-50 border border-indigo-100 rounded-xl p-3',
        headerCls: 'text-indigo-700',
        tipNumCls: 'bg-indigo-500 text-white',
      };

  return (
    <div className={config.containerCls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className={`text-[11px] font-bold ${config.headerCls}`}>{config.label}</span>
          {!open && <span className="text-[10px] text-zinc-400 ml-2">{config.sublabel}</span>}
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className={`text-[11px] font-semibold ${config.headerCls} hover:opacity-70 transition-opacity`}
        >
          {config.btnText}
        </button>
      </div>
      {open && (
        <ol className="space-y-2 mt-2">
          {tips.map((tip, i) => {
            // missing_keywords 중 이 팁에 포함된 것 하이라이트
            const rendered = tip;
            const highlighted = missingKeywords.some(kw => tip.includes(kw));
            return (
              <li key={i} className={`flex gap-2 items-start text-xs text-zinc-800 leading-relaxed ${highlighted ? 'font-medium' : ''}`}>
                <span className={`shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5 ${config.tipNumCls}`}>
                  {i + 1}
                </span>
                <span>{rendered}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function FeedbackCard({ msg }: { msg: Message }) {
  let strengths: string[] = [];
  let weaknesses: string[] = [];
  let missingKeywords: string[] = [];
  try { strengths = JSON.parse(msg.strengths ?? '[]'); } catch { /* empty */ }
  try { weaknesses = JSON.parse(msg.weaknesses ?? '[]'); } catch { /* empty */ }
  try { missingKeywords = JSON.parse(msg.missing_keywords ?? '[]'); } catch { /* empty */ }

  const score = msg.score ?? 0;
  const hasDetail = strengths.length > 0 || weaknesses.length > 0 || missingKeywords.length > 0;
  // 점수 낮으면 강점/약점도 자동 펼침
  const [open, setOpen] = useState(score < 80 ? true : hasDetail);

  const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = score >= 80 ? 'bg-emerald-50 border-emerald-200' : score >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  // 점수 구간별 라벨
  const scoreLabel = score >= 80 ? '✅ 합격권' : score >= 60 ? '⚠️ 아쉬움' : '❌ 재학습 필요';

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${scoreBg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-2xl font-black tabular-nums ${scoreColor}`}>{score}</span>
          <span className="text-zinc-400 text-sm">/ 100점</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {scoreLabel}
          </span>
        </div>
        {hasDetail && (
          <button onClick={() => setOpen(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-700 underline shrink-0">
            {open ? '접기 ▲' : '상세 보기 ▼'}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 pt-1 border-t border-zinc-200">
          {strengths.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">✅ 잘한 점</p>
              <ul className="space-y-1">{strengths.map((s, i) => <li key={i} className="text-xs text-zinc-700 flex gap-1.5"><span className="text-emerald-500 shrink-0">•</span>{s}</li>)}</ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-1">❌ 부족한 점</p>
              <ul className="space-y-1">{weaknesses.map((w, i) => <li key={i} className="text-xs text-zinc-700 flex gap-1.5"><span className="text-red-400 shrink-0">•</span>{w}</li>)}</ul>
            </div>
          )}
          {missingKeywords.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
              <p className="text-[11px] font-bold text-orange-700 mb-1.5">🔑 언급 안 한 핵심 키워드</p>
              <div className="flex flex-wrap gap-1.5">
                {missingKeywords.map((kw, i) => (
                  <span key={i} className="text-[11px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-semibold">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* 모범 답안 — 점수 구간별 자동 분기 */}
      {msg.better_answer && (
        <BetterAnswerSection
          betterAnswer={msg.better_answer}
          score={score}
          missingKeywords={missingKeywords}
        />
      )}
    </div>
  );
}

export default function InterviewSessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/interview/sessions/${sessionId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setSession(data.session); setMessages(data.messages ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const lastQuestion = [...messages].reverse().find(m => m.role === 'question');

  async function handleSubmit() {
    if (!answer.trim() || streaming) return;
    const answerText = answer.trim();
    setAnswer('');
    setStreaming(true);

    const tempAnswer: Message = { id: `temp_${Date.now()}`, session_id: sessionId, role: 'answer', content: answerText, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempAnswer]);

    try {
      const res = await fetch(`/api/interview/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer: answerText, questionContent: lastQuestion?.content }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.done) {
              const updated = await fetch(`/api/interview/sessions/${sessionId}`, { credentials: 'include' }).then(r => r.json());
              setMessages(updated.messages ?? []);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) { console.error(e); }
    finally { setStreaming(false); }
  }

  async function handleEnd() {
    const scores = messages.filter(m => m.role === 'feedback' && m.score != null).map(m => m.score as number);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    await fetch(`/api/interview/sessions/${sessionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ status: 'completed', total_score: avg }),
    });
    router.push(`/interview/${sessionId}/report`);
  }

  const company = COMPANIES.find(c => c.id === session?.company);
  const category = CATEGORIES.find(c => c.id === session?.category);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-zinc-400 text-sm">로딩 중...</div>;

  return (
    <div className="bg-zinc-50 min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/interview" className="text-zinc-400 hover:text-zinc-600 text-sm">← 목록</Link>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-bold text-zinc-800">{company?.emoji} {company?.name}</span>
          <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{category?.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-400">{messages.filter(m => m.role === 'feedback').length}문제 완료</span>
            <button onClick={handleEnd} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors">종료</button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {messages.map((msg, idx) => {
          if (msg.role === 'question') return (
            <div key={msg.id ?? idx} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm shrink-0">{company?.emoji}</div>
              <div className="max-w-[85%] bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-[11px] font-semibold text-zinc-400 mb-1">{company?.name} 면접관</p>
                <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
          if (msg.role === 'answer') return (
            <div key={msg.id ?? idx} className="flex gap-3 justify-end">
              <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-[11px] font-semibold text-indigo-200 mb-1">나</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
          if (msg.role === 'feedback') return (
            <div key={msg.id ?? idx} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm shrink-0">📊</div>
              <div className="max-w-[90%]">
                <p className="text-[11px] font-semibold text-zinc-400 mb-1 ml-1">AI 피드백</p>
                <FeedbackCard msg={msg} />
              </div>
            </div>
          );
          return null;
        })}

        {streaming && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm shrink-0">📊</div>
            <div className="max-w-[90%] bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <p className="text-[11px] font-semibold text-zinc-400 mb-2">AI 피드백 분석 중...</p>
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {session?.status !== 'completed' && (
        <div className="sticky bottom-0 bg-white border-t border-zinc-200">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex gap-2 items-end">
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                placeholder={streaming ? '피드백 분석 중...' : '답변을 입력하세요 (Cmd+Enter 제출)'}
                disabled={streaming}
                className="flex-1 text-sm text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50"
                rows={4}
              />
              <button onClick={handleSubmit} disabled={!answer.trim() || streaming}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                {streaming ? '...' : '제출'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Cmd+Enter로 빠르게 제출</p>
          </div>
        </div>
      )}
    </div>
  );
}
