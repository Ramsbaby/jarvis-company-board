'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Cron Center full-screen grid popup
   Extracted from app/company/VirtualOffice.tsx
   IntersectionObserver 기반 가상 스크롤 (200px rootMargin)
   ═══════════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef, useState } from 'react';
import type { CronItem } from '@/lib/map/rooms';

export type CronFilter = 'all' | 'success' | 'failed' | 'other';

interface CronGridPopupProps {
  cronData: CronItem[];
  cronFilter: CronFilter;
  setCronFilter: React.Dispatch<React.SetStateAction<CronFilter>>;
  cronSearch: string;
  setCronSearch: React.Dispatch<React.SetStateAction<string>>;
  isMobile: boolean;
  closePopup: () => void;
  setCronPopup: React.Dispatch<React.SetStateAction<CronItem | null>>;
  setCronGridOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const CARD_HEIGHT = 78; // 고정 카드 높이(px) — 가상화 placeholder 용

function useInView(ref: React.RefObject<HTMLDivElement | null>, rootMargin = '200px') {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

interface CronCardProps {
  cron: CronItem;
  onOpen: (c: CronItem) => void;
}

const NOISE = ['데이터 수집중', '수집 중', '수집중', '시작합니다', '준비 중', 'START', '처리 중', '진행 중'];

function CronCard({ cron, onOpen }: CronCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);

  const sc =
    cron.status === 'success' ? '#22c55e'
    : cron.status === 'failed' ? '#f85149'
    : cron.status === 'running' ? '#58a6ff'
    : cron.status === 'skipped' ? '#d29922' : '#4b5563';
  const msg = NOISE.some(p => (cron.lastMessage || '').includes(p)) ? '' : (cron.lastMessage || '');

  if (!inView) {
    return (
      <div
        ref={ref}
        style={{
          height: CARD_HEIGHT,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      onClick={() => onOpen(cron)}
      style={{
        height: CARD_HEIGHT,
        padding: '13px 15px',
        boxSizing: 'border-box',
        background: `linear-gradient(135deg, ${sc}0d 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${sc}28`,
        borderLeft: `3px solid ${sc}cc`,
        borderRadius: 12,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: sc,
            flexShrink: 0,
            boxShadow: `0 0 5px ${sc}80`,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#dde4f0',
          }}
        >
          {cron.name}
        </span>
        <span style={{ fontSize: 13 }}>{cron.teamEmoji}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#5a6480',
          fontFamily: 'monospace',
          marginBottom: msg ? 4 : 0,
        }}
      >
        {cron.scheduleHuman || cron.schedule || '—'}
      </div>
      {msg && (
        <div
          style={{
            fontSize: 10,
            color: '#4a5370',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {msg.slice(0, 80)}
        </div>
      )}
    </div>
  );
}

export default function CronGridPopup({
  cronData, cronFilter, setCronFilter, cronSearch, setCronSearch,
  isMobile, closePopup, setCronPopup, setCronGridOpen, setPopupOpen,
}: CronGridPopupProps) {
  const filtered = cronData.filter(c => {
    const matchFilter = cronFilter === 'all' ? true
      : cronFilter === 'success' ? c.status === 'success'
      : cronFilter === 'failed' ? c.status === 'failed'
      : c.status === 'skipped' || c.status === 'unknown' || c.status === 'running';
    const matchSearch =
      !cronSearch ||
      c.name.toLowerCase().includes(cronSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(cronSearch.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: cronData.length,
    success: cronData.filter(c => c.status === 'success').length,
    failed: cronData.filter(c => c.status === 'failed').length,
    other: cronData.filter(c => c.status === 'skipped' || c.status === 'unknown' || c.status === 'running').length,
  };

  const tabs: Array<{ key: CronFilter; label: string; color: string }> = [
    { key: 'all',     label: `전체 ${counts.all}`,      color: '#8b949e' },
    { key: 'success', label: `✅ 성공 ${counts.success}`, color: '#22c55e' },
    { key: 'failed',  label: `❌ 실패 ${counts.failed}`,  color: '#f85149' },
    { key: 'other',   label: `기타 ${counts.other}`,     color: '#d29922' },
  ];

  const handleOpen = (c: CronItem) => {
    setCronPopup(c);
    setCronGridOpen(false);
    setPopupOpen(true);
  };

  return (
    <div
      onClick={closePopup}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(4,6,18,0.93)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(160deg, #0e1225 0%, #0a0e1c 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: isMobile ? '16px 16px 0 0' : 16,
          width: '100%',
          maxWidth: isMobile ? '100%' : 860,
          height: isMobile ? '92vh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e6edf3',
          fontFamily: '-apple-system, sans-serif',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.02), 0 32px 100px rgba(0,0,0,0.95)',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '20px 22px 0',
            background:
              'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.03) 60%, transparent 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, #6366f1aa, #6366f140, transparent)',
              borderRadius: isMobile ? '20px 20px 0 0' : '16px 16px 0 0',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>⏰ 크론 센터</div>
              <div style={{ fontSize: 11, color: '#5a6480', marginTop: 3 }}>
                전사 크론잡 {cronData.length}개 실시간 모니터링
              </div>
            </div>
            <button
              onClick={closePopup}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.11)',
                color: '#8094b0',
                fontSize: 15,
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* 검색 */}
          <input
            type="text"
            placeholder="크론 검색..."
            value={cronSearch}
            onChange={e => setCronSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#e6edf3',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* 필터 탭 */}
          <div style={{ display: 'flex', gap: 4, marginBottom: -1 }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setCronFilter(tab.key)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '8px 8px 0 0',
                  background: cronFilter === tab.key ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: cronFilter === tab.key ? tab.color : '#6b7280',
                  fontSize: 12,
                  fontWeight: cronFilter === tab.key ? 700 : 400,
                  cursor: 'pointer',
                  borderBottom:
                    cronFilter === tab.key
                      ? `2px solid ${tab.color}`
                      : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 목록 — 가상화 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 40, fontSize: 14 }}>
              결과 없음
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                gap: 8,
              }}
            >
              {filtered.map(c => (
                <CronCard key={c.id} cron={c} onOpen={handleOpen} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
