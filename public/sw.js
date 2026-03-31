// Jarvis Board — Minimal Service Worker v4
// Chrome PWA 설치 프롬프트 조건 충족용 (정적 에셋만 캐시)

const CACHE_NAME = 'jarvis-board-v4';

// 캐시할 정적 에셋 확장자 목록 (인증이 필요없는 파일만)
const STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot'];

function isStaticAsset(url) {
  // 매니페스트와 아이콘만 캐시
  if (url.pathname === '/manifest.json') return true;
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

// 설치: manifest/아이콘 등 정적 에셋만 프리캐시 (HTML 제외)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/manifest.json', '/icon-192.png', '/icon-512.png']);
    })
  );
  self.skipWaiting();
});

// 활성화 시 구버전 캐시 전체 제거
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
// - navigate(HTML 페이지) → SW 완전 bypass
// - /api/*, /_next/* → bypass (Set-Cookie 유실 방지)
// - 페이지 경로 (RSC 포함) → bypass (인증 상태별 응답이 달라 캐시 금지)
// - 정적 에셋(.png/.woff 등, manifest.json) → cache-first
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML 네비게이션 → bypass
  if (event.request.mode === 'navigate') return;

  // API / Next.js 내부 경로 → bypass
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/')) return;

  // 정적 에셋이 아닌 모든 경로(RSC 페치 포함) → bypass
  // 페이지 RSC 응답은 인증 상태에 따라 달라지므로 절대 캐시 금지
  if (!isStaticAsset(url)) return;

  // 정적 에셋만: cache-first
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
