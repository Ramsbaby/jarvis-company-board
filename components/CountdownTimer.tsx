'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDiscussionWindow } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';

interface CountdownTimerProps {
  expiresAt: string;
  variant?: 'badge' | 'bar' | 'ring' | 'detail' | 'strip' | 'sticky-header';
  className?: string;
  expiredLabel?: string;  // default '토론 종료'
  paused?: boolean;       // shows paused state
  postId?: string;        // enables real-time SSE updates
  postStatus?: string;    // sticky-header: hides when 'resolved'
  postType?: string;      // for correct percentage calculation per type
}

function getTimeInfo(expiresAt: string, postType = 'discussion') {
  const now = Date.now();
  const end = new Date(expiresAt).getTime();
  const diffMs = end - now;
  const totalMs = getDiscussionWindow(postType);

  if (diffMs <= 0) return { expired: true, label: '만료', pct: 0, color: 'expired' as const, min: 0, sec: 0 };

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

export default function CountdownTimer({ expiresAt: initialExpiresAt, variant = 'badge', className = '', expiredLabel, paused: initialPaused, postId, postStatus, postType = 'discussion' }: CountdownTimerProps) {
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [paused, setPaused] = useState(initialPaused ?? false);
  const [info, setInfo] = useState<ReturnType<typeof getTimeInfo>>(() =>
    typeof window === 'undefined'
      ? { expired: false, label: '--:--', pct: 100, color: 'green' as const, min: 0, sec: 0 }
      : getTimeInfo(initialExpiresAt, postType)
  );
  const { subscribe } = useEvent();
  const router = useRouter();
  const refreshedRef = useRef(false);

  // Sync expiresAt when SSR recalculates (e.g. after router.refresh())
  useEffect(() => {
    setExpiresAt(initialExpiresAt);
  }, [initialExpiresAt]);

  // SSE subscription for real-time pause/resume/extend/restart updates
  useEffect(() => {
    if (!postId) return;
    return subscribe((ev) => {
      if (ev.type === 'post_updated' && ev.post_id === postId && ev.data) {
        // Pause/resume state — accept both boolean `paused` and nullable `paused_at`
        if (typeof ev.data.paused === 'boolean') {
          setPaused(ev.data.paused);
        } else if ('paused_at' in ev.data) {
          setPaused(!!ev.data.paused_at);
        }
        // Absolute expires_at — sent by extend, pause/resume, restart routes
        if (typeof ev.data.expires_at === 'string') {
          setExpiresAt(ev.data.expires_at);
        }
      }
    });
  }, [subscribe, postId]);

  useEffect(() => {
    if (paused) return;
    setInfo(getTimeInfo(expiresAt, postType)); // 마운트 시 클라이언트 시간으로 즉시 동기화
    const t = setInterval(() => {
      const next = getTimeInfo(expiresAt, postType);
      setInfo(next);
      // 만료 순간 한 번만 서버 상태 갱신 (postId가 있는 타이머만)
      if (next.expired && !refreshedRef.current && postId) {
        refreshedRef.current = true;
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, paused, postId, router]);

  // Derive remaining seconds for critical threshold
  // eslint-disable-next-line react-hooks/purity
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
      <span suppressHydrationWarning className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${fontWeight} border ${bgColor} ${textColor} ${critical} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        ⏱ {info.label} 남음
      </span>
    );
  }

  /* ── Strip variant (for post cards — visible countdown line) ── */
  if (variant === 'strip') {
    if (paused) {
      return (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold bg-amber-50 border-amber-200 text-amber-700 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
          ⏸ 일시정지
        </div>
      );
    }
    if (info.expired) {
      return (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold bg-red-50 border-red-200 text-red-600 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500 animate-pulse" />
          마감됨 — 결론 대기
        </div>
      );
    }
    const color = isCritical
      ? 'bg-red-50 border-red-200 text-red-700'
      : info.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-emerald-50 border-emerald-200 text-emerald-700';
    const dot = isCritical ? 'bg-red-500 animate-ping' : info.color === 'amber' ? 'bg-amber-400' : 'bg-emerald-500';
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold tabular-nums ${color} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        ⏱ {info.label} 남음
      </div>
    );
  }

  /* ── Detail variant (full-width banner, for post detail content area) ── */
  if (variant === 'detail') {
    if (paused) {
      return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 ${className}`}>
          <span className="text-xl">⏸</span>
          <div>
            <p className="text-xs font-semibold text-amber-700">토론 일시정지</p>
            <p className="text-xs text-amber-500">대표님이 재개하면 계속됩니다</p>
          </div>
        </div>
      );
    }
    if (info.expired) return null;
    const sec = info.sec ?? 0;
    const bgGrad = isCritical
      ? 'bg-gradient-to-r from-red-500 to-rose-600'
      : info.color === 'amber' ? 'bg-gradient-to-r from-amber-500 to-orange-500'
      : 'bg-gradient-to-r from-emerald-500 to-teal-600';
    const radius = 14;
    const circ = 2 * Math.PI * radius;
    const dash = (info.pct / 100) * circ;
    return (
      <div className={`relative flex items-center justify-between px-5 py-3 rounded-xl text-white overflow-hidden ${bgGrad} ${isCritical ? 'animate-pulse' : ''} ${className}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">⏱</span>
          <div>
            <p className="text-[11px] font-medium opacity-80">토론 마감까지</p>
            <p className={`font-bold tabular-nums tracking-tight leading-none ${isCritical ? 'text-3xl' : 'text-2xl'}`}>
              {String(info.min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
            </p>
          </div>
        </div>
        <svg className="w-12 h-12 -rotate-90 opacity-80" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
          <circle cx="18" cy="18" r={radius} fill="none" stroke="white" strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/15">
          <div className="h-full bg-white/50 transition-all duration-1000" style={{ width: `${info.pct}%` }} />
        </div>
      </div>
    );
  }

  /* ── Sticky-header variant (fixed sub-header bar under main nav) ── */
  if (variant === 'sticky-header') {
    if (postStatus === 'resolved') return null;

    const expired = info.expired;
    const pct     = expired ? 0 : info.pct;
    const min     = info.min ?? 0;
    const sec     = info.sec ?? 0;
    const diffMs  = (min * 60 + sec) * 1000;
    const urgent  = !expired && diffMs < 5 * 60 * 1000;
    const warning = !expired && diffMs < 10 * 60 * 1000;

    if (paused) {
      return (
        <div className={`z-30 border-t border-amber-200 bg-amber-50 ${className}`}>
          <div className="max-w-5xl mx-auto px-4 py-1.5 flex items-center gap-2 text-xs text-amber-700 font-medium">
            <span>⏸</span>
            <span>토론 일시정지 — {expired ? '마감' : `${min}분 ${String(sec).padStart(2, '0')}초 남음`} (정지됨)</span>
            <div className="ml-auto h-1 w-20 bg-amber-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      );
    }

    const barColor = expired || urgent ? 'bg-red-500' : warning ? 'bg-amber-400' : 'bg-emerald-500';
    const rowBg    = expired ? 'bg-red-50 border-red-200' : urgent ? 'bg-red-50/80 border-red-100' : warning ? 'bg-amber-50/80 border-amber-100' : 'bg-emerald-50/50 border-emerald-100';
    const textCls  = expired || urgent ? 'text-red-700' : warning ? 'text-amber-700' : 'text-emerald-700';
    const dotCls   = expired || urgent ? 'bg-red-500 animate-pulse' : warning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500';

    return (
      <div className={`z-30 border-t ${rowBg} ${className}`}>
        <div className={`max-w-5xl mx-auto px-4 py-1.5 flex items-center gap-3 text-xs font-semibold tabular-nums ${textCls}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
          {expired
            ? <span>토론 마감</span>
            : <span suppressHydrationWarning>
                <span className="hidden sm:inline">토론 마감까지 </span>
                <strong suppressHydrationWarning className={`tabular-nums ${urgent ? 'text-base sm:text-lg' : ''}`}>{min}분 {String(sec).padStart(2, '0')}초</strong>
                <span className="hidden sm:inline"> 남음</span>
              </span>
          }
          <div className="hidden sm:block ml-auto h-1.5 w-24 bg-white/70 rounded-full overflow-hidden border border-black/5 flex-shrink-0">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${barColor} ${urgent ? 'animate-pulse' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
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
