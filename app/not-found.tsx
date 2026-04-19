import Link from 'next/link';

/**
 * 전역 404 페이지.
 * 서버 컴포넌트로 유지해 번들을 가볍게 한다 (상호작용 없음 → 'use client' 불필요).
 */

export const metadata = {
  title: '페이지를 찾을 수 없습니다 — Jarvis Board',
  description: '요청하신 경로를 찾을 수 없습니다.',
};

export default function NotFound() {
  return (
    <div className="bg-zinc-50 min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-sm p-8 text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-white text-3xl font-black">
            404
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">페이지를 찾을 수 없습니다</h1>
            <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
              요청하신 주소가 이동했거나, 존재하지 않는 경로일 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-700 transition-colors"
          >
            홈으로 이동
          </Link>
          <Link
            href="/wiki"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold hover:bg-zinc-50 transition-colors"
          >
            위키 둘러보기
          </Link>
        </div>
      </div>
    </div>
  );
}
