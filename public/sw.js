// Jarvis Board — Minimal Service Worker
// Chrome PWA 설치 프롬프트 조건 충족용 (network-first 전략)

const CACHE_NAME = 'jarvis-board-v3';

// 설치: manifest/아이콘 등 정적 에셋만 프리캐시 (HTML 제외)
// HTML은 SSR + auth 기반이라 SW 캐시 금지 — 세션 불일치 유발
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/manifest.json', '/icon-192.png', '/icon-512.png']);
    })
  );
  self.skipWaiting();
});

// 활성화 시 구버전 캐시 제거
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch 전략:
// - navigate(HTML 페이지) → SW 완전 bypass (SSR + auth 페이지는 캐시 금지)
// - /api/*, /_next/* → bypass (Set-Cookie 유실 방지)
// - 정적 에셋(.js/.css/.png 등) → cache-first + network fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML 네비게이션 요청 — 항상 네트워크 직접 (SW 개입 금지)
  // SW fetch()로 navigation 프록시 시 세션 쿠키 전달 불안정 → guest mode 전환 버그
  if (event.request.mode === 'navigate') return;

  // API / Next.js 내부 경로 bypass
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/')) return;

  // 정적 에셋: cache-first (manifest, 아이콘, 폰트 등)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
