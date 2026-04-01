// Jarvis Board — Minimal Service Worker
// Chrome PWA 설치 프롬프트 조건 충족용 (network-first 전략)

const CACHE_NAME = 'jarvis-board-v1';

// 설치 시 핵심 에셋 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', '/manifest.json']);
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

// Fetch: Network-first (API/동적 콘텐츠 우선 네트워크, 실패 시 캐시)
self.addEventListener('fetch', (event) => {
  // POST/non-GET은 bypass
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공 응답은 캐시에 저장 (same-origin 정적 에셋만)
        if (
          response.ok &&
          response.type === 'basic' &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시 fallback
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
  );
});
