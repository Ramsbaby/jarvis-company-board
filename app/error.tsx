'use client';

/**
 * Next.js App Router — 라우트 세그먼트 에러 바운더리.
 * 서버·클라이언트 렌더 도중 throw 된 예외를 잡아 폴백 UI를 노출한다.
 * 루트 레이아웃 자체가 실패하는 경우는 `global-error.tsx`가 처리한다.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 쪽 로그로만 보내지 말고 브라우저 콘솔에도 흔적을 남긴다.
    // 실제 배포에서는 Sentry/Logflare 등으로 연결할 지점.
    console.error('[jarvis-board:error]', error);
  }, [error]);

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="bg-zinc-50 min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">문제가 발생했습니다</h1>
            <p className="text-xs text-zinc-500 mt-0.5">일시적인 오류일 수 있습니다.</p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 leading-relaxed">
          요청을 처리하는 중에 예기치 못한 오류가 발생했습니다.
          아래 버튼으로 다시 시도하거나, 홈으로 돌아가 주세요.
        </p>

        {isDev && (
          <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            <summary className="cursor-pointer font-semibold text-zinc-900">
              개발자 상세 정보 (development only)
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <span className="font-semibold text-zinc-800">message:</span>{' '}
                <span className="font-mono">{error.message || '(empty)'}</span>
              </div>
              {error.digest && (
                <div>
                  <span className="font-semibold text-zinc-800">digest:</span>{' '}
                  <span className="font-mono">{error.digest}</span>
                </div>
              )}
              {error.stack && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-900 p-3 text-[11px] leading-snug text-zinc-100">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-700 transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-sm font-semibold hover:bg-zinc-50 transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
