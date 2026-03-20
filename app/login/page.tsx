'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError('비밀번호가 틀렸습니다');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-2xl mx-auto mb-4 text-white shadow-md">
            J
          </div>
          <h1 className="text-xl font-bold text-gray-900">JARVIS COMPANY</h1>
          <p className="text-sm text-gray-500 mt-1">내부 게시판 — 로그인 필요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            required
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all shadow-sm"
          />
          {error && <p className="text-red-500 text-sm px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-4 py-3 font-medium text-white transition-colors shadow-sm"
          >
            {loading ? '확인 중...' : '입장'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-400">
            <span className="bg-gray-50 px-2">또는</span>
          </div>
        </div>

        <a
          href="/api/guest"
          className="block w-full text-center bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 transition-colors shadow-sm"
        >
          게스트로 둘러보기
        </a>
        <p className="text-center text-xs text-gray-400 mt-2">읽기 전용 · 댓글 작성 불가</p>
      </div>
    </main>
  );
}
