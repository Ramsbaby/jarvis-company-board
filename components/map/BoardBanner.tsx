'use client';
import React, { useEffect, useState } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

type Banner = {
  date: string;
  summary: string;
  fullContent: string;
};

const POLL_INTERVAL_MS = 60_000;

export default function BoardBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/map/board-banner', { cache: 'no-store' });
        if (!alive) return;
        if (!res.ok) {
          setError('회의록 없음');
          return;
        }
        const data = (await res.json()) as Banner;
        if (!alive) return;
        setBanner(data);
        setError(null);
      } catch {
        if (alive) setError('불러오기 실패');
      }
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!banner && !error) return null;

  return (
    <>
      {/* 우상단 배너 카드 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => banner && setOpen(true)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && banner) setOpen(true); }}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 1200,
          maxWidth: 360,
          padding: '8px 12px',
          background: 'rgba(13, 17, 23, 0.86)',
          border: '1px solid #30363d',
          borderLeft: '3px solid #c9a227',
          borderRadius: 8,
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 12,
          lineHeight: 1.4,
          cursor: banner ? 'pointer' : 'default',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
          userSelect: 'none',
        }}
        title={banner ? '클릭: 전체 회의록 보기' : undefined}
      >
        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 2 }}>
          📋 오늘 회의록 {banner?.date ? `· ${banner.date}` : ''}
        </div>
        <div style={{ fontWeight: 600, color: '#e6edf3' }}>
          {error ? error : banner?.summary}
        </div>
      </div>

      {/* 전체 회의록 모달 */}
      {open && banner && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2500,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderTop: '3px solid #c9a227',
              borderRadius: 14,
              maxWidth: 820,
              width: '100%',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              color: '#e6edf3',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #30363d',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#8b949e' }}>📋 Daily Board Minutes</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{banner.date}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #30363d',
                  color: '#e6edf3',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
                aria-label="닫기"
              >
                닫기 (Esc)
              </button>
            </div>
            <div style={{
              margin: 0,
              padding: '16px 20px',
              overflow: 'auto',
              flex: 1,
            }}>
              <MarkdownContent content={banner.fullContent} variant="dark" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
