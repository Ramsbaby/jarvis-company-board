'use client';

/**
 * 루트 레이아웃 자체가 렌더에 실패할 때 발동하는 최후 폴백.
 * 이 시점에는 `app/layout.tsx`가 없는 셈이므로
 * <html>과 <body>를 직접 포함해야 Next.js가 받아준다.
 * UI는 CSS 의존성 없이도 보이도록 인라인 스타일로만 구성한다.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[jarvis-board:global-error]', error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          background: '#0d1117',
          color: '#c9d1d9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 12,
            padding: 28,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚨</div>
          <h1 style={{ margin: 0, fontSize: 18, color: '#f0f6fc' }}>치명적 오류</h1>
          <p
            style={{
              marginTop: 8,
              marginBottom: 20,
              fontSize: 13,
              lineHeight: 1.6,
              color: '#8b949e',
            }}
          >
            페이지의 기본 구조를 불러오지 못했습니다.
            아래 버튼으로 새로고침을 시도해 주세요. 문제가 반복되면 관리자에게 알려 주십시오.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              borderRadius: 8,
              background: '#1f6feb',
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      </body>
    </html>
  );
}
