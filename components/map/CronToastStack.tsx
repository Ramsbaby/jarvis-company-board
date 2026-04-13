'use client';
import React, { useEffect, useRef, useState } from 'react';

type CronEvent = {
  type: 'cron_start' | 'cron_success' | 'cron_failed';
  cronId: string;
  cronName: string;
  timestamp: string;
  message?: string;
};

type Toast = CronEvent & { id: number; phase: 'enter' | 'stay' | 'leave' };

const MAX_TOASTS = 3;
const STAY_MS = 3500;       // 전체 표시 유지 시간
const FADE_MS = 450;        // CSS 트랜지션 시간

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

interface CronToastStackProps {
  isMobile?: boolean;
}

/**
 * CSS 트랜지션 기반 토스트 — React가 매 프레임 렌더하지 않음.
 * 각 토스트는 3단계 phase 전이:
 *  1. enter(mount) → 즉시 stay (0ms 후 setState)
 *  2. stay → STAY_MS 후 leave 전이
 *  3. leave → FADE_MS 후 unmount
 */
export default function CronToastStack({ isMobile = false }: CronToastStackProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, number[]>>(new Map());
  const nextId = useRef(1);

  useEffect(() => {
    const es = new EventSource('/api/events');

    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as Partial<CronEvent>;
        if (!data.type || !(data.type in STYLE)) return;
        const ev = data as CronEvent;
        const id = nextId.current++;
        const toast: Toast = { ...ev, id, phase: 'enter' };

        setToasts(prev => {
          const next = [toast, ...prev].slice(0, MAX_TOASTS);
          return next;
        });

        // enter → stay (한 프레임 뒤)
        const t1 = window.setTimeout(() => {
          setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'stay' } : t));
        }, 16);

        // stay → leave
        const t2 = window.setTimeout(() => {
          setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'leave' } : t));
        }, STAY_MS);

        // leave → unmount
        const t3 = window.setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
          timers.current.delete(id);
        }, STAY_MS + FADE_MS);

        timers.current.set(id, [t1, t2, t3]);
      } catch { /* ignore non-cron events */ }
    };

    es.addEventListener('message', onMessage);
    es.onerror = () => {
      // EventSource 자동 재연결
    };

    return () => {
      es.removeEventListener('message', onMessage);
      es.close();
      timers.current.forEach(ids => ids.forEach(i => window.clearTimeout(i)));
      timers.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  // 모바일: 상단 중앙, 데스크톱: 좌하단
  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        width: 'calc(100vw - 32px)',
        maxWidth: 360,
      }
    : {
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        pointerEvents: 'none',
      };

  return (
    <div style={containerStyle}>
      {toasts.map(t => {
        const s = STYLE[t.type];
        const visible = t.phase === 'stay';
        const slideDir = isMobile ? 'translateY(-12px)' : 'translateX(-12px)';
        const slideReset = isMobile ? 'translateY(0)' : 'translateX(0)';
        return (
          <div
            key={t.id}
            style={{
              padding: '10px 14px',
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderLeft: `3px solid ${s.border}`,
              borderRadius: 10,
              color: '#e6edf3',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 12,
              lineHeight: 1.4,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              opacity: visible ? 1 : 0,
              transform: visible ? slideReset : slideDir,
              transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
              willChange: 'opacity, transform',
            }}
          >
            <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{s.icon}</span>
              <span>크론 {s.label}</span>
              <span style={{ color: '#4b5563' }}>·</span>
              <span style={{ fontFamily: 'monospace' }}>{t.timestamp.slice(-8)}</span>
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
