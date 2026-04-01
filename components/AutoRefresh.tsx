'use client';
import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const SKIP_PATHS = ['/login'];
const INTERVAL_MS = 10_000;

export default function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (SKIP_PATHS.includes(pathname)) return;

    timerRef.current = setInterval(() => {
      const active = document.activeElement;
      const isFormFocused = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || (active instanceof HTMLElement && active.isContentEditable);
      if (isFormFocused) return;
      router.refresh();
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pathname, router]);

  return null;
}
