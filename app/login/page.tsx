'use client';
import { useActionState, useEffect, useState } from 'react';
import { loginAction } from './actions';

const LS_KEY = 'jarvis-saved-pw';

export default function LoginPage() {
  const [error, formAction, isPending] = useActionState(loginAction, null);
  const [savedPw, setSavedPw] = useState<string | null>(null);
  const [autoLogging, setAutoLogging] = useState(false);

  useEffect(() => {
    const pw = localStorage.getItem(LS_KEY);
    if (!pw) return;
    // URL에 ?error 없으면 즉시 자동로그인 (비밀번호 틀릴 때 무한루프 방지)
    const hasError = new URLSearchParams(window.location.search).get('error');
    if (!hasError) {
      const next = new URLSearchParams(window.location.search).get('next') ?? '';
      const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
      window.location.href = `/api/auto-login?key=${encodeURIComponent(pw)}${nextParam}`;
      return; // 리다이렉트 중이므로 state 업데이트 불필요
    }
    // 에러 시에만 savedPw 세팅 (수동 버튼 표시용)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedPw(pw);
  }, []);

  function doAutoLogin(pw: string) {
    setAutoLogging(true);
    const next = new URLSearchParams(window.location.search).get('next') ?? '';
    const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
    window.location.href = `/api/auto-login?key=${encodeURIComponent(pw)}${nextParam}`;
  }

  function clearSaved() {
    localStorage.removeItem(LS_KEY);
    setSavedPw(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const password = (form.querySelector('[name=password]') as HTMLInputElement)?.value;
    const remember = (form.querySelector('[name=remember]') as HTMLInputElement)?.checked;
    if (remember && password) {
      localStorage.setItem(LS_KEY, password);
    } else if (!remember) {
      localStorage.removeItem(LS_KEY);
    }
  }

  const urlError = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('error');

  return (
    <main className="bg-zinc-50 min-h-screen flex items-center justify-center">
      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center font-bold text-lg mx-auto mb-4 text-white">J</div>
          <h1 className="text-xl font-semibold text-zinc-900">Jarvis Board</h1>
          <p className="text-sm text-zinc-500 mt-1">내부 게시판</p>
        </div>

        {/* 자동 로그인 (비밀번호 저장됨) */}
        {savedPw && (
          <div className="mb-5 space-y-2">
            <button
              onClick={() => doAutoLogin(savedPw)}
              disabled={autoLogging}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {autoLogging
                ? <><span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />로그인 중...</>
                : '🔑 자동 로그인'}
            </button>
            {urlError && (
              <p className="text-red-500 text-xs text-center">저장된 비밀번호가 틀렸습니다. 다시 입력해 주세요.</p>
            )}
            <button onClick={clearSaved} className="w-full text-[11px] text-zinc-400 hover:text-red-500 transition-colors text-center">
              자동 로그인 해제
            </button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-2 text-[11px] text-zinc-400">비밀번호로 입장</span></div>
            </div>
          </div>
        )}

        {/* 비밀번호 폼 */}
        <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
          <input type="hidden" name="next" value={typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('next') ?? '') : ''} />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            autoFocus={!savedPw}
            required
            className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 focus:outline-none transition-all"
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="remember"
              defaultChecked={!!savedPw}
              className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-zinc-500">비밀번호 기억하기</span>
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isPending ? '확인 중...' : '입장'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200" /></div>
          <div className="relative flex justify-center text-xs text-zinc-400"><span className="bg-white px-2">또는</span></div>
        </div>

        <a
          href="/api/guest"
          className="block w-full text-center border border-zinc-200 hover:bg-zinc-50 rounded-lg px-4 py-2.5 text-sm text-zinc-600 transition-colors"
        >
          게스트로 둘러보기
        </a>
        <p className="text-center text-xs text-zinc-400 mt-2">읽기 전용 · 댓글 작성 불가</p>
      </div>
    </main>
  );
}
