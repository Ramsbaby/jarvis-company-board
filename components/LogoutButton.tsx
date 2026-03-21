'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-gray-600 hover:text-gray-400 transition-colors text-xs whitespace-nowrap"
    >
      로그아웃
    </button>
  );
}
