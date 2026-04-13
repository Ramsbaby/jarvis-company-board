'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Metric detail drill-down modal
   Supported metric types:
     disk / memory / cpu — Mac Mini 리소스
     claude-5h / claude-7d / claude-sonnet — Claude 구독 사용량
     cron-rate — 24시간 크론 성공률
   각 타입별로 "이게 뭔지 + 기준 + 현재 해석 + 권장 조치" 제공.
   ═══════════════════════════════════════════════════════════════════ */
import React from 'react';

export type MetricType = 'disk' | 'memory' | 'cpu' | 'claude-5h' | 'claude-7d' | 'claude-sonnet' | 'cron-rate';

interface MetricDetailModalProps {
  metric: { label: string; value: number; color: string; icon: string; type: MetricType; tooltip?: string };
  briefingSummary: string;
  onClose: () => void;
  isMobile: boolean;
}

interface MetricInfo {
  title: string;
  description: string;
  consumers: string[];
  thresholds: Array<{ range: string; color: string; emoji: string; label: string; advice: string }>;
  /** 사용자 질문을 유도하는 "이게 왜 중요한가" 설명 (1~2문장). */
  whyItMatters?: string;
  /** 터미널에서 바로 돌릴 수 있는 확인 커맨드 */
  verifyCommands?: Array<{ label: string; command: string }>;
}

const METRIC_INFO: Record<MetricType, MetricInfo> = {
  disk: {
    title: '디스크 사용률',
    description: 'Mac Mini의 로컬 디스크(SSD) 사용률입니다. 로그, RAG 벡터 DB, npm 캐시, Git 저장소 등이 주요 소비자입니다.',
    whyItMatters: '디스크가 90% 넘으면 RAG 인덱싱이나 로그 기록 자체가 실패하기 시작합니다. 모든 자동화의 최후 방어선입니다.',
    consumers: ['크론 로그 (~/.jarvis/logs/)', 'RAG 벡터 DB (~/.jarvis/rag/data/)', 'Git 저장소 (~/jarvis-board, ~/jarvis)', 'npm/node_modules 캐시', 'Xcode/Homebrew 캐시'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '정상', advice: '여유 있음. 별도 조치 불필요.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: 'log-cleanup 크론이 정상 동작 중인지 확인. 큰 파일 점검 필요.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '위험', advice: '즉시 정리 필요. `ncdu /` 로 대용량 파일 찾기. 오래된 로그/캐시 삭제.' },
    ],
    verifyCommands: [
      { label: '디스크 사용량 한눈에', command: 'df -h /' },
      { label: 'Top 사용자 20개', command: 'sudo du -ah / 2>/dev/null | sort -rh | head -20' },
      { label: 'Jarvis 로그 총합', command: 'du -sh ~/.jarvis/logs/' },
    ],
  },
  memory: {
    title: '메모리 사용률',
    description: '물리 메모리(RAM) 사용률입니다. macOS는 파일 캐시에 적극적으로 메모리를 쓰므로 70~80%대는 정상입니다.',
    whyItMatters: '메모리가 부족해지면 Ollama LLM 추론/Claude 빌드가 중단되고 봇이 응답을 놓칩니다.',
    consumers: ['Node.js (Discord 봇, Next.js 서버)', 'Cloudflare Tunnel (cloudflared)', 'Ollama (LLM 추론 엔진)', 'RAG 인덱서 (LanceDB)', 'macOS 파일 시스템 캐시'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '정상', advice: '여유 있음. 프로세스가 원활하게 동작 중.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: 'macOS 캐시 포함이라 70%대는 보통 정상. 85% 이상이면 프로세스 점검.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '위험', advice: '스왑 발생 가능. `top -o mem` 으로 상위 프로세스 확인. 봇/서버 재시작 고려.' },
    ],
    verifyCommands: [
      { label: '메모리 Top 10', command: 'top -l 1 -o mem -n 10 -stats pid,command,mem' },
      { label: 'Ollama 메모리', command: 'ps -e -o pid,rss,command | grep ollama | grep -v grep' },
    ],
  },
  cpu: {
    title: 'CPU 사용률',
    description: 'Mac Mini CPU 사용률입니다. 크론잡 실행 시간대(정각/30분)에 일시적으로 높아지는 것은 정상입니다.',
    whyItMatters: 'CPU가 오래 꽉 차있으면 봇 응답 지연이나 웹 대시보드 랙이 생깁니다. Ollama 추론이 가장 큰 소비자입니다.',
    consumers: ['크론잡 실행 (LLM 호출 포함)', 'Ollama 추론 (로컬 LLM)', 'Node.js 이벤트 루프', 'RAG 벡터 인덱싱', 'Next.js 빌드/렌더링'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '정상', advice: '여유 있음. 크론 동시 실행도 문제없는 수준.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: '크론 동시 실행이면 일시적일 수 있음. 지속되면 heavy 크론 스케줄 분산 필요.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '위험', advice: '지속되면 응답 지연 발생. Ollama 추론 or 무한루프 크론 의심. `top` 으로 확인.' },
    ],
    verifyCommands: [
      { label: 'CPU Top 10', command: 'top -l 1 -o cpu -n 10 -stats pid,command,cpu' },
      { label: '부하 평균 1/5/15분', command: 'uptime' },
    ],
  },
  'claude-5h': {
    title: 'Claude 5시간 한도',
    description: 'Anthropic Claude 구독 플랜의 5시간 롤링 윈도우 사용량입니다. 대형 작업(Claude Code 세션, 대량 코드 생성)에서 빠르게 차오릅니다.',
    whyItMatters: '5h 한도가 차면 해당 롤링 윈도우가 끝날 때까지 새 요청이 차단됩니다. 개인 플랜 회수는 4~5시간 뒤 자동 리셋.',
    consumers: ['Claude Code 세션 (이 대시보드 포함)', 'Jarvis 크론의 LLM 프롬프트 태스크', 'Discord 봇의 /ask 명령', 'ultraplan/ultrathink 사용'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '여유', advice: '자유롭게 사용. 큰 리팩터·리서치도 무리 없음.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: '불필요한 ultraplan 지양. 다음 큰 작업 전에 리셋 대기 여부 판단.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '임박', advice: '새 작업 보류. 리셋까지 대기하거나 /account use personal 로 계정 전환.' },
    ],
    verifyCommands: [
      { label: '사용량 캐시 직접 확인', command: 'cat ~/.claude/usage-cache.json | jq .fiveH' },
      { label: '캐시 수동 갱신', command: 'bash ~/.jarvis/scripts/update-usage-cache.sh' },
    ],
  },
  'claude-7d': {
    title: 'Claude 7일 할당량',
    description: '주간(7일) 롤링 할당량입니다. 플랜 등급(Pro/Max)에 따라 총량이 다르며, 한 번 찰 경우 실제 리셋까지 며칠이 걸릴 수 있습니다.',
    whyItMatters: '7d 한도가 차면 그 주 내내 작업에 지장이 생깁니다. 5h보다 회복이 훨씬 느립니다.',
    consumers: ['전 팀의 LLM 크론 누적 (브리핑, 리뷰, 분석)', 'Claude Code 장기 작업 세션', 'ultraplan 등 고비용 툴'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '여유', advice: '주간 페이스 양호.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: '남은 일수와 함께 계산. 큰 작업은 다음 주 리셋 대기 고려.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '임박', advice: '이번 주 남은 Claude 작업은 반드시 필수만. company 계정 리셋일 확인.' },
    ],
    verifyCommands: [
      { label: '7d 캐시 직접 확인', command: 'cat ~/.claude/usage-cache.json | jq .sevenD' },
    ],
  },
  'claude-sonnet': {
    title: 'Sonnet 모델 할당',
    description: 'Sonnet 모델(claude-sonnet-4-6)의 별도 서브 할당량입니다. Opus 와는 별개로 측정됩니다.',
    whyItMatters: 'Sonnet은 속도/비용 최적화 모델이라 Jarvis 크론 대부분이 여기서 소비됩니다. 차오르는 속도가 가장 빠름.',
    consumers: ['Jarvis 크론의 기본 모델 (대부분의 자동화)', 'Fast 모드 Claude Code 세션', '봇 응답 생성'],
    thresholds: [
      { range: '0~69%', color: '#3fb950', emoji: '🟢', label: '여유', advice: '여유 있음.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: '크론 LLM 프롬프트 수를 점검. 불필요한 고빈도 태스크 있는지 확인.' },
      { range: '90%~',   color: '#f85149', emoji: '🔴', label: '임박', advice: 'Sonnet 기반 크론이 스킵되기 시작합니다. 스케줄 축소 또는 Haiku 전환 검토.' },
    ],
    verifyCommands: [
      { label: 'Sonnet 캐시 확인', command: 'cat ~/.claude/usage-cache.json | jq .sonnet' },
    ],
  },
  'cron-rate': {
    title: '24시간 크론 성공률',
    description: '최근 24시간 동안 실행된 전체 크론잡의 성공률입니다. cron.log 파싱 기반이며, task_숫자_ 형식 임시 태스크는 제외합니다.',
    whyItMatters: '이 수치가 떨어지기 시작하면 어딘가 만성적 실패가 생겼다는 신호입니다. QA실(류태환) 감사 리포트와 cross-check 하세요.',
    consumers: ['전 팀의 크론잡 실행 결과', 'circuit-breaker 격리 대상 판단', '주간 KPI 집계'],
    thresholds: [
      { range: '90%~', color: '#3fb950', emoji: '🟢', label: '정상', advice: '문제 없음. 실패 몇 건은 retry로 처리 가능.' },
      { range: '70~89%', color: '#d29922', emoji: '🟡', label: '주의', advice: '실패 태스크를 그룹화해서 공통 원인 있는지 확인. 아래 크론센터에서 실패 탭 조회.' },
      { range: '0~69%',  color: '#f85149', emoji: '🔴', label: '위험', advice: '시스템 전반 이슈 의심. 디스크/네트워크/서킷브레이커 순서로 점검.' },
    ],
    verifyCommands: [
      { label: '실패 태스크 리스트', command: 'grep -E "FAILED|ERROR|CRITICAL" ~/.jarvis/logs/cron.log | tail -30' },
      { label: 'circuit-breaker 격리 대상', command: 'ls -la ~/.jarvis/state/circuit-breaker/' },
    ],
  },
};

/** Statusline label → MetricType 매핑 */
export function metricTypeFromLabel(label: string): MetricType | null {
  const L = label.toLowerCase().trim();
  if (L === 'disk') return 'disk';
  if (L === 'ram' || L === 'memory' || L === 'mem') return 'memory';
  if (L === 'cpu') return 'cpu';
  if (L === '5h') return 'claude-5h';
  if (L === '7d') return 'claude-7d';
  if (L === 'sonnet') return 'claude-sonnet';
  if (L.startsWith('cron')) return 'cron-rate';
  return null;
}

export default function MetricDetailModal({ metric, briefingSummary, onClose, isMobile }: MetricDetailModalProps) {
  const info = METRIC_INFO[metric.type];
  const [copied, setCopied] = React.useState<string | null>(null);

  // 현재 값이 어느 threshold에 해당하는지 계산 (range 문자열의 첫 숫자 비교)
  const currentThreshold = (() => {
    const thresholds = info.thresholds;
    // cron-rate는 역방향(높을수록 좋음)이라 특수 처리
    if (metric.type === 'cron-rate') {
      if (metric.value >= 90) return thresholds[0];
      if (metric.value >= 70) return thresholds[1];
      return thresholds[2];
    }
    // 기본: 낮을수록 좋음 (0~69 / 70~89 / 90~)
    for (let i = 0; i < thresholds.length - 1; i++) {
      const nextMin = parseInt(thresholds[i + 1].range);
      if (metric.value < nextMin) return thresholds[i];
    }
    return thresholds[thresholds.length - 1];
  })();

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(4,6,16,0.88)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : '92vw',
          maxWidth: 520,
          background: 'linear-gradient(160deg, #0e1225 0%, #090c18 100%)',
          border: `1px solid ${metric.color}33`,
          borderRadius: isMobile ? '20px 20px 0 0' : 18,
          padding: isMobile ? '24px 20px 36px' : '28px 28px',
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 24px 80px rgba(0,0,0,0.9), 0 0 40px ${metric.color}15`,
          maxHeight: isMobile ? '85dvh' : '85vh',
          overflowY: 'auto',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, color: '#8b949e', fontWeight: 600, marginBottom: 4 }}>메트릭 상세</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{metric.icon} {info.title}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)',
              color: '#8094b0', fontSize: 14, cursor: 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* 현재 값 — 큰 프로그레스 바 */}
        <div style={{
          padding: '20px 18px', borderRadius: 14, marginBottom: 20,
          background: `linear-gradient(135deg, ${metric.color}12 0%, rgba(255,255,255,0.02) 100%)`,
          border: `1px solid ${metric.color}28`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#b8c2d8', fontWeight: 600 }}>현재 값</span>
            <span style={{ fontSize: 32, fontWeight: 900, color: metric.color, letterSpacing: -1 }}>{metric.value}%</span>
          </div>
          <div style={{ height: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${metric.value}%`, borderRadius: 5,
              background: `linear-gradient(90deg, ${metric.color}70, ${metric.color})`,
              transition: 'width 0.8s ease',
            }} />
          </div>
          {metric.tooltip && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#8094b0', lineHeight: 1.5 }}>
              {metric.tooltip}
            </div>
          )}
        </div>

        {/* 왜 중요한가 */}
        {info.whyItMatters && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              💡 왜 중요한가
            </div>
            <div style={{
              fontSize: 13, color: '#e6edf3', lineHeight: 1.7,
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(255, 183, 0, 0.06)', border: '1px solid rgba(255, 183, 0, 0.2)',
            }}>{info.whyItMatters}</div>
          </div>
        )}

        {/* 설명 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            📋 설명
          </div>
          <div style={{ fontSize: 13, color: '#b8c2d8', lineHeight: 1.7 }}>{info.description}</div>
        </div>

        {/* 주요 소비자 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            📦 주요 소비자
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {info.consumers.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: '#8094b0', paddingLeft: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#4a5370' }}>•</span>
                {c}
              </div>
            ))}
          </div>
        </div>

        {/* 기준 테이블 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            📊 판단 기준
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {info.thresholds.map((t, i) => {
              const isActive = t === currentThreshold;
              return (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: isActive ? `${t.color}15` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isActive ? `${t.color}40` : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{t.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.range}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{t.label}</span>
                    {isActive && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: t.color,
                        background: `${t.color}20`, padding: '1px 6px', borderRadius: 4,
                        marginLeft: 'auto',
                      }}>현재</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{t.advice}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 터미널 확인 커맨드 */}
        {info.verifyCommands && info.verifyCommands.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              🔧 터미널에서 직접 확인
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {info.verifyCommands.map((cmd, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c9d1d9', flex: 1 }}>{cmd.label}</span>
                    <button
                      onClick={() => handleCopy(cmd.command)}
                      style={{
                        fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        background: copied === cmd.command ? '#22c55e' : 'transparent',
                        border: '1px solid rgba(34,197,94,0.4)',
                        color: copied === cmd.command ? '#0a0e1c' : '#22c55e',
                        padding: '2px 8px', borderRadius: 4,
                      }}
                    >{copied === cmd.command ? '✓ 복사됨' : '📋 복사'}</button>
                  </div>
                  <code style={{
                    display: 'block', fontSize: 10, color: '#8094b0', fontFamily: 'monospace',
                    padding: '5px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                    wordBreak: 'break-all',
                  }}>{cmd.command}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 현재 상태 분석 (briefing summary 기반 — 디스크/메모리/CPU에만) */}
        {briefingSummary && (metric.type === 'disk' || metric.type === 'memory' || metric.type === 'cpu') && (() => {
          const sentences = briefingSummary.split(/[./]/).filter(s => s.trim());
          const relevant = sentences.filter(s => {
            const lower = s.toLowerCase();
            if (metric.type === 'disk') return /디스크|disk|용량|저장/.test(lower);
            if (metric.type === 'memory') return /메모리|memory|ram|스왑/.test(lower);
            return /cpu|프로세|로드/.test(lower);
          });
          if (relevant.length === 0) return null;
          return (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                💡 현재 상태 분석
              </div>
              {relevant.map((s, i) => (
                <div key={i} style={{
                  fontSize: 12, color: '#8094b0', lineHeight: 1.6,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  marginBottom: 4,
                }}>
                  {s.trim()}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
