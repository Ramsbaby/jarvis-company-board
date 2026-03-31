'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COMPANIES, CATEGORIES } from '@/lib/interview-data';
import { BetterAnswerSection } from '@/components/interview/BetterAnswerSection';

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

function PrincipleCheckCard({ sessionId, feedbackIdx }: { sessionId: string; feedbackIdx: number }) {
  const storageKey = `principle_${sessionId}_${feedbackIdx}`;
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(storageKey) ?? '';
  });
  const [saved, setSaved] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(storageKey);
  });

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setSaved(false);
  }

  function handleSave() {
    if (!value.trim()) return;
    localStorage.setItem(storageKey, value.trim());
    setSaved(true);
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-indigo-600">💡 원리 자가체크</p>
        {saved && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">✅ 정리됨</span>}
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleSave}
        placeholder="이 결정의 근본 원리가 뭔가? — 한 문장으로 정리해보세요"
        rows={2}
        className="w-full text-xs text-zinc-800 bg-white border border-indigo-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all placeholder:text-zinc-400"
      />
      {!saved && value.trim() && (
        <button
          onClick={handleSave}
          className="text-[11px] bg-indigo-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
        >
          저장
        </button>
      )}
    </div>
  );
}

function FeedbackCard({ msg, sessionId, onRegenSuccess }: {
  msg: Message;
  sessionId: string;
  onRegenSuccess: (updated: Message) => void;
}) {
  let strengths: string[] = [];
  let weaknesses: string[] = [];
  let missingKeywords: string[] = [];
  try { strengths = JSON.parse(msg.strengths ?? '[]'); } catch { /* empty */ }
  try { weaknesses = JSON.parse(msg.weaknesses ?? '[]'); } catch { /* empty */ }
  try { missingKeywords = JSON.parse(msg.missing_keywords ?? '[]'); } catch { /* empty */ }

  const [regenLoading, setRegenLoading] = useState(false);

  async function handleRegen() {
    setRegenLoading(true);
    try {
      const res = await fetch(`/api/interview/sessions/${sessionId}/regen-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId: msg.id }),
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; message: Message };
        if (data.ok) onRegenSuccess(data.message);
      }
    } finally {
      setRegenLoading(false);
    }
  }

  // contradiction은 msg.content (raw LLM JSON)에서 추출
  let contradiction: string | null = null;
  try {
    const raw = JSON.parse(msg.content ?? '{}');
    if (typeof raw.contradiction === 'string') contradiction = raw.contradiction;
  } catch { /* skip */ }

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
        <div className="flex items-center gap-2">
          {hasDetail && (
            <button onClick={() => setOpen(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-700 underline shrink-0">
              {open ? '접기 ▲' : '상세 보기 ▼'}
            </button>
          )}
          <button
            onClick={handleRegen}
            disabled={regenLoading}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 disabled:opacity-40 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-100"
            title="피드백 재생성 (LLM 재호출)"
          >
            {regenLoading ? '재생성 중…' : '🔄'}
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 pt-1 border-t border-zinc-200">
          {contradiction && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-2.5">
              <p className="text-[11px] font-bold text-red-700 mb-1">⚠️ 이전 답변과 모순 감지</p>
              <p className="text-xs text-red-700 leading-relaxed">{contradiction}</p>
            </div>
          )}
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

// Format seconds as MM:SS
function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function InterviewSessionClient({ sessionId, mode }: { sessionId: string; mode?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 에러 토스트 표시 (3초 후 자동 해제) */
  function showError(msg: string) {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(null), 4000);
  }

  // Elapsed timer per question
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Draft auto-save (debounce)
  const draftKey = `interview_draft_${sessionId}`;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore draft on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null;
    if (saved) setAnswer(saved);
  }, [draftKey]);

  // Debounced save on answer change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (answer) {
          localStorage.setItem(draftKey, answer);
        } else {
          localStorage.removeItem(draftKey);
        }
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [answer, draftKey]);

  useEffect(() => {
    fetch(`/api/interview/sessions/${sessionId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.session?.category === 'live-coding') {
          router.replace('/interview');
          return;
        }
        setSession(data.session); setMessages(data.messages ?? []); setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Reset and start elapsed timer when the last question changes
  const lastQuestion = [...messages].reverse().find(m => m.role === 'question');
  const lastQuestionId = lastQuestion?.id;

  useEffect(() => {
    setElapsedSecs(0);
    // Bug 1 fix: 질문 변경 시 베스트 답변 캐시 초기화
    setBestAnswer(null);
    setShowBest(false);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    questionTimerRef.current = setInterval(() => {
      setElapsedSecs(s => s + 1);
    }, 1000);
    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [lastQuestionId]);

  const feedbackCount = messages.filter(m => m.role === 'feedback').length;
  const isMicroMode = mode === 'micro';
  const microComplete = isMicroMode && feedbackCount >= 3;
  const questionNumber = feedbackCount + 1;

  const submitAnswer = useCallback(async (answerText: string) => {
    if (!answerText.trim() || streaming) return;
    setAnswer('');
    // Clear draft
    if (typeof window !== 'undefined') localStorage.removeItem(draftKey);
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
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      if (!res.body) throw new Error('스트림 없음');
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
            // 서버 측 에러 이벤트
            if (d.error && !d.done) {
              showError('피드백 생성 실패: ' + d.error);
              continue;
            }
            if (d.done) {
              if (d.error) {
                showError('피드백 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
              }
              // 증분 업데이트: 전체 리로드 대신 신규 메시지만 가져와 추가
              const updated = await fetch(`/api/interview/sessions/${sessionId}`, { credentials: 'include' }).then(r => r.json());
              const newMessages: Message[] = updated.messages ?? [];
              setMessages(newMessages);
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (e) {
      console.error('[submitAnswer]', e);
      showError('피드백을 불러오지 못했습니다. 네트워크 상태를 확인하세요.');
      // 임시 답변 메시지 제거 (에러 시)
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp_')));
    }
    finally { setStreaming(false); }
  }, [streaming, sessionId, lastQuestion, draftKey]);

  async function handleSubmit() {
    await submitAnswer(answer.trim());
  }

  async function handleDontKnow() {
    await submitAnswer('잘 모르겠습니다. 답변 예시와 함께 설명해 주시면 감사하겠습니다.');
  }

  // ── 베스트 답변 미리보기 ──
  const [bestAnswer, setBestAnswer] = useState<{ answer: string; keyPoints: string[]; whyGood: string } | null>(null);
  const [loadingBest, setLoadingBest] = useState(false);
  const [showBest, setShowBest] = useState(false);

  async function handleBestAnswer() {
    if (!lastQuestion) return;
    if (bestAnswer) { setShowBest(v => !v); return; }
    setLoadingBest(true);
    try {
      const res = await fetch('/api/interview/best-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: lastQuestion.content,
          company: session?.company,
          category: session?.category,
        }),
      });
      const data = await res.json();
      setBestAnswer(data);
      setShowBest(true);
    } finally {
      setLoadingBest(false);
    }
  }

  async function handleEnd() {
    const scores = messages.filter(m => m.role === 'feedback' && m.score != null).map(m => m.score as number);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    // Bug 2 fix: PATCH 실패 시 에러 토스트, 이동 차단
    try {
      const res = await fetch(`/api/interview/sessions/${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: 'completed', total_score: avg }),
      });
      if (!res.ok) {
        showError(`세션 저장 실패 (${res.status}) — 다시 시도해 주세요.`);
        return;
      }
    } catch {
      showError('네트워크 오류로 세션을 저장하지 못했습니다.');
      return;
    }
    router.push(`/interview/${sessionId}/report`);
  }

  const company = COMPANIES.find(c => c.id === session?.company);
  const category = CATEGORIES.find(c => c.id === session?.category);

  const charCount = answer.length;
  const charWarning = charCount > 0 && charCount < 50;

  if (loading) return <div className="flex items-center justify-center min-h-screen text-zinc-400 text-sm">로딩 중...</div>;

  return (
    <div className="bg-zinc-50 min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/interview" className="text-zinc-400 hover:text-zinc-600 text-sm">← 목록</Link>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-bold text-zinc-800">{company?.emoji} {company?.name}</span>
          <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{category?.name}</span>
          <div className="ml-auto flex items-center gap-3">
            {/* Micro mode indicator */}
            {isMicroMode && (
              <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                ⚡ 마이크로 {feedbackCount}/3
              </span>
            )}
            {/* Question counter */}
            <span className="text-sm font-black text-indigo-600 tabular-nums">Q{questionNumber}</span>
            {/* Elapsed timer */}
            <span className="text-xs text-zinc-400 tabular-nums font-mono">{formatElapsed(elapsedSecs)}</span>
            <span className="text-xs text-zinc-400">{feedbackCount}문제 완료</span>
            {/* Bug 3 fix: streaming 중 종료 버튼 비활성화 */}
            <button onClick={handleEnd} disabled={streaming} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 transition-colors">종료</button>
          </div>
        </div>
      </header>

      {/* 에러 토스트 */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
          <span>⚠️</span>
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-1 text-red-200 hover:text-white text-xs">✕</button>
        </div>
      )}

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {(() => {
          const feedbackMessages = messages.filter(m => m.role === 'feedback');
          return messages.map((msg, idx) => {
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
          if (msg.role === 'feedback') {
            const feedbackIdx = feedbackMessages.indexOf(msg);
            return (
              <div key={msg.id ?? idx} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm shrink-0">📊</div>
                <div className="max-w-[90%] space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-400 mb-1 ml-1">AI 피드백</p>
                  <FeedbackCard
                    msg={msg}
                    sessionId={sessionId}
                    onRegenSuccess={(updated) => setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))}
                  />
                  <PrincipleCheckCard sessionId={sessionId} feedbackIdx={feedbackIdx} />
                </div>
              </div>
            );
          }
          return null;
        });
        })()}

        {microComplete && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-sm shrink-0">⚡</div>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-4 space-y-3 max-w-[90%]">
              <p className="text-sm font-black text-amber-800">⚡ 마이크로 드릴 완료!</p>
              <p className="text-xs text-amber-700 leading-relaxed">3문제를 완료했습니다. 피드백을 확인하고 약점을 파악하세요.</p>
              <button
                onClick={handleEnd}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors"
              >
                📊 결과 보기 →
              </button>
            </div>
          </div>
        )}
        {streaming && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm shrink-0">📊</div>
            <div className="max-w-[90%] bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <p className="text-[11px] font-semibold text-zinc-500 mb-2">🤔 면접관이 답변을 평가하고 있습니다...</p>
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

      {session?.status !== 'completed' && !microComplete && (
        <div className="sticky bottom-0 bg-white border-t border-zinc-200">
          {/* ── 베스트 답변 패널 ── */}
          {showBest && bestAnswer && (
            <div className="max-w-3xl mx-auto px-4 pt-3">
              <div className="bg-indigo-950 border border-indigo-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-indigo-300 uppercase tracking-wider">🏆 베스트 답변 — 면접관 감탄 수준</p>
                  <button onClick={() => setShowBest(false)} className="text-indigo-500 hover:text-indigo-300 text-xs">✕ 닫기</button>
                </div>
                <p className="text-xs text-indigo-100 leading-relaxed whitespace-pre-wrap">{bestAnswer.answer}</p>
                {bestAnswer.keyPoints.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">핵심 키워드</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bestAnswer.keyPoints.map((kp, i) => (
                        <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-800 text-indigo-200 border border-indigo-600">
                          {kp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {bestAnswer.whyGood && (
                  <p className="text-[11px] text-indigo-400 border-t border-indigo-800 pt-2">💡 {bestAnswer.whyGood}</p>
                )}
              </div>
            </div>
          )}

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
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={handleSubmit} disabled={!answer.trim() || streaming}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                  {streaming ? '...' : '제출'}
                </button>
                <button
                  onClick={handleBestAnswer}
                  disabled={loadingBest || streaming}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap ${
                    showBest ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                  title="이 질문의 베스트 답변 보기"
                >
                  {loadingBest ? '...' : '🏆 베스트'}
                </button>
                <button
                  onClick={handleDontKnow}
                  disabled={streaming}
                  className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-600 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  모름 💬
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-zinc-400">Cmd+Enter 제출 · 🏆 베스트로 모범 답안 확인</p>
              <div className="flex items-center gap-2">
                {charWarning ? (
                  <span className="text-[11px] text-orange-500 font-semibold">너무 짧습니다 — 구체적으로 답변하세요</span>
                ) : null}
                <span className={`text-[11px] tabular-nums ${charWarning ? 'text-orange-500' : 'text-zinc-400'}`}>
                  {charCount > 0 ? `${charCount}자` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
