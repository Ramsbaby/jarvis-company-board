'use client';
import { useEffect, useState } from 'react';
import MetricDetailModal, { metricTypeFromLabel, type MetricType } from './MetricDetailModal';

interface StatuslineBlock {
  label: string;
  icon: string;
  value: string;
  raw: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  tooltip: string;
}

interface StatuslineData {
  blocks: StatuslineBlock[];
  updatedAt: string;
}

const REFRESH_MS = 15_000;

const STATUS_COLOR = {
  GREEN: '#3fb950',
  YELLOW: '#d29922',
  RED: '#f85149',
};

/**
 * 좌상단 statusline — 클릭 시 MetricDetailModal 풀모달을 띄운다.
 * 맵 상단을 가리지 않도록 top 위치는 BoardBanner 아래(60px)로 내림.
 */
export default function Statusline({ isMobile }: { isMobile: boolean }) {
  const [data, setData] = useState<StatuslineData | null>(null);
  const [err, setErr] = useState(false);
  const [activeMetric, setActiveMetric] = useState<{ block: StatuslineBlock; type: MetricType } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/map/statusline', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StatuslineData;
        if (!cancelled) {
          setData(json);
          setErr(false);
        }
      } catch {
        if (!cancelled) setErr(true);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (err || !data) return null;

  const visible = isMobile
    ? data.blocks.filter(b => ['5h', '7d', 'CPU', 'Cron 24h'].includes(b.label))
    : data.blocks;

  const handleBlockClick = (b: StatuslineBlock) => {
    const type = metricTypeFromLabel(b.label);
    if (type) setActiveMetric({ block: b, type });
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          // 맵 상단 UI(Board banner, 방 타일) 가리지 않도록 y 를 내림
          top: isMobile ? 36 : 60,
          left: isMobile ? 6 : 14,
          zIndex: 500,
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: isMobile ? 4 : 6,
          maxWidth: isMobile ? 'calc(100vw - 12px)' : 640,
          pointerEvents: 'auto',
          userSelect: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {visible.map((b) => {
          const color = STATUS_COLOR[b.status];
          return (
            <button
              key={b.label}
              onClick={() => handleBlockClick(b)}
              title={b.tooltip}
              style={{
                all: 'unset',
                background: 'rgba(13, 17, 23, 0.88)',
                border: `1px solid ${color}35`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 8,
                padding: isMobile ? '5px 8px' : '7px 11px',
                color: '#c9d1d9',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
                display: 'flex',
                flexDirection: 'column' as const,
                gap: 2,
                cursor: 'pointer',
                minWidth: isMobile ? 52 : 64,
                transition: 'transform 0.12s, border-color 0.15s',
                boxSizing: 'border-box' as const,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}35`;
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: isMobile ? 10 : 11 }}>{b.icon}</span>
                <span style={{ color: '#6e7681', fontSize: isMobile ? 8 : 9, fontWeight: 600, letterSpacing: 0.3 }}>
                  {b.label}
                </span>
              </div>
              <div
                style={{
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 800,
                  color,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: -0.2,
                }}
              >
                {b.value}
              </div>
            </button>
          );
        })}
      </div>

      {/* 풀모달 — 지도 UI 가림 문제 해소 */}
      {activeMetric && (
        <MetricDetailModal
          metric={{
            label: activeMetric.block.label,
            value: activeMetric.block.raw,
            color: STATUS_COLOR[activeMetric.block.status],
            icon: activeMetric.block.icon,
            type: activeMetric.type,
            tooltip: activeMetric.block.tooltip,
          }}
          briefingSummary=""
          onClose={() => setActiveMetric(null)}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
