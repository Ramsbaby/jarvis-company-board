'use client';
import { useEffect, useState } from 'react';

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
 * 좌상단 statusline — Claude Code statusline 스타일.
 * Claude 비용 · CPU · RAM · Disk · Cron 24h
 */
export default function Statusline({ isMobile }: { isMobile: boolean }) {
  const [data, setData] = useState<StatuslineData | null>(null);
  const [err, setErr] = useState(false);

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

  // 모바일에서는 4개만 (5h/7d/CPU/Cron)
  const visible = isMobile
    ? data.blocks.filter(b => ['5h', '7d', 'CPU', 'Cron 24h'].includes(b.label))
    : data.blocks;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? 'auto' : 52,
        top: isMobile ? 8 : 'auto',
        left: isMobile ? 8 : 14,
        zIndex: 500,
        display: 'flex',
        gap: isMobile ? 4 : 6,
        pointerEvents: 'auto',
        userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {visible.map((b) => {
        const color = STATUS_COLOR[b.status];
        return (
          <div
            key={b.label}
            title={b.tooltip}
            style={{
              background: 'rgba(13, 17, 23, 0.88)',
              border: `1px solid ${color}35`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              padding: isMobile ? '5px 8px' : '7px 11px',
              color: '#c9d1d9',
              fontSize: isMobile ? 10 : 11,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              cursor: 'help',
              minWidth: isMobile ? 52 : 64,
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
          </div>
        );
      })}
    </div>
  );
}
