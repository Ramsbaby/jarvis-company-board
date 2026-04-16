'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Cron detail popup (tile click)
   Extracted from app/company/VirtualOffice.tsx
   ═══════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import type { CronItem } from '@/lib/map/rooms';
import { detectTokenUsage, estimateCost, inferCronRole, inferSuggestedFix } from '@/lib/map/cron-role';
import { getCronDeepInfo, filterCeoActionsForStatus, type CeoAction } from '@/lib/map/cron-encyclopedia';

interface CronDetailPopupProps {
  cronPopup: CronItem;
  isMobile: boolean;
  setCronPopup: React.Dispatch<React.SetStateAction<CronItem | null>>;
  setPopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function CronDetailPopup({
  cronPopup, isMobile, setCronPopup, setPopupOpen,
}: CronDetailPopupProps) {
  const NOISE_PATTERNS = ['데이터 수집중', '수집 중', '수집중', '시작합니다', '준비 중', 'START', '시작', '처리 중', '진행 중', '처리중'];
  const rawMsg = cronPopup.lastMessage || '';
  const filteredMsg = NOISE_PATTERNS.some(p => rawMsg.includes(p)) ? '' : rawMsg;
  const displayMsg = filteredMsg.length > 400 ? filteredMsg.slice(0, 397) + '…' : filteredMsg;

  const statusColor = cronPopup.status === 'success' ? '#22c55e'
    : cronPopup.status === 'failed' ? '#f85149'
    : cronPopup.status === 'running' ? '#58a6ff'
    : cronPopup.status === 'skipped' ? '#d29922' : '#6b7280';
  const statusLabel = cronPopup.status === 'success' ? '✅ 성공'
    : cronPopup.status === 'failed' ? '❌ 실패'
    : cronPopup.status === 'running' ? '🔄 실행 중'
    : cronPopup.status === 'skipped' ? '⏭ 스킵' : '⚪ 미실행';
  const priorityLabel = cronPopup.priority === 'high' ? '🔴 높음'
    : cronPopup.priority === 'low' ? '🟢 낮음' : '🟡 보통';

  // 성공률 계산 (최근 실행 이력 기반)
  const runs = cronPopup.recentRuns || [];
  const successCount = runs.filter(r => r.status === 'success').length;
  const failedCount = runs.filter(r => r.status === 'failed').length;
  const totalRuns = runs.filter(r => r.status !== 'running').length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : null;
  const rateColor = successRate === null ? '#6b7280'
    : successRate >= 80 ? '#22c55e' : successRate >= 50 ? '#d29922' : '#f85149';

  // 상대 시간 (X분 전, X시간 전)
  const timeAgo = (s: string | null): string => {
    if (!s) return '';
    try {
      const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + '+09:00');
      // eslint-disable-next-line react-hooks/purity
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return '방금 전';
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `${diffH}시간 전`;
      return `${Math.floor(diffH / 24)}일 전`;
    } catch { return ''; }
  };

  const fmtTime = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s.replace(' ', 'T') + '+09:00').toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return s; }
  };

  return (
    <div
      onClick={() => { setCronPopup(null); setPopupOpen(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(4,6,18,0.93)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(160deg, #0e1225 0%, #090c18 100%)',
          border: `1px solid ${statusColor}25`,
          borderTop: `4px solid ${statusColor}`,
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          width: isMobile ? '100%' : 460,
          maxWidth: '100%',
          maxHeight: isMobile ? '88vh' : '88vh',
          overflowY: 'auto',
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 -2px 60px ${statusColor}15, 0 32px 100px rgba(0,0,0,0.95)`,
        }}
      >
        {/* 드래그 핸들 (모바일) */}
        {isMobile && <div style={{ width: 36, height: 4, background: '#30363d', borderRadius: 2, margin: '12px auto 0' }} />}

        <div style={{ padding: isMobile ? '16px 20px 28px' : '24px 24px 28px' }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              {/* 팀 + 상태 + LLM 배지 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                  background: statusColor + '1c', color: statusColor, border: `1px solid ${statusColor}40`,
                  letterSpacing: 0.2,
                }}>{statusLabel}</span>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: 'rgba(255,255,255,0.06)', color: '#8094b0', border: '1px solid rgba(255,255,255,0.1)',
                }}>{cronPopup.teamEmoji} {cronPopup.team}</span>
                {cronPopup.hasLLM && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: '#7c3aed18', color: '#a78bfa', border: '1px solid #7c3aed30',
                  }}>🤖 LLM 호출</span>
                )}
                {cronPopup.hasScript && !cronPopup.hasLLM && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: '#06441820', color: '#34d399', border: '1px solid #06441840',
                  }}>⚡ 스크립트</span>
                )}
                {cronPopup.hasScript && cronPopup.hasLLM && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: '#1e3a5f20', color: '#60a5fa', border: '1px solid #1e3a5f40',
                  }}>🔀 하이브리드</span>
                )}
              </div>
              {/* 크론 이름 (히어로) */}
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2, color: '#edf2ff', marginBottom: 4, letterSpacing: -0.3 }}>{cronPopup.name}</div>
              <div style={{ fontSize: 10, color: '#3a4060', fontFamily: 'monospace' }}>{cronPopup.id}</div>
            </div>
            <button
              onClick={() => { setCronPopup(null); setPopupOpen(false); }}
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', color: '#8094b0',
                fontSize: 15, cursor: 'pointer', width: 36, height: 36, borderRadius: 10, marginLeft: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>

          {/* 이 크론이 하는 일 (description 히어로) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>⚙️ 역할</div>
            {(() => {
              const desc = cronPopup.description;
              // description이 없으면 ID 기반 추론 → 팀+스케줄 순서로 폴백
              const inferred = !desc ? inferCronRole(cronPopup.id) : null;
              const autoDesc = inferred ||
                [
                  cronPopup.team ? `${cronPopup.teamEmoji || ''} ${cronPopup.team} 소속 자동화 태스크.`.trim() : null,
                  cronPopup.scheduleHuman ? `${cronPopup.scheduleHuman} 일정으로 실행됩니다.` : null,
                ].filter(Boolean).join(' ') || null;
              const displayDesc = desc || autoDesc;
              const isInferred = !desc && !!displayDesc;
              return displayDesc ? (
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${statusColor}18`,
                  borderLeft: `3px solid ${statusColor}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: desc ? '#c9d1d9' : '#a3b1c6',
                  lineHeight: 1.7,
                }}>
                  {displayDesc}
                  {isInferred && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      marginTop: 8, padding: '2px 8px',
                      background: '#1e3a5f20', border: '1px solid #1e3a5f40',
                      borderRadius: 12, fontSize: 10, color: '#60a5fa',
                    }}>
                      🤖 ID 기반 추론 — tasks.json에 description 추가 시 더 정확해집니다
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 12, color: '#374151' }}>
                  설명 없음 — tasks.json에 description 필드를 추가해주세요
                </div>
              );
            })()}
          </div>

          {/* 최근 성공률 (runs 있을 때만) */}
          {successRate !== null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>📈 최근 성공률</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7280' }}>
                  <span style={{ color: '#22c55e' }}>✅ {successCount}</span>
                  <span style={{ color: failedCount > 0 ? '#f85149' : '#4b5563' }}>❌ {failedCount}</span>
                  <span style={{ fontWeight: 700, color: rateColor }}>{successRate}%</span>
                </div>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${successRate}%`,
                  background: `linear-gradient(90deg, ${rateColor}80, ${rateColor})`,
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              {/* mini run dots */}
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {runs.slice(0, 7).map((r, i) => (
                  <div key={i} title={r.status} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: r.status === 'success' ? '#22c55e' : r.status === 'failed' ? '#f85149' : r.status === 'skipped' ? '#d29922' : '#4b5563',
                    flexShrink: 0,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* 메타 정보 (2열 그리드) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {/* 스케줄 */}
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>📅 스케줄</div>
              <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{cronPopup.scheduleHuman || cronPopup.schedule || '—'}</div>
              {cronPopup.schedule && cronPopup.scheduleHuman !== cronPopup.schedule && (
                <div style={{ fontSize: 9, color: '#4b5563', fontFamily: 'monospace', marginTop: 2 }}>{cronPopup.schedule}</div>
              )}
            </div>
            {/* 마지막 실행 — 가장 중요 */}
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: cronPopup.status === 'failed' ? 'rgba(248,81,73,0.06)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${statusColor}25`,
            }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>⏱ 마지막 실행</div>
              <div style={{ fontSize: 13, color: statusColor, fontWeight: 700 }}>
                {timeAgo(cronPopup.lastRun) || '—'}
              </div>
              {cronPopup.lastRun && (
                <div style={{ fontSize: 9, color: '#4b5563', fontFamily: 'monospace', marginTop: 2 }}>
                  {fmtTime(cronPopup.lastRun)}
                </div>
              )}
            </div>
            {/* 다음 예정 */}
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>🔜 다음 예정</div>
              <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{fmtTime(cronPopup.nextRun)}</div>
              {cronPopup.nextRun && <div style={{ fontSize: 9, color: '#4b5563', fontFamily: 'monospace', marginTop: 2 }}>{timeAgo(cronPopup.nextRun).replace('전', '후')}</div>}
            </div>
            {/* 우선순위 */}
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>⚡ 우선순위</div>
              <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{priorityLabel}</div>
            </div>
          </div>

          {/* 마지막 실행 결과 — outputSummary 우선, 실패 시 강조 */}
          {(() => {
            const isFail = cronPopup.status === 'failed';
            const isSkip = cronPopup.status === 'skipped';
            const summary = cronPopup.outputSummary || displayMsg;
            const resColor = isFail ? '#f85149' : cronPopup.status === 'success' ? '#22c55e' : '#6b7280';

            if (!summary && !isFail) return null;

            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: isFail ? '#f85149' : '#6b7280' }}>
                    {isFail ? '🚨 실패 원인' : isSkip ? '⏭ 건너뜀 이유' : '📋 마지막 출력'}
                  </div>
                  {cronPopup.lastDuration && (
                    <span style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace' }}>
                      ⏱ {cronPopup.lastDuration}
                    </span>
                  )}
                </div>
                <div style={{
                  padding: '12px 14px',
                  background: isFail ? 'rgba(248,81,73,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${resColor}25`,
                  borderLeft: `3px solid ${resColor}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: isFail ? '#fca5a5' : '#9ca3af',
                  lineHeight: 1.65,
                  wordBreak: 'break-word',
                }}>
                  {summary || (isFail ? '실패 상세 정보 없음' : '출력 없음')}
                </div>
                {/* 💡 권장 조치 (실패 시) */}
                {isFail && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: '#eff6ff', border: '1px solid #3b82f640', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>💡 권장 조치</div>
                    <div style={{ fontSize: 12, color: '#4a5060', lineHeight: 1.6 }}>
                      {inferSuggestedFix(cronPopup)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 🤖 LLM 토큰 점검 (hasLLM 크론만) — 중복 섹션 제거됨, 아래 통합 섹션 하나만 유지 */}
          {cronPopup.hasLLM && (() => {
            // 최근 이력 전체에서 토큰 정보 탐색
            const allMsgs = [
              cronPopup.lastMessage,
              ...(cronPopup.recentRuns || []).map(r => r.message),
            ].filter(Boolean);
            const tokenInfos = allMsgs.map(m => detectTokenUsage(m)).filter(Boolean) as Array<{ input: number; output: number; total: number }>;
            const latest = tokenInfos[0] || null;
            const avgTotal = tokenInfos.length > 0
              ? Math.round(tokenInfos.reduce((s, t) => s + t.total, 0) / tokenInfos.length)
              : 0;
            const isHigh = avgTotal > 80_000;
            const isMid  = avgTotal > 20_000;

            if (!latest && tokenInfos.length === 0) return null; // 토큰 정보 없으면 숨김

            return (
              <div style={{
                marginBottom: 16, padding: '12px 14px',
                background: isHigh ? 'rgba(248,81,73,0.06)' : isMid ? 'rgba(210,153,34,0.06)' : '#161b22',
                border: `1px solid ${isHigh ? '#f8514940' : isMid ? '#d2992240' : '#21262d'}`,
                borderLeft: `3px solid ${isHigh ? '#f85149' : isMid ? '#d29922' : '#6366f1'}`,
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: isHigh ? '#f85149' : isMid ? '#d29922' : '#6366f1' }}>
                    🤖 LLM 토큰 사용량
                  </div>
                  {isHigh && <span style={{ fontSize: 10, color: '#f85149', fontWeight: 700 }}>⚠️ 과다 사용 의심</span>}
                </div>
                {latest ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: tokenInfos.length > 1 ? 8 : 0 }}>
                    {([
                      ['입력', latest.input.toLocaleString(), '#8b949e'],
                      ['출력', latest.output.toLocaleString(), '#a78bfa'],
                      ['합계', latest.total.toLocaleString(), isHigh ? '#f85149' : '#58a6ff'],
                    ] as [string, string, string][]).map(([lbl, val, col]) => (
                      <div key={lbl} style={{ textAlign: 'center', background: '#0d1117', borderRadius: 6, padding: '6px 4px' }}>
                        <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{val}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {tokenInfos.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
                    <span>평균 {avgTotal.toLocaleString()} 토큰 ({tokenInfos.length}회 기준)</span>
                    {latest && <span style={{ color: '#484f58' }}>추정 비용 {estimateCost(latest)}/회</span>}
                  </div>
                )}
                {latest && tokenInfos.length <= 1 && (
                  <div style={{ fontSize: 11, color: '#484f58' }}>추정 비용 {estimateCost(latest)}/회</div>
                )}
              </div>
            );
          })()}

          {/* 실행 이력 (최근 7건) */}
          {cronPopup.recentRuns && cronPopup.recentRuns.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>📊 실행 이력</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cronPopup.recentRuns.slice(0, 7).map((run, ri) => {
                  const rc = run.status === 'success' ? '#22c55e'
                    : run.status === 'failed' ? '#f85149'
                    : run.status === 'running' ? '#58a6ff'
                    : '#6b7280';
                  const rl = run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'skipped' ? '⏭' : '🔄';
                  const NOISE_P = ['데이터 수집중','수집 중','수집중','시작합니다','준비 중','START','처리 중','진행 중'];
                  // 노이즈 제거 후 전체 메시지 표시 (절단 없음)
                  const rawMsg2 = run.message
                    .replace(/\b(SUCCESS|DONE|STARTED?|RUNNING)\b/gi, '').replace(/\(duration=\d+s\)/gi, '').trim();
                  const rmsg = NOISE_P.some(p => run.message.includes(p)) ? '' : rawMsg2;
                  return (
                    <div key={ri} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
                      background: `linear-gradient(135deg, ${rc}08 0%, rgba(255,255,255,0.02) 100%)`,
                      border: `1px solid ${rc}18`,
                      borderLeft: `2px solid ${rc}aa`, borderRadius: 9,
                    }}>
                      <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{rl}</span>
                      <span style={{ fontSize: 10, color: '#3a4060', fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }}>
                        {run.timestamp.slice(5, 16)}
                      </span>
                      {rmsg && <span style={{ fontSize: 10, color: '#5a6890', flex: 1, wordBreak: 'break-word', lineHeight: 1.5 }}>{rmsg}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 딥 정보 + CEO 액션 섹션 (encyclopedia 기반) ── */}
          {(() => {
            const deep = getCronDeepInfo(cronPopup.id);
            const actions = filterCeoActionsForStatus(deep.ceoActions, cronPopup.status, cronPopup.lastRun);
            return (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                    📖 뭐하는 놈인지 ({deep.emoji} {deep.category})
                  </div>
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(99,102,241,0.05)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#c9d1d9',
                    lineHeight: 1.7,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>하는 일</div>
                    <ul style={{ paddingLeft: 16, margin: 0, marginBottom: 10 }}>
                      {deep.whatItDoes.map((w, i) => (
                        <li key={i} style={{ marginBottom: 3 }}>{w}</li>
                      ))}
                    </ul>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>언제 유용한지</div>
                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                      {deep.whenUseful.map((w, i) => (
                        <li key={i} style={{ marginBottom: 3 }}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* CEO 액션 가이드 */}
                {actions.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                      🧭 CEO가 지금 할 수 있는 일
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {actions.map((a, i) => (
                        <CeoActionRow key={i} action={a} cronId={cronPopup.id} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* 크론 제어 + 로그 */}
          <CronControlBar cronId={cronPopup.id} isDisabled={!!cronPopup.disabled} />

          {/* 액션 버튼 바 */}
          <ActionBar cronId={cronPopup.id} status={cronPopup.status} statusColor={statusColor}
            lastMessage={cronPopup.lastMessage} outputSummary={cronPopup.outputSummary}
            onClose={() => { setCronPopup(null); setPopupOpen(false); }} />
        </div>
      </div>
    </div>
  );
}

/* ── CEO 액션 한 줄: copy 버튼이 있으면 복사 기능 ── */
function CeoActionRow({ action, cronId }: { action: CeoAction; cronId: string }) {
  const [copied, setCopied] = useState(false);
  const target = action.target ? action.target.replace('__ID__', cronId) : '';

  const handleCopy = () => {
    if (action.kind !== 'copy' || !target) return;
    navigator.clipboard.writeText(target).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const bg = action.kind === 'copy' ? 'rgba(34,197,94,0.06)' : action.kind === 'link' ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.03)';
  const border = action.kind === 'copy' ? 'rgba(34,197,94,0.25)' : action.kind === 'link' ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)';
  const accent = action.kind === 'copy' ? '#22c55e' : action.kind === 'link' ? '#60a5fa' : '#8094b0';

  return (
    <div style={{
      padding: '10px 12px',
      background: bg,
      border: `1px solid ${border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e6edf3', flex: 1 }}>{action.label}</span>
        {action.kind === 'copy' && target && (
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#22c55e' : 'transparent',
              border: `1px solid ${copied ? '#22c55e' : 'rgba(34,197,94,0.4)'}`,
              color: copied ? '#0a0e1c' : '#22c55e',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '3px 8px',
              borderRadius: 6,
            }}
          >
            {copied ? '✓ 복사됨' : '📋 복사'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#8094b0', lineHeight: 1.5 }}>{action.description}</div>
      {action.kind === 'copy' && target && (
        <code style={{
          fontSize: 10, color: '#6b7280', fontFamily: 'monospace',
          padding: '4px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 4,
          wordBreak: 'break-all', marginTop: 2,
        }}>{target}</code>
      )}
    </div>
  );
}

/* ── 하단 액션 버튼 바 + 상세 재실행 결과 ── */

interface RetryAltAction {
  label: string;
  command?: string;
  description: string;
}

interface RetryFullResponse {
  success: boolean;
  message: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  logPath?: string;
  logTailLines?: number;
  runnerCommand?: string;
  alternativeActions?: RetryAltAction[];
  promptPreview?: string;
  durationMs?: number;
}

function ActionBar({ cronId, status, statusColor, lastMessage, outputSummary, onClose }: {
  cronId: string; status: string; statusColor: string;
  lastMessage: string; outputSummary: string;
  onClose: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<RetryFullResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 1600);
  };

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await fetch('/api/crons/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronId }),
      });
      const data = (await res.json()) as RetryFullResponse;
      setRetryResult(data);
    } catch (e) {
      setRetryResult({ success: false, message: `요청 실패: ${String(e)}` });
    } finally {
      setRetrying(false);
    }
  };

  const handleCopyLog = () => {
    const text = [lastMessage, outputSummary].filter(Boolean).join('\n---\n');
    navigator.clipboard.writeText(text || '(로그 없음)');
    showToast('로그가 클립보드에 복사됨');
  };

  const copyText = (s: string, label = '복사됨') => {
    navigator.clipboard.writeText(s);
    showToast(label);
  };

  return (
    <div>
      {toast && (
        <div style={{
          marginBottom: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11,
          background: 'rgba(34,197,94,0.1)', color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.3)', textAlign: 'center',
        }}>✓ {toast}</div>
      )}

      {/* 재실행 결과 상세 — 새 응답 포맷 */}
      {retryResult && (
        <RetryResultCard result={retryResult} onCopy={copyText} />
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleRetry}
          disabled={retrying || status === 'running'}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700, border: 'none',
            background: statusColor, color: '#fff',
            opacity: (retrying || status === 'running') ? 0.5 : 1,
          }}
        >{retrying ? '⏳ 실행 중...' : '🔄 재실행'}</button>
        <button
          onClick={handleCopyLog}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: '#f5f6f8', border: '1px solid #e0e4ea', color: '#4a5060',
          }}
        >📋 로그 복사</button>
        <button
          onClick={onClose}
          style={{
            padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: 'transparent', border: '1px solid #e0e4ea', color: '#6b7280',
          }}
        >닫기</button>
      </div>
    </div>
  );
}

/* ── 재실행 결과 상세 카드 — 성공/실패/LLM 3가지 변형 ── */
function RetryResultCard({ result, onCopy }: { result: RetryFullResponse; onCopy: (s: string, label?: string) => void }) {
  const [showStdout, setShowStdout] = useState(false);
  const [showStderr, setShowStderr] = useState(true);
  const ok = result.success;
  const accent = ok ? '#22c55e' : '#f85149';
  const bg = ok ? 'rgba(34,197,94,0.07)' : 'rgba(248,81,73,0.07)';

  return (
    <div style={{
      marginBottom: 12,
      padding: '12px 14px',
      background: bg,
      border: `1px solid ${accent}40`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {ok ? '✅' : '❌'} {result.message}
        </span>
        {typeof result.exitCode === 'number' && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
            color: accent, background: 'rgba(0,0,0,0.25)',
            padding: '2px 6px', borderRadius: 4, fontWeight: 700,
          }}>
            exit {result.exitCode}
          </span>
        )}
      </div>

      {/* LLM 태스크 — 프롬프트 프리뷰 */}
      {result.promptPreview && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, marginBottom: 4 }}>📝 프롬프트 프리뷰</div>
          <div style={{
            fontSize: 11, color: '#a3b1c6', lineHeight: 1.5,
            padding: '8px 10px', background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{result.promptPreview}</div>
        </div>
      )}

      {/* stderr (실패 시 펼침 기본) */}
      {result.stderr && (
        <details open={showStderr} onToggle={e => setShowStderr((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 10, color: '#f85149', fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>
            🚨 stderr ({result.stderr.length.toLocaleString()} chars)
          </summary>
          <pre style={{
            fontSize: 10, color: '#fca5a5', lineHeight: 1.5,
            padding: '8px 10px', background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(248,81,73,0.2)', borderRadius: 6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 160, overflowY: 'auto', margin: 0, fontFamily: 'ui-monospace, monospace',
          }}>{result.stderr}</pre>
        </details>
      )}

      {/* stdout (기본 접힘) */}
      {result.stdout && result.stdout !== '(stdout 없음)' && (
        <details open={showStdout} onToggle={e => setShowStdout((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 10, color: '#8094b0', fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>
            📤 stdout ({result.stdout.length.toLocaleString()} chars)
          </summary>
          <pre style={{
            fontSize: 10, color: '#9ca3af', lineHeight: 1.5,
            padding: '8px 10px', background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 160, overflowY: 'auto', margin: 0, fontFamily: 'ui-monospace, monospace',
          }}>{result.stdout}</pre>
        </details>
      )}

      {/* 로그 파일 경로 */}
      {result.logPath && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>📁 로그 파일</span>
          <code style={{
            flex: 1, fontSize: 10, color: '#8094b0', fontFamily: 'monospace',
            padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{result.logPath}</code>
          <button
            onClick={() => onCopy(`tail -n 50 "${result.logPath}"`, 'tail 커맨드 복사됨')}
            style={{
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: '#8094b0', padding: '3px 8px', borderRadius: 4,
            }}
          >tail 복사</button>
        </div>
      )}

      {/* 대체 액션 */}
      {result.alternativeActions && result.alternativeActions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, marginBottom: 6 }}>
            🛠 다음에 해볼 수 있는 것들
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.alternativeActions.map((a, i) => (
              <div key={i} style={{
                padding: '7px 9px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c9d1d9', flex: 1 }}>{a.label}</span>
                  {a.command && (
                    <button
                      onClick={() => onCopy(a.command!, '커맨드 복사됨')}
                      style={{
                        fontSize: 9, fontWeight: 700, cursor: 'pointer',
                        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                        color: '#22c55e', padding: '2px 6px', borderRadius: 4,
                      }}
                    >📋 복사</button>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>{a.description}</div>
                {a.command && (
                  <code style={{
                    display: 'block', marginTop: 3,
                    fontSize: 9, color: '#4a5370', fontFamily: 'monospace',
                    padding: '3px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: 3,
                    wordBreak: 'break-all',
                  }}>{a.command}</code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 크론 제어 바: 활성화/비활성화 토글 + 로그 보기 ──
function CronControlBar({ cronId, isDisabled }: { cronId: string; isDisabled: boolean }) {
  const [enabled, setEnabled] = React.useState(!isDisabled);
  const [toggling, setToggling] = React.useState(false);
  const [showLogs, setShowLogs] = React.useState(false);
  const [logs, setLogs] = React.useState<Array<{ title: string; content: string }> | null>(null);
  const [loadingLogs, setLoadingLogs] = React.useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch(`/api/crons/${cronId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setEnabled(!enabled);
      }
    } catch { /* ignore */ }
    setToggling(false);
  };

  const handleLoadLogs = async () => {
    if (showLogs) { setShowLogs(false); return; }
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/crons/${cronId}/logs?lines=80`);
      const data = await res.json();
      setLogs(data.sections || []);
      setShowLogs(true);
    } catch { setLogs([{ title: '오류', content: '로그를 불러올 수 없습니다.' }]); setShowLogs(true); }
    setLoadingLogs(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* 활성화/비활성화 토글 */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: toggling ? 'wait' : 'pointer',
            background: enabled ? 'rgba(34,197,94,0.12)' : 'rgba(248,81,73,0.12)',
            border: `1px solid ${enabled ? '#22c55e40' : '#f8514940'}`,
            color: enabled ? '#22c55e' : '#f85149',
            transition: 'all 0.2s',
          }}
        >
          {toggling ? '⏳ 변경 중...' : enabled ? '✅ 활성화됨 — 클릭하여 비활성화' : '⛔ 비활성화됨 — 클릭하여 활성화'}
        </button>
        {/* 로그 보기 */}
        <button
          onClick={handleLoadLogs}
          disabled={loadingLogs}
          style={{
            padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: loadingLogs ? 'wait' : 'pointer',
            background: showLogs ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${showLogs ? '#60a5fa40' : 'rgba(255,255,255,0.1)'}`,
            color: showLogs ? '#60a5fa' : '#8094b0',
            whiteSpace: 'nowrap',
          }}
        >
          {loadingLogs ? '⏳' : '📋'} 로그
        </button>
      </div>
      {/* 로그 표시 영역 */}
      {showLogs && logs && (
        <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
          {logs.map((section, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{section.title}</div>
              <pre style={{
                fontSize: 11, color: '#8b949e', background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
                padding: '10px 12px', overflowX: 'auto', whiteSpace: 'pre-wrap',
                maxHeight: 200, lineHeight: 1.5,
              }}>{section.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
