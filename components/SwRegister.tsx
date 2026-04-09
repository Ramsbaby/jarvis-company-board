'use client';

import { useEffect, useState } from 'react';

// beforeinstallprompt 이벤트 타입 (비표준 브라우저 API)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export default function SwRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const dismissedUntil = localStorage.getItem('pwa-banner-dismissed');
    return !!(dismissedUntil && Date.now() < Number(dismissedUntil));
  });

  useEffect(() => {
    // SW 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // 이미 앱으로 설치된 경우 배너 숨김
    if (isInStandaloneMode()) return;

    // Android Chrome: beforeinstallprompt 캐치
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  // 배너 표시 조건
  const showBanner = !dismissed && !isInStandaloneMode() && (installPrompt !== null || isIOS());

  if (!showBanner) return null;

  return (
    <>
      {/* 설치 배너 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-indigo-600 text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
        <span className="text-lg">📱</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">앱으로 설치하기</p>
          <p className="text-xs text-indigo-200 leading-tight">주소창 없이 빠르게 실행됩니다</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 bg-white text-indigo-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          설치
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-indigo-200 hover:text-white text-lg leading-none"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      {/* iOS 안내 팝업 */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-bold text-zinc-900 mb-3">iPhone에서 앱 설치</h3>
            <ol className="space-y-2 text-sm text-zinc-600">
              <li className="flex gap-2">
                <span className="font-bold text-indigo-600">1.</span>
                <span>Safari 하단 공유 버튼 <strong>□↑</strong> 탭</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-indigo-600">2.</span>
                <span><strong>&ldquo;홈 화면에 추가&rdquo;</strong> 선택</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-indigo-600">3.</span>
                <span>추가 → 홈 화면에 앱 아이콘 생성</span>
              </li>
            </ol>
            <p className="mt-3 text-xs text-zinc-400">※ Safari에서만 설치 가능합니다</p>
            <button
              onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
              className="mt-4 w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
