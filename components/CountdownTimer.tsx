'use client';
import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  expiresAt: string;
  variant?: 'badge' | 'bar' | 'ring';
  className?: string;
  expiredLabel?: string;  // default '토론 종료'
  paused?: boolean;       // shows paused state
}

function getTimeInfo(expiresAt: string) {
  const now = Date.now();
  const end = new Date(expiresAt).getTime();
  const diffMs = end - now;
  const totalMs = 30 * 60 * 1000; // 30 minutes

  if (diffMs <= 0) return { expired: true, label: '만료', pct: 0, color: 'expired' as const };

  const totalSec = Math.floor(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const label = `${min}분 ${String(sec).padStart(2, '0')}초`;
  const pct = Math.min(100, (diffMs / totalMs) * 100);
  const color: 'green' | 'amber' | 'red' =
    diffMs > 10 * 60 * 1000 ? 'green' :
    diffMs > 5 * 60 * 1000 ? 'amber' : 'red';

  return { expired: false, label, pct, color, min, sec };
}

export default function CountdownTimer({ expiresAt, variant = 'badge', className = '', expiredLabel, paused }: CountdownTimerProps) {
  const [info, setInfo] = useState(() => getTimeInfo(expiresAt));

  useEffect(() => {
    const t = setInterval(() => setInfo(getTimeInfo(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // Derive remaining seconds for critical threshold
  const remaining = info.expired ? 0 : Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  const isCritical = remaining > 0 && remaining < 60;

  /* ── Badge variant (default, for post detail) ── */
  if (variant === 'badge') {
    if (paused) {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-600 ${className}`}>
          <span>⏸</span> 일시정지
        </span>
      );
    }
    if (info.expired) {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-400 border border-gray-200 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          {expiredLabel ?? '토론 종료'}
        </span>
      );
    }
    const dotColor = isCritical ? 'bg-red-500 animate-pulse' : info.color === 'green' ? 'bg-emerald-500' : info.color === 'amber' ? 'bg-amber-500' : 'bg-red-500';
    const textColor = isCritical ? 'text-red-700' : info.color === 'green' ? 'text-emerald-700' : info.color === 'amber' ? 'text-amber-700' : 'text-red-700';
    const bgColor = isCritical
      ? 'bg-red-50 border-red-300'
      : info.color === 'green' ? 'bg-emerald-50 border-emerald-200' : info.color === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
    const critical = isCritical ? 'animate-countdown-critical' : '';
    // Red state (< 5min): font-bold for more impact
    const fontWeight = info.color === 'red' ? 'font-bold' : 'font-medium';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${fontWeight} border ${bgColor} ${textColor} ${critical} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        ⏱ {info.label} 남음
      </span>
    );
  }

  /* ── Bar variant (for post cards — 4px bar at card bottom) ── */
  if (variant === 'bar') {
    if (paused) {
      return (
        <div className={`w-full rounded-b-xl overflow-hidden ${className}`} style={{ height: '4px' }}>
          <div
            className="bg-amber-200"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      );
    }
    const barClass = info.expired ? 'countdown-bar countdown-bar-expired' :
      isCritical ? 'countdown-bar' :
      info.color === 'green' ? 'countdown-bar countdown-bar-green' :
      info.color === 'amber' ? 'countdown-bar countdown-bar-amber' :
      'countdown-bar countdown-bar-red';
    const criticalBarStyle = isCritical ? { background: '#ef4444' } : {};
    return (
      <div className={`w-full bg-gray-100 rounded-b-xl overflow-hidden ${className}`} style={{ height: '4px' }}>
        <div
          className={`${barClass} ${isCritical ? 'animate-countdown-critical' : ''}`}
          style={{ width: info.expired ? '100%' : `${info.pct}%`, height: '100%', transition: 'width 1s linear', ...criticalBarStyle }}
        />
      </div>
    );
  }

  /* ── Ring variant (for post detail header) ── */
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const strokeDash = info.expired ? circ : (info.pct / 100) * circ;
  const strokeColor = info.expired ? '#d1d5db' :
    isCritical ? '#ef4444' :
    info.color === 'green' ? '#10b981' :
    info.color === 'amber' ? '#f59e0b' : '#ef4444';
  const glow = isCritical
    ? 'drop-shadow(0 0 4px #ef4444)'
    : (!info.expired && info.color === 'red' ? 'drop-shadow(0 0 6px #ef4444)' : 'none');

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="44" cy="44" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circ}`}
            style={{ transition: 'stroke-dasharray 1s linear', filter: glow }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {info.expired ? (
            <span className="text-gray-400 text-xs font-medium">만료</span>
          ) : (
            <>
              <span className="text-gray-900 font-bold text-lg leading-none">{info.min}</span>
              <span className="text-gray-400 text-[10px]">분</span>
            </>
          )}
        </div>
      </div>
      {!info.expired && (
        <span className="text-xs text-gray-500">{info.label}</span>
      )}
    </div>
  );
}
