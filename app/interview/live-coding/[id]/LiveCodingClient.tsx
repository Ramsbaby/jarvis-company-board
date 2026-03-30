'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LCProblem as LiveCodingProblem } from '@/lib/live-coding-problems';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-zinc-900 text-zinc-500 text-sm h-full">
      에디터 로딩 중...
    </div>
  ),
});

const TOTAL_SECONDS = 30 * 60;

interface Feedback {
  score: number;
  correctness: string;
  timeComplexity: string;
  spaceComplexity: string;
  goodPoints: string[];
  improvements: string[];
  edgeCases: string[];
  interviewerComment: string;
}

function Timer({ running, onExpire, compact = false }: { running: boolean; onExpire: () => void; compact?: boolean }) {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && remaining > 0) {
      ref.current = setInterval(() => setRemaining(r => r - 1), 1000);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  useEffect(() => {
    if (remaining === 0) onExpire();
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');
  const pct = (remaining / TOTAL_SECONDS) * 100;
  const isUrgent = remaining < 300;
  const isWarning = remaining < 600;
  const elapsed = TOTAL_SECONDS - remaining;

  if (compact) {
    return (
      <div className={`font-mono text-base font-black tabular-nums ${isUrgent ? 'text-red-400 animate-pulse' : isWarning ? 'text-amber-400' : 'text-zinc-200'}`}>
        {mins}:{secs}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end gap-0.5">
        <span className={`font-mono text-xl font-black tabular-nums leading-none ${isUrgent ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-zinc-200'}`}>
          {mins}:{secs}
        </span>
        <span className="text-[10px] text-zinc-500">{Math.floor(elapsed / 60)}분 경과</span>
      </div>
      <div className="flex flex-col gap-1 items-center">
        <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isUrgent && <span className="text-[9px] text-red-400 font-bold animate-pulse">⚡ 마감 임박</span>}
      </div>
    </div>
  );
}

const BOILERPLATE = `public class Solution {
    public static void main(String[] args) {
        Solution sol = new Solution();
        // TODO: 테스트 케이스 작성
    }

    // TODO: 풀이 구현

}`;

export default function LiveCodingClient({
  sessionId,
  problem,
  initialCode,
  existingFeedback,
  alreadyCompleted,
}: {
  sessionId: string;
  problem: LiveCodingProblem;
  initialCode: string;
  existingFeedback: Feedback | null;
  alreadyCompleted: boolean;
}) {
  const [code, setCode] = useState(initialCode || problem.starterCode || BOILERPLATE);
  const [started, setStarted] = useState(alreadyCompleted);
  const [timerRunning, setTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(alreadyCompleted ? Date.now() : null);
  const [feedback, setFeedback] = useState<Feedback | null>(existingFeedback);
  const [modelSolution, setModelSolution] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [expired, setExpired] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'examples' | 'constraints'>('problem');
  // 모바일: 문제/코드 메인 탭
  const [mobileView, setMobileView] = useState<'problem' | 'code'>('problem');
  const [fontSize, setFontSize] = useState(14);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // 데스크탑 드래그 리사이즈
  const [leftPct, setLeftPct] = useState(42);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleStart = () => {
    setStarted(true);
    setTimerRunning(true);
    setStartTime(Date.now());
    if (isMobile) setMobileView('code'); // 모바일은 시작하면 코드 탭으로
  };

  const getElapsed = useCallback(() => {
    if (!startTime) return 0;
    return Math.floor((Date.now() - startTime) / 1000);
  }, [startTime]);

  const handleExpire = useCallback(() => {
    setTimerRunning(false);
    setExpired(true);
  }, []);

  const handleHint = async () => {
    if (hintUsed || hint) return;
    setLoadingHint(true);
    try {
      const res = await fetch(`/api/interview/live-coding/${sessionId}/hint`);
      const data = await res.json();
      setHint(data.hint);
      setHintUsed(true);
    } finally {
      setLoadingHint(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting || feedback) return;
    setSubmitting(true);
    setTimerRunning(false);
    try {
      const res = await fetch(`/api/interview/live-coding/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeUsed: getElapsed(), hintUsed }),
      });
      const data = await res.json();
      setFeedback(data.feedback);
      setModelSolution(data.modelSolution);
      if (isMobile) setMobileView('problem'); // 제출 후 피드백 보여주기
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 데스크탑 드래그 리사이저
  const onMouseDown = () => { dragging.current = true; };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 25), 70));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const scoreColor = (score: number) =>
    score >= 90 ? 'text-emerald-400 bg-emerald-950 border-emerald-800' :
    score >= 70 ? 'text-blue-400 bg-blue-950 border-blue-800' :
    score >= 50 ? 'text-amber-400 bg-amber-950 border-amber-800' : 'text-red-400 bg-red-950 border-red-800';

  const difficultyBadge = (d: string) =>
    d === 'easy' ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700' :
    d === 'medium' ? 'bg-amber-900/60 text-amber-400 border border-amber-700' :
    'bg-red-900/60 text-red-400 border border-red-700';

  // ── 전체화면 에디터 오버레이 ──
  if (editorFullscreen && started && !feedback) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-400 hidden sm:inline">☕ Java — {problem.title}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="w-6 h-6 rounded bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center hover:bg-zinc-600">−</button>
              <span className="text-xs text-zinc-400 w-8 text-center">{fontSize}px</span>
              <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="w-6 h-6 rounded bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center hover:bg-zinc-600">+</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {timerRunning && <Timer running={timerRunning} onExpire={handleExpire} compact />}
            <button onClick={handleCopy} className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
              {copied ? '✓' : '복사'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? '평가 중...' : '🚀 제출'}
            </button>
            <button onClick={() => setEditorFullscreen(false)} className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor
            height="100%"
            language="java"
            theme="vs-dark"
            value={code}
            onChange={v => setCode(v ?? '')}
            options={{
              fontSize,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col text-zinc-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700/60 shadow-lg flex-shrink-0">
        <div className="max-w-[1400px] mx-auto px-3 py-2.5 flex items-center gap-2">
          <Link href="/interview" className="text-zinc-500 hover:text-zinc-300 text-xs shrink-0 transition-colors">← 면접</Link>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-zinc-100 truncate max-w-[160px] sm:max-w-none">{problem.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${difficultyBadge(problem.difficulty)}`}>
              {problem.difficulty === 'easy' ? '쉬움' : problem.difficulty === 'medium' ? '보통' : '어려움'}
            </span>
            <div className="hidden sm:flex gap-1 flex-wrap">
              {problem.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700">{t}</span>
              ))}
            </div>
          </div>
          {started && !alreadyCompleted && (
            <div className="shrink-0">
              <Timer running={timerRunning} onExpire={handleExpire} compact={isMobile} />
            </div>
          )}
        </div>

        {/* 모바일 탭 바 — 코딩 시작 후 */}
        {started && isMobile && !feedback && (
          <div className="flex border-t border-zinc-700">
            <button
              onClick={() => setMobileView('problem')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${mobileView === 'problem' ? 'bg-zinc-800 text-zinc-100 border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              📋 문제
            </button>
            <button
              onClick={() => setMobileView('code')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${mobileView === 'code' ? 'bg-zinc-800 text-zinc-100 border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              💻 코드 작성
            </button>
          </div>
        )}
      </header>

      {/* ── 시작 전 화면 ── */}
      {!started && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="space-y-2">
              <div className="text-5xl">💻</div>
              <h2 className="text-xl font-black text-zinc-100">라이브코딩 드릴</h2>
              <p className="text-sm text-zinc-500">카카오페이 1차 면접 — 라이브코딩 파트 시뮬레이션</p>
            </div>
            <div className="bg-zinc-800/60 rounded-xl p-4 text-left space-y-2 border border-zinc-700">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">진행 방식</p>
              <ul className="text-xs text-zinc-400 space-y-1.5">
                <li className="flex items-center gap-2"><span>⏱</span> 제한 시간 <strong className="text-zinc-200">30분</strong></li>
                <li className="flex items-center gap-2"><span>☕</span> 언어 <strong className="text-zinc-200">Java</strong></li>
                <li className="flex items-center gap-2"><span>🔍</span> 웹 검색 · AI 도구 <strong className="text-zinc-200">허용</strong></li>
                <li className="flex items-center gap-2"><span>💡</span> 힌트 1회 가능 <span className="text-zinc-600">(감점 없음)</span></li>
              </ul>
            </div>
            <div className="bg-indigo-950/60 border border-indigo-800/60 rounded-xl p-3.5">
              <p className="text-xs text-indigo-300"><span className="text-indigo-500 font-bold">문제 </span>{problem.title}</p>
            </div>
            <button
              onClick={handleStart}
              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-500 active:scale-[0.98] transition-all"
            >
              ⏱ 타이머 시작 — 코딩 시작
            </button>
          </div>
        </div>
      )}

      {/* ── 메인 코딩 영역 ── */}
      {started && (
        <>
          {/* ══ 모바일 레이아웃 ══ */}
          {isMobile && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* 만료 배너 */}
              {expired && !feedback && (
                <div className="bg-red-950/80 border-b border-red-800 p-2.5 flex items-center gap-2 shrink-0">
                  <span className="text-red-400 animate-pulse">⏰</span>
                  <p className="text-xs font-bold text-red-300">시간 종료! 제출하세요.</p>
                </div>
              )}

              {/* 문제 뷰 */}
              {(mobileView === 'problem' || feedback) && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* 피드백이 있으면 피드백 표시, 없으면 문제 */}
                  {!feedback ? (
                    <>
                      {/* 문제 서브탭 */}
                      <div className="flex gap-1 bg-zinc-800/60 border border-zinc-700 rounded-xl p-1">
                        {(['problem', 'examples', 'constraints'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-indigo-600 text-white' : 'text-zinc-400'}`}
                          >
                            {tab === 'problem' ? '📋 문제' : tab === 'examples' ? '📌 예제' : '📐 제약'}
                          </button>
                        ))}
                      </div>
                      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
                        {activeTab === 'problem' && (
                          <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{problem.description}</pre>
                        )}
                        {activeTab === 'examples' && (
                          <div className="space-y-3">
                            {problem.examples.map((ex, i) => (
                              <div key={i} className="space-y-2">
                                <p className="text-xs font-bold text-zinc-400">예제 {i + 1}</p>
                                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700 space-y-1">
                                  <p className="text-xs text-zinc-400 font-mono">입력: <span className="text-zinc-200">{ex.input}</span></p>
                                  <p className="text-xs text-zinc-400 font-mono">출력: <span className="text-emerald-400">{ex.output}</span></p>
                                  {ex.explanation && <p className="text-xs text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-700">{ex.explanation}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeTab === 'constraints' && (
                          <div className="space-y-2">
                            {problem.constraints.map((c, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
                                <p className="text-xs text-zinc-300 font-mono">{c}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 힌트 */}
                      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-3">
                        {!hint ? (
                          <button onClick={handleHint} disabled={loadingHint} className="w-full text-xs text-amber-400 font-semibold flex items-center justify-center gap-1.5 py-1 disabled:opacity-50">
                            💡 {loadingHint ? '힌트 생성 중...' : '힌트 보기 (1회)'}
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-amber-400">💡 힌트</p>
                            <p className="text-xs text-zinc-300 leading-relaxed">{hint}</p>
                          </div>
                        )}
                      </div>
                      {/* 코드 작성으로 이동 버튼 */}
                      <button
                        onClick={() => setMobileView('code')}
                        className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-600 text-zinc-200 font-bold text-sm hover:bg-zinc-700 transition-colors"
                      >
                        💻 코드 작성하러 가기 →
                      </button>
                    </>
                  ) : (
                    /* 피드백 */
                    <MobileFeedback
                      feedback={feedback}
                      modelSolution={modelSolution}
                      showSolution={showSolution}
                      setShowSolution={setShowSolution}
                      scoreColor={scoreColor}
                    />
                  )}
                </div>
              )}

              {/* 코드 뷰 (모바일) */}
              {mobileView === 'code' && !feedback && (
                <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
                  {/* 에디터 툴바 */}
                  <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-400">☕ Java</span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="w-6 h-6 rounded bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center border border-zinc-700">−</button>
                        <span className="text-[10px] text-zinc-500 w-7 text-center">{fontSize}</span>
                        <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="w-6 h-6 rounded bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center border border-zinc-700">+</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={handleCopy} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {copied ? '✓' : '복사'}
                      </button>
                      <button onClick={() => setEditorFullscreen(true)} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700">⛶</button>
                      <button onClick={() => setCode(problem.starterCode || BOILERPLATE)} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700">↺</button>
                    </div>
                  </div>
                  {/* 에디터 */}
                  <div className="flex-1 rounded-xl overflow-hidden border border-zinc-700 min-h-0" style={{ minHeight: '320px' }}>
                    <MonacoEditor
                      height="100%"
                      language="java"
                      theme="vs-dark"
                      value={code}
                      onChange={v => setCode(v ?? '')}
                      options={{
                        fontSize,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 4,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        renderLineHighlight: 'all',
                        cursorBlinking: 'smooth',
                        bracketPairColorization: { enabled: true },
                        padding: { top: 10, bottom: 10 },
                      }}
                    />
                  </div>
                  {/* 제출 */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !code.trim()}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shrink-0"
                  >
                    {submitting ? (
                      <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Jarvis 평가 중...</>
                    ) : '🚀 제출 — Jarvis 코드 리뷰'}
                  </button>
                </div>
              )}

              {/* 모바일 피드백 후 버튼 */}
              {feedback && (
                <div className="flex gap-2 p-3 border-t border-zinc-800 shrink-0">
                  <Link href="/interview" className="flex-1 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-semibold text-xs text-center">← 면접 홈</Link>
                  <a href="#" onClick={async e => {
                    e.preventDefault();
                    const res = await fetch('/api/interview/live-coding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                    const data = await res.json();
                    window.location.href = `/interview/live-coding/${data.sessionId}`;
                  }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-xs text-center cursor-pointer">
                    다음 문제 →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ══ 데스크탑 레이아웃 ══ */}
          {!isMobile && (
            <div
              ref={containerRef}
              className="flex-1 flex max-w-[1400px] mx-auto w-full px-3 py-3 gap-0 min-h-0"
              style={{ height: 'calc(100vh - 52px)' }}
            >
              {/* 왼쪽: 문제 패널 */}
              <div className="flex flex-col gap-2 pr-2 overflow-hidden" style={{ width: `${leftPct}%`, minWidth: '280px' }}>
                <div className="flex gap-1 bg-zinc-800/60 border border-zinc-700 rounded-xl p-1 shrink-0">
                  {(['problem', 'examples', 'constraints'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {tab === 'problem' ? '📋 문제' : tab === 'examples' ? '📌 예제' : '📐 제약'}
                    </button>
                  ))}
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4 flex-1 overflow-y-auto min-h-0">
                  {activeTab === 'problem' && (
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{problem.description}</pre>
                  )}
                  {activeTab === 'examples' && (
                    <div className="space-y-3">
                      {problem.examples.map((ex, i) => (
                        <div key={i} className="space-y-2">
                          <p className="text-xs font-bold text-zinc-400">예제 {i + 1}</p>
                          <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700 space-y-1">
                            <p className="text-[11px] text-zinc-400 font-mono">입력: <span className="text-zinc-200">{ex.input}</span></p>
                            <p className="text-[11px] text-zinc-400 font-mono">출력: <span className="text-emerald-400">{ex.output}</span></p>
                            {ex.explanation && <p className="text-[11px] text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-700">{ex.explanation}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTab === 'constraints' && (
                    <div className="space-y-2">
                      {problem.constraints.map((c, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
                          <p className="text-xs text-zinc-300 font-mono">{c}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {!feedback && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-3 shrink-0">
                    {!hint ? (
                      <button onClick={handleHint} disabled={loadingHint} className="w-full text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center justify-center gap-1.5 py-1 disabled:opacity-50 transition-colors">
                        💡 {loadingHint ? '힌트 생성 중...' : '힌트 보기 (1회 가능)'}
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">💡 힌트</p>
                        <p className="text-xs text-zinc-300 leading-relaxed">{hint}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 드래그 핸들 */}
              <div
                onMouseDown={onMouseDown}
                className="w-1.5 mx-1 rounded-full bg-zinc-700 hover:bg-indigo-500 cursor-col-resize transition-colors active:bg-indigo-400 shrink-0 self-stretch my-1"
              />

              {/* 오른쪽: 에디터 + 피드백 */}
              <div className="flex flex-col gap-2 pl-1 flex-1 overflow-hidden min-h-0">
                {expired && !feedback && (
                  <div className="bg-red-950/80 border border-red-800 rounded-xl p-2.5 flex items-center gap-2 shrink-0">
                    <span className="text-red-400 animate-pulse">⏰</span>
                    <p className="text-xs font-bold text-red-300">시간 종료! 지금 바로 제출하세요.</p>
                  </div>
                )}

                {!feedback && (
                  <div className="flex flex-col flex-1 gap-2 min-h-0">
                    {/* 에디터 툴바 */}
                    <div className="flex items-center justify-between px-1 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-400">☕ Java</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-[10px] text-zinc-500">Monaco Editor</span>
                        <div className="flex items-center gap-0.5 ml-1">
                          <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center hover:bg-zinc-700 hover:text-zinc-200 transition-colors border border-zinc-700" title="글자 축소">−</button>
                          <span className="text-[10px] text-zinc-500 w-7 text-center tabular-nums">{fontSize}px</span>
                          <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center hover:bg-zinc-700 hover:text-zinc-200 transition-colors border border-zinc-700" title="글자 확대">+</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={handleCopy} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors">
                          {copied ? '✓ 복사됨' : '📋 복사'}
                        </button>
                        <button onClick={() => setEditorFullscreen(true)} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors" title="전체화면">⛶ 전체화면</button>
                        <button onClick={() => setCode(problem.starterCode || BOILERPLATE)} className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-700 transition-colors">↺ 초기화</button>
                      </div>
                    </div>
                    {/* Monaco 에디터 */}
                    <div className="flex-1 rounded-xl overflow-hidden border border-zinc-700 shadow-lg min-h-0">
                      <MonacoEditor
                        height="100%"
                        language="java"
                        theme="vs-dark"
                        value={code}
                        onChange={v => setCode(v ?? '')}
                        options={{
                          fontSize,
                          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          tabSize: 4,
                          wordWrap: 'on',
                          lineNumbers: 'on',
                          renderLineHighlight: 'all',
                          cursorBlinking: 'smooth',
                          smoothScrolling: true,
                          bracketPairColorization: { enabled: true },
                          padding: { top: 12, bottom: 12 },
                        }}
                      />
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !code.trim()}
                      className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 shrink-0"
                    >
                      {submitting ? (
                        <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Jarvis 평가 중...</>
                      ) : '🚀 제출 — Jarvis 코드 리뷰'}
                    </button>
                  </div>
                )}

                {/* 데스크탑 피드백 */}
                {feedback && (
                  <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                    <DesktopFeedback
                      feedback={feedback}
                      modelSolution={modelSolution}
                      showSolution={showSolution}
                      setShowSolution={setShowSolution}
                      scoreColor={scoreColor}
                    />
                    <div className="flex gap-2 pb-4">
                      <Link href="/interview" className="flex-1 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-semibold text-xs text-center hover:bg-zinc-700 transition-colors">← 면접 홈</Link>
                      <a href="#" onClick={async e => {
                        e.preventDefault();
                        const res = await fetch('/api/interview/live-coding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                        const data = await res.json();
                        window.location.href = `/interview/live-coding/${data.sessionId}`;
                      }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-xs text-center hover:bg-indigo-500 transition-colors cursor-pointer">
                        다음 문제 →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 공통 피드백 컴포넌트 ──
function FeedbackContent({
  feedback,
  modelSolution,
  showSolution,
  setShowSolution,
  scoreColor,
}: {
  feedback: Feedback;
  modelSolution: string | null;
  showSolution: boolean;
  setShowSolution: (v: boolean) => void;
  scoreColor: (n: number) => string;
}) {
  return (
    <>
      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${scoreColor(feedback.score)}`}>
        <div className="text-5xl font-black tabular-nums">{feedback.score}</div>
        <div>
          <p className="font-bold text-sm opacity-80">/ 100점</p>
          <p className="text-xs mt-1 opacity-70 leading-relaxed">{feedback.correctness}</p>
        </div>
      </div>
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">시간 복잡도</p>
          <p className="text-sm font-mono font-bold text-zinc-100">{feedback.timeComplexity}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">공간 복잡도</p>
          <p className="text-sm font-mono font-bold text-zinc-100">{feedback.spaceComplexity}</p>
        </div>
      </div>
      {feedback.goodPoints.length > 0 && (
        <div className="bg-emerald-950/50 rounded-xl border border-emerald-800/60 p-4 space-y-2">
          <p className="text-xs font-black text-emerald-400">✅ 잘한 점</p>
          {feedback.goodPoints.map((p, i) => <p key={i} className="text-xs text-emerald-300 flex gap-2"><span className="text-emerald-600 shrink-0">•</span>{p}</p>)}
        </div>
      )}
      {feedback.improvements.length > 0 && (
        <div className="bg-amber-950/50 rounded-xl border border-amber-800/60 p-4 space-y-2">
          <p className="text-xs font-black text-amber-400">⚠️ 개선점</p>
          {feedback.improvements.map((p, i) => <p key={i} className="text-xs text-amber-300 flex gap-2"><span className="text-amber-600 shrink-0">•</span>{p}</p>)}
        </div>
      )}
      {feedback.edgeCases.length > 0 && (
        <div className="bg-red-950/50 rounded-xl border border-red-800/60 p-4 space-y-2">
          <p className="text-xs font-black text-red-400">🚨 놓친 엣지케이스</p>
          {feedback.edgeCases.map((p, i) => <p key={i} className="text-xs text-red-300 flex gap-2"><span className="text-red-600 shrink-0">•</span>{p}</p>)}
        </div>
      )}
      {feedback.interviewerComment && (
        <div className="bg-zinc-800/80 rounded-xl border border-zinc-700 p-4">
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">💬 면접관 코멘트</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{feedback.interviewerComment}</p>
        </div>
      )}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
        <button
          onClick={() => setShowSolution(!showSolution)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
        >
          <span>📖 모범 답안 보기</span>
          <span className="text-zinc-600">{showSolution ? '▲' : '▼'}</span>
        </button>
        {showSolution && modelSolution && (
          <div className="border-t border-zinc-700">
            <pre className="px-4 py-3 text-xs font-mono text-zinc-300 bg-zinc-900 whitespace-pre-wrap overflow-x-auto leading-relaxed">
              {modelSolution}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}

function MobileFeedback(props: Parameters<typeof FeedbackContent>[0]) {
  return <div className="space-y-3"><FeedbackContent {...props} /></div>;
}

function DesktopFeedback(props: Parameters<typeof FeedbackContent>[0]) {
  return <div className="space-y-3"><FeedbackContent {...props} /></div>;
}
