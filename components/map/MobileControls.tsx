'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Mobile D-pad + Help button
   Extracted from app/company/VirtualOffice.tsx
   ═══════════════════════════════════════════════════════════════════ */
import React from 'react';

interface MobileControlsProps {
  isMobile: boolean;
  popupOpen: boolean;
  cronGridOpen: boolean;
  keysRef: React.MutableRefObject<Set<string>>;
  showMobileHelp: boolean;
  setShowMobileHelp: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function MobileControls({
  isMobile, popupOpen, cronGridOpen, keysRef,
  showMobileHelp, setShowMobileHelp,
}: MobileControlsProps) {
  return (
    <>
      {/* ── Mobile D-pad ── */}
      {isMobile && !popupOpen && !cronGridOpen && (() => {
        const btnBase: React.CSSProperties = {
          width: 56, height: 56,
          background: 'rgba(22,27,34,0.88)',
          border: '1.5px solid rgba(255,255,255,0.14)',
          borderRadius: 14,
          color: '#e6edf3',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
          flexShrink: 0,
          pointerEvents: 'auto', // 버튼만 이벤트 수신 (컨테이너는 none)
        };
        const makeBtn = (label: string, key: string) => (
          <button
            style={btnBase}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); keysRef.current.add(key); }}
            onPointerUp={() => keysRef.current.delete(key)}
            onPointerLeave={() => keysRef.current.delete(key)}
            onPointerCancel={() => keysRef.current.delete(key)}
          >{label}</button>
        );
        return (
          <div style={{
            position: 'fixed', bottom: 24, left: 16, zIndex: 600,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            touchAction: 'none',
            pointerEvents: 'none', // 컨테이너는 투명 — 버튼만 이벤트 수신, 캔버스 터치 통과
          }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {makeBtn('▲', 'ArrowUp')}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {makeBtn('◀', 'ArrowLeft')}
              <div style={{ width: 56, height: 56, background: 'rgba(22,27,34,0.4)', borderRadius: 14 }} />
              {makeBtn('▶', 'ArrowRight')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {makeBtn('▼', 'ArrowDown')}
            </div>
          </div>
        );
      })()}

      {/* Mobile floating help button */}
      {isMobile && !popupOpen && (
        <>
          <button
            onClick={() => setShowMobileHelp(prev => !prev)}
            style={{
              position: 'fixed', bottom: 24, right: 16, zIndex: 600,
              width: 44, height: 44, borderRadius: '50%',
              background: '#21262d', border: '1px solid #30363d',
              color: '#8b949e', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >?</button>
          {showMobileHelp && (
            <div style={{
              position: 'fixed', bottom: 76, right: 16, zIndex: 600,
              background: 'rgba(22,27,34,0.95)', border: '1px solid #30363d',
              borderRadius: 12, padding: '14px 18px', maxWidth: 220,
              color: '#c9d1d9', fontSize: 12, fontFamily: 'monospace',
              lineHeight: 1.8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>조작 방법</div>
              <div>{'\u25C0\u25B2\u25B6\u25BC'} 버튼으로 이동</div>
              <div>방 탭 → 대화 시작</div>
              <div>NPC 탭 → 대화 가능</div>
              <div>팝업 바깥 탭 → 닫기</div>
            </div>
          )}
        </>
      )}
    </>
  );
}
