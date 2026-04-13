'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Cron detail popup (tile click)
   Extracted from app/company/VirtualOffice.tsx
   ═══════════════════════════════════════════════════════════════════ */
import React from 'react';
import type { CronItem } from '@/lib/map/rooms';
import { detectTokenUsage, estimateCost, inferCronRole } from '@/lib/map/cron-role';

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
              </div>
            );
          })()}

          {/* 토큰 사용량 감지 (LLM 크론 전용) */}
          {cronPopup.hasLLM && (() => {
            // lastMessage + recentRuns에서 토큰 수 추출
            const allMsgs = [cronPopup.lastMessage, ...cronPopup.recentRuns.map(r => r.message)].filter(Boolean);
            const tokenEntries: Array<{ label: string; input?: number; output?: number; total?: number }> = [];
            for (const msg of allMsgs) {
              // 패턴: input_tokens=123 output_tokens=456 / tokens: 789 / total_tokens: 123
              const inputM = msg.match(/input[_\s]tokens?[=:]\s*(\d+)/i);
              const outputM = msg.match(/output[_\s]tokens?[=:]\s*(\d+)/i);
              const totalM = msg.match(/total[_\s]tokens?[=:]\s*(\d+)/i) || msg.match(/tokens?[=:]\s*(\d+)/i);
              if (inputM || outputM || totalM) {
                tokenEntries.push({
                  label: msg === cronPopup.lastMessage ? '최근 실행' : '이전 실행',
                  input: inputM ? parseInt(inputM[1]) : undefined,
                  output: outputM ? parseInt(outputM[1]) : undefined,
                  total: totalM ? parseInt(totalM[1]) : undefined,
                });
                if (tokenEntries.length >= 3) break;
              }
            }
            if (tokenEntries.length === 0) return null;
            // 최근 total 기준 비용 추산 (Claude Sonnet 3.7: ~$3/$15 per 1M)
            const latest = tokenEntries[0];
            const inputCost = latest.input ? (latest.input / 1_000_000 * 3).toFixed(4) : null;
            const outputCost = latest.output ? (latest.output / 1_000_000 * 15).toFixed(4) : null;
            const approxCost = inputCost && outputCost
              ? `~$${(parseFloat(inputCost) + parseFloat(outputCost)).toFixed(4)}`
              : null;
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>🪙 토큰 사용량</div>
                <div style={{
                  padding: '12px 14px', background: '#0d0b1e',
                  border: '1px solid #7c3aed25', borderLeft: '3px solid #7c3aed50',
                  borderRadius: 10,
                }}>
                  {tokenEntries.map((te, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: i < tokenEntries.length - 1 ? 6 : 0 }}>
                      <span style={{ fontSize: 10, color: '#4b5563', minWidth: 60 }}>{te.label}</span>
                      {te.input !== undefined && <span style={{ fontSize: 11, color: '#a78bfa' }}>IN {te.input.toLocaleString()}</span>}
                      {te.output !== undefined && <span style={{ fontSize: 11, color: '#c4b5fd' }}>OUT {te.output.toLocaleString()}</span>}
                      {te.total !== undefined && !te.input && <span style={{ fontSize: 11, color: '#a78bfa' }}>TOTAL {te.total.toLocaleString()}</span>}
                    </div>
                  ))}
                  {approxCost && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #7c3aed20', fontSize: 11, color: '#6b7280' }}>
                      추산 비용(최근 1회) {approxCost}
                      <span style={{ color: '#374151', marginLeft: 6, fontSize: 10 }}>Sonnet 기준</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 🤖 LLM 토큰 점검 (hasLLM 크론만) */}
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

          {/* 닫기 버튼 */}
          <button
            onClick={() => { setCronPopup(null); setPopupOpen(false); }}
            style={{
              width: '100%', padding: '13px 0',
              background: `linear-gradient(135deg, ${statusColor}15, ${statusColor}08)`,
              border: `1px solid ${statusColor}35`,
              borderRadius: 10, color: statusColor,
              cursor: 'pointer', fontSize: 14, fontWeight: 700,
            }}
          >닫기</button>
        </div>
      </div>
    </div>
  );
}
