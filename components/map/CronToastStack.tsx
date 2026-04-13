'use client';
import React, { useEffect, useState } from 'react';

type CronEvent = {
  type: 'cron_start' | 'cron_success' | 'cron_failed';
  cronId: string;
  cronName: string;
  timestamp: string;
  message?: string;
};

type Toast = CronEvent & { id: number; bornAt: number };

const MAX_TOASTS = 3;
const FADE_MS = 4000;

const STYLE: Record<CronEvent['type'], { bg: string; border: string; icon: string; label: string }> = {
  cron_start: {
    bg: 'rgba(56, 139, 253, 0.16)',
    border: '#388bfd',
    icon: '▶️',
    label: '시작',
  },
  cron_success: {
    bg: 'rgba(63, 185, 80, 0.16)',
    border: '#3fb950',
    icon: '✅',
    label: '성공',
  },
  cron_failed: {
    bg: 'rgba(248, 81, 73, 0.18)',
    border: '#f85149',
    icon: '❌',
    label: '실패',
  },
};

export default function CronToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 1;
    const es = new EventSource('/api/events');

    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as Partial<CronEvent>;
        if (!data.type || !(data.type in STYLE)) return;
        const ev = data as CronEvent;
        const toast: Toast = { ...ev, id: nextId++, bornAt: Date.now() };
        setToasts(prev => {
          const merged = [...prev, toast];
          return merged.slice(-MAX_TOASTS);
        });
      } catch { /* ignore non-cron events */ }
    };

    es.addEventListener('message', onMessage);
    es.onerror = () => {
      // 연결 끊김 — EventSource가 자동 재연결 시도
    };

    const sweeper = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(t => now - t.bornAt < FADE_MS));
    }, 500);

    return () => {
      es.removeEventListener('message', onMessage);
      es.close();
      clearInterval(sweeper);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 16,
      bottom: 16,
      zIndex: 1300,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const s = STYLE[t.type];
        const age = Date.now() - t.bornAt;
        const alpha = Math.max(0, 1 - age / FADE_MS);
        return (
          <div
            key={t.id}
            style={{
              minWidth: 220,
              maxWidth: 360,
              padding: '10px 14px',
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderLeft: `3px solid ${s.border}`,
              borderRadius: 8,
              color: '#e6edf3',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 12,
              lineHeight: 1.4,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
              opacity: alpha,
              transform: `translateY(${(1 - alpha) * 6}px)`,
              transition: 'opacity 150ms linear, transform 150ms linear',
            }}
          >
            <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 2 }}>
              {s.icon} 크론 {s.label} · {t.timestamp.slice(-8)}
            </div>
            <div style={{ fontWeight: 600 }}>{t.cronName}</div>
            {t.message && (
              <div style={{ marginTop: 2, fontSize: 11, color: '#c9d1d9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.message}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
